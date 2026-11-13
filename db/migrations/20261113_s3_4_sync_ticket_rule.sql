-- Sprint 3, migration 4: stock sync "missing from export" check (Sprint 2 ops_sync_pieces, step 5).
-- Before: a live piece absent from the catalogue load was skipped when ANY ticket line had the same serial text,
-- so a serial on an old (historical) sale switched the check off for good (final review I2, spec decision 4).
-- Now: skipped only when a ticket line holds that piece (piece_id). Body copied from db/schema.sql; only that
-- condition differs.

CREATE OR REPLACE FUNCTION public.ops_sync_pieces(p_run bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_arrived int := 0; v_transit int := 0; v_refreshed int := 0; v_raised int := 0; v_closed int := 0; n int;
begin
  -- this load: stock first, then incoming serials that are not in stock
  create temp table ops_sync_load on commit drop as
  select distinct on (l.brand, l.k) l.*
    from (
      select m.brand, upper(btrim(p.serial)) k, btrim(p.serial) serial, m.article, m.model_id,
             p.variant_id, p.size, null::date shipped_on, 'in_stock' src, 1 pri
        from cat_pieces p
        join cat_variants v on v.variant_id = p.variant_id
        join cat_models   m on m.model_id   = v.model_id
      union all
      select m.brand, upper(btrim(i.serial)), btrim(i.serial), coalesce(i.article, m.article), m.model_id,
             i.variant_id, i.size, i.shipped_on, 'in_transit', 2
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
         shipped_on = coalesce(l.shipped_on, o.shipped_on),
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
  create temp table ops_sync_new on commit drop as
  select l.* from ops_sync_load l
   where not exists (select 1 from ops_pieces o
                      where o.state not in ('sold', 'not_received') and o.brand = l.brand and upper(btrim(o.serial)) = l.k);
  v_raised := v_raised + (select count(*) from ops_sync_new l
                           where exists (select 1 from ops_pieces o where o.state in ('sold', 'not_received')
                                            and o.brand = l.brand and upper(btrim(o.serial)) = l.k));
  with ins as (
    insert into ops_pieces(store_id, brand, serial, article, model_id, variant_id, size, state, shipped_on,
                           last_seen_run, last_seen_at)
    select 1, brand, serial, article, model_id, variant_id, size, src, shipped_on, p_run, now() from ops_sync_new
    returning piece_id, state, brand, serial)
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
  return jsonb_build_object('arrived', v_arrived, 'in_transit', v_transit, 'refreshed', v_refreshed,
                            'review_raised', v_raised, 'review_closed', v_closed);
end $$;

revoke execute on function public.ops_sync_pieces(bigint) from public, anon, authenticated;
