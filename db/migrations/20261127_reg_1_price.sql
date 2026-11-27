-- One register, step 1: the retail price lives on the piece (ops_pieces.price_uzs), with a history of changes.
-- Until now the price existed only in cat_pieces, the list each Colibri load rebuilds.
--   ops_sync_pieces  from 20261115_pos_2_feeds.sql: a piece the load creates takes its first price from the load,
--                    recorded in ops_piece_changes. Pieces we already hold are not repriced here.

alter table public.ops_pieces add column price_uzs bigint;
comment on column public.ops_pieces.price_uzs is 'Retail price in UZS. Set by our tools; a Colibri load sets it only when it creates the piece.';

create table public.ops_piece_changes (
  change_id  bigserial primary key,
  piece_id   uuid not null references public.ops_pieces(piece_id) on delete cascade,
  field      text not null,
  old_value  text,
  new_value  text,
  source     text not null check (source in ('colibri_first_load','upload','colibri_review','manual')),
  actor      text not null,
  at         timestamptz not null default now()
);
create index ops_piece_changes_piece on public.ops_piece_changes(piece_id, at desc);
alter table public.ops_piece_changes enable row level security;
revoke all on table public.ops_piece_changes from public, anon, authenticated;
revoke all on sequence public.ops_piece_changes_change_id_seq from public, anon, authenticated;

-- Copies the catalogue price onto every piece that has none (the switch-over; also used by the tests).
create function public.reg_backfill_prices() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update ops_pieces o set price_uzs = x.price_uzs
    from (select distinct on (m.brand, upper(btrim(c.serial))) m.brand, upper(btrim(c.serial)) k, c.price_uzs
            from cat_pieces c join cat_variants v on v.variant_id = c.variant_id join cat_models m on m.model_id = v.model_id
           order by m.brand, upper(btrim(c.serial)), c.id desc) x
   where o.price_uzs is null and o.brand = x.brand and upper(btrim(o.serial)) = x.k and x.price_uzs is not null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.reg_backfill_prices() from public, anon, authenticated;
select public.reg_backfill_prices();

