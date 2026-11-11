-- Sprint 2, migration 1C: stock sync after every catalogue load, plus overdue / dropped in-transit pieces.
-- Spec: docs/specs/2026-11-11-s2-foundation-design.md §7 (and §7a, added with Alex 11 Nov 2026). Plan Task 3.
-- Key: brand + upper(btrim(serial)). Only in_transit → in_stock is automatic; reserved / booked_out /
-- damaged / sold / not_received are never changed here. Re-running the same load changes nothing.

-- §7a: pieces that never arrive. New final state not_received (set only by resolving a review),
-- two new review kinds and their answers, and the shipment date kept on the piece.
alter table public.ops_pieces drop constraint ops_pieces_state_check;
alter table public.ops_pieces add constraint ops_pieces_state_check
  check (state in ('in_transit', 'in_stock', 'reserved', 'booked_out', 'damaged', 'sold', 'not_received'));
alter table public.ops_pieces add column shipped_on date;
drop index public.ops_pieces_live_serial;
create unique index ops_pieces_live_serial on public.ops_pieces (brand, upper(btrim(serial)))
  where state not in ('sold', 'not_received');

alter table public.ops_review drop constraint ops_review_kind_check;
alter table public.ops_review add constraint ops_review_kind_check
  check (kind in ('missing_from_export', 'serial_reused', 'ticket_conflict', 'overdue_in_transit', 'dropped_from_incoming'));
alter table public.ops_review drop constraint ops_review_resolution_check;
alter table public.ops_review add constraint ops_review_resolution_check
  check (resolution in ('sold', 'damaged', 'booked_out', 'still_in_stock', 'still_in_transit', 'not_delivered'));

-- in_transit → not_received is allowed only when a review is being resolved
create or replace function public.ops_move_state(p_piece uuid, p_state text, p_actor text, p_note text,
                                                 p_client text, p_until date, p_reason text,
                                                 p_ref_kind text, p_ref_id text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_from text; v_reason text;
begin
  select state into v_from from ops_pieces where piece_id = p_piece for update;
  if not found then raise exception 'piece % not found', p_piece; end if;

  if not ((v_from = 'in_stock' and p_state in ('reserved', 'booked_out', 'damaged'))
       or (v_from in ('reserved', 'booked_out', 'damaged') and p_state = 'in_stock')
       or (v_from = 'in_transit' and p_state = 'not_received' and p_ref_kind = 'review')) then
    raise exception 'state % → % is not allowed', v_from, p_state;
  end if;

  v_reason := coalesce(p_reason, case
    when p_state = 'reserved'   then 'reserved'
    when p_state = 'booked_out' then 'booked_out'
    when p_state = 'damaged'    then 'damaged'
    when v_from  = 'reserved'   then 'released'
    when v_from  = 'booked_out' then 'returned_from_loan'
    when v_from  = 'damaged'    then 'repaired' end);

  update ops_pieces
     set state          = p_state,
         state_since    = now(),
         hold_client_id = case when p_state in ('reserved', 'booked_out') then p_client end,
         hold_until     = case when p_state in ('reserved', 'booked_out') then p_until end,
         state_note     = case when p_state = 'in_stock' then null else p_note end,
         updated_at     = now()
   where piece_id = p_piece;

  insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor, note)
  values (p_piece, v_from, p_state, v_reason, p_ref_kind, p_ref_id, p_actor, p_note);
end $$;

-- Answers by review kind: missing / reused / conflict → sold, damaged, booked_out, still_in_stock;
-- overdue / dropped → still_in_transit (no change) or not_delivered (→ not_received).
create or replace function public.ops_resolve_review(p_review bigint, p_resolution text, p_actor text,
                                                     p_note text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_piece uuid; v_kind text; v_state text;
begin
  if not ops_has_right(p_actor, 'manage_stock') then
    raise exception 'not allowed: % lacks manage stock', p_actor;
  end if;

  select r.piece_id, r.kind into v_piece, v_kind from ops_review r
   where r.review_id = p_review and r.status = 'open' for update;
  if not found then raise exception 'review % is not open', p_review; end if;

  if p_resolution is null or p_resolution <> all (
       case when v_kind in ('overdue_in_transit', 'dropped_from_incoming')
            then array['still_in_transit', 'not_delivered']
            else array['sold', 'damaged', 'booked_out', 'still_in_stock'] end) then
    raise exception 'resolution % is not allowed for %', p_resolution, v_kind;
  end if;
  select state into v_state from ops_pieces where piece_id = v_piece for update;

  if p_resolution = 'sold' then
    if v_state <> 'sold' then raise exception 'state % → sold is not allowed', v_state; end if;
  elsif p_resolution in ('damaged', 'booked_out') and v_state <> p_resolution then
    perform ops_move_state(v_piece, p_resolution, p_actor, p_note, null, null,
                           'review_resolved', 'review', p_review::text);
  elsif p_resolution = 'not_delivered' and v_state <> 'not_received' then
    perform ops_move_state(v_piece, 'not_received', p_actor, p_note, null, null,
                           'review_resolved', 'review', p_review::text);
  end if;

  update ops_review
     set status = 'resolved', resolution = p_resolution, resolved_by = p_actor,
         resolved_at = now(), note = coalesce(p_note, note)
   where review_id = p_review;
end $$;

create function public.ops_sync_pieces(p_run bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
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

  -- 3. auto-close reviews that no longer apply: missing / dropped pieces that are back in this load,
  --    overdue pieces that have arrived
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

  -- a serial that was sold (or written off as not received) before and comes back: flagged for review
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

  -- 5. live pieces on the floor that are not in this load and have no ticket line → review (once)
  insert into ops_review(piece_id, kind, raised_run)
  select o.piece_id, 'missing_from_export', p_run
    from ops_pieces o
   where o.state in ('in_stock', 'reserved', 'booked_out', 'damaged')
     and not exists (select 1 from ops_sync_load l where l.brand = o.brand and l.k = upper(btrim(o.serial)))
     and not exists (select 1 from ops_ticket_lines t
                      where t.piece_id = o.piece_id or upper(btrim(t.serial_raw)) = upper(btrim(o.serial)))
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

  -- 7. in transit more than 60 days after shipment (or first sighting) → review once; after a
  --    "still coming" answer, again only 60 days after that answer
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
revoke execute on function public.ops_move_state(uuid, text, text, text, text, date, text, text, text) from public, anon, authenticated;
revoke execute on function public.ops_resolve_review(bigint, text, text, text) from public, anon, authenticated;