CREATE OR REPLACE FUNCTION public.ops_sync_pieces(p_run bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_arrived int := 0; v_transit int := 0; v_refreshed int := 0; v_raised int := 0; v_closed int := 0; n int;
  v_ours int := 0;
begin
  -- this load: stock first, then incoming serials that are not in stock
  create temp table ops_sync_load on commit drop as
  select distinct on (l.brand, l.k) l.*
    from (
      select m.brand, upper(btrim(p.serial)) k, btrim(p.serial) serial, m.article, m.model_id,
             p.variant_id, p.size, null::date shipped_on, 'in_stock' src, 1 pri, p.barcode, p.price_uzs
        from cat_pieces p
        join cat_variants v on v.variant_id = p.variant_id
        join cat_models   m on m.model_id   = v.model_id
      union all
      select m.brand, upper(btrim(i.serial)), btrim(i.serial), coalesce(i.article, m.article), m.model_id,
             i.variant_id, i.size, i.shipped_on, 'in_transit', 2, null::text, null::bigint
        from cat_incoming i
        left join cat_variants v on v.variant_id = i.variant_id
        join cat_models m on m.model_id = coalesce(i.model_id, v.model_id)
       where not exists (select 1 from cat_pieces s where upper(btrim(s.serial)) = upper(btrim(i.serial)))
    ) l
   order by l.brand, l.k, l.pri;

  -- 1. in transit, now in stock → arrived
  with moved as (
    update ops_pieces o set state = 'in_stock', state_since = now(), updated_at = now()
      from ops_sync_load l
     where o.state = 'in_transit' and l.src = 'in_stock'
       and o.brand = l.brand and upper(btrim(o.serial)) = l.k
    returning o.piece_id)
  insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor)
  select piece_id, 'in_transit', 'in_stock', 'arrived', 'cat_run', p_run::text, 'catalogue load' from moved;
  get diagnostics v_arrived = row_count;

  -- 2. refresh every live piece in this load (never its state)
  update ops_pieces o
     set article = l.article, model_id = l.model_id, variant_id = l.variant_id, size = l.size,
         shipped_on = coalesce(l.shipped_on, o.shipped_on), barcode = coalesce(l.barcode, o.barcode),
         last_seen_run = p_run, last_seen_at = now()
    from ops_sync_load l
   where o.state not in ('sold', 'not_received') and o.brand = l.brand and upper(btrim(o.serial)) = l.k;
  get diagnostics v_refreshed = row_count;

  -- 3. auto-close reviews that no longer apply
  update ops_review r
     set status = 'auto_closed', resolved_at = now(), resolved_by = 'catalogue load'
    from ops_pieces o
   where r.piece_id = o.piece_id and r.status = 'open'
     and o.state not in ('sold', 'not_received')
     and ((r.kind in ('missing_from_export', 'dropped_from_incoming')
           and exists (select 1 from ops_sync_load l where l.brand = o.brand and l.k = upper(btrim(o.serial))))
       or (r.kind = 'overdue_in_transit' and o.state <> 'in_transit'));
  get diagnostics v_closed = row_count;

  -- 4. new pieces (no live piece with this brand + serial)
  -- a loaded serial whose piece the Delardi sales tool sold (and no live piece holds it): not created, not re-opened
  create temp table ops_sync_ours on commit drop as
  select distinct on (l.brand, l.k) l.brand, l.k, l.serial, o.piece_id, t.ticket_no
    from ops_sync_load l
    join ops_pieces o on o.state = 'sold' and o.brand = l.brand and upper(btrim(o.serial)) = l.k
    join ops_ticket_lines tl on tl.line_id = o.sold_line_id
    join ops_tickets t on t.ticket_id = tl.ticket_id and t.source = 'delardi'
   where not exists (select 1 from ops_pieces x
                      where x.state not in ('sold', 'not_received') and x.brand = l.brand and upper(btrim(x.serial)) = l.k)
   order by l.brand, l.k, o.state_since desc nulls last;
  v_ours := (select count(*) from ops_sync_ours);
  insert into ops_review(piece_id, kind, raised_run, note)
  select u.piece_id, 'ticket_conflict', p_run, format('serial %s is in the stock load but was sold on %s', u.serial, u.ticket_no)
    from ops_sync_ours u
   where not exists (select 1 from ops_review r where r.piece_id = u.piece_id and r.kind = 'ticket_conflict' and r.status = 'open');
  get diagnostics n = row_count;
  v_raised := v_raised + n;

  create temp table ops_sync_new on commit drop as
  select l.* from ops_sync_load l
   where not exists (select 1 from ops_pieces o
                      where o.state not in ('sold', 'not_received') and o.brand = l.brand and upper(btrim(o.serial)) = l.k)
     and not exists (select 1 from ops_sync_ours u where u.brand = l.brand and u.k = l.k);
  v_raised := v_raised + (select count(*) from ops_sync_new l
                           where exists (select 1 from ops_pieces o where o.state in ('sold', 'not_received')
                                            and o.brand = l.brand and upper(btrim(o.serial)) = l.k));
  with ins as (
    insert into ops_pieces(store_id, brand, serial, article, model_id, variant_id, size, state, shipped_on,
                           last_seen_run, last_seen_at, barcode, price_uzs)
    select 1, brand, serial, article, model_id, variant_id, size, src, shipped_on, p_run, now(), barcode, price_uzs from ops_sync_new
    returning piece_id, state, brand, serial, price_uzs)
  , pr as (
    -- the first price of a new piece comes from Colibri; after that only our tools change it
    insert into ops_piece_changes(piece_id, field, old_value, new_value, source, actor)
    select piece_id, 'price', null, price_uzs::text, 'colibri_first_load', 'catalogue load' from ins where price_uzs is not null
    returning piece_id)
  , ev as (
    insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor)
    select piece_id, null, state, case when state = 'in_stock' then 'arrived' else 'initial_load' end,
           'cat_run', p_run::text, 'catalogue load' from ins
    returning piece_id)
  insert into ops_review(piece_id, kind, raised_run, note)
  select i.piece_id, 'serial_reused', p_run, 'serial was sold or not received before'
    from ins i
   where exists (select 1 from ops_pieces o where o.state in ('sold', 'not_received') and o.brand = i.brand
                                              and upper(btrim(o.serial)) = upper(btrim(i.serial)));
  v_arrived := v_arrived + (select count(*) from ops_sync_new where src = 'in_stock');
  v_transit := (select count(*) from ops_sync_new where src = 'in_transit');

  -- 5. live pieces on the floor not in this load and held by no ticket line → review (once)
  insert into ops_review(piece_id, kind, raised_run)
  select o.piece_id, 'missing_from_export', p_run
    from ops_pieces o
   where o.state in ('in_stock', 'reserved', 'booked_out', 'damaged')
     and not exists (select 1 from ops_sync_load l where l.brand = o.brand and l.k = upper(btrim(o.serial)))
     and not exists (select 1 from ops_ticket_lines t where t.piece_id = o.piece_id)
     and not exists (select 1 from ops_review r
                      where r.piece_id = o.piece_id and r.kind = 'missing_from_export' and r.status = 'open');
  get diagnostics n = row_count;
  v_raised := v_raised + n;

  -- 6. in transit but gone from the incoming list without arriving → review (once)
  insert into ops_review(piece_id, kind, raised_run)
  select o.piece_id, 'dropped_from_incoming', p_run
    from ops_pieces o
   where o.state = 'in_transit'
     and not exists (select 1 from ops_sync_load l where l.brand = o.brand and l.k = upper(btrim(o.serial)))
     and not exists (select 1 from ops_review r
                      where r.piece_id = o.piece_id and r.kind = 'dropped_from_incoming' and r.status = 'open');
  get diagnostics n = row_count;
  v_raised := v_raised + n;

  -- 7. in transit > 60 days after shipment (or first sighting) → review; after "still coming", 60 days after the answer
  insert into ops_review(piece_id, kind, raised_run)
  select o.piece_id, 'overdue_in_transit', p_run
    from ops_pieces o
   where o.state = 'in_transit'
     and coalesce(o.shipped_on, o.first_seen_at::date) < current_date - 60
     and not exists (select 1 from ops_review r
                      where r.piece_id = o.piece_id and r.kind in ('overdue_in_transit', 'dropped_from_incoming')
                        and (r.status = 'open' or r.resolved_at > now() - interval '60 days'));
  get diagnostics n = row_count;
  v_raised := v_raised + n;

  drop table ops_sync_load;
  drop table ops_sync_new;
  drop table ops_sync_ours;
  return jsonb_build_object('arrived', v_arrived, 'in_transit', v_transit, 'refreshed', v_refreshed,
                            'review_raised', v_raised, 'review_closed', v_closed,
                            'sold_by_us_in_load', v_ours);
end $$;

revoke execute on function public.ops_sync_pieces(bigint) from public, anon, authenticated;
