-- Sprint 2, migration 1B: manage-stock right, manual state changes, review resolution, initial fill.
-- Spec: docs/specs/2026-11-11-s2-foundation-design.md §5, §6. Plan Task 2.

-- Does this active user hold the named right? Unknown rights and unknown or inactive users get false.
create function public.ops_has_right(p_actor text, p_right text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case p_right when 'manage_stock' then u.can_manage_stock else false end
      from board_users u
     where u.name = p_actor and u.active
     limit 1), false);
$$;

-- Internal: move one piece between the manual states and write its event. No rights check here;
-- callers check. Allowed: in_stock -> reserved | booked_out | damaged, and each of those back to in_stock.
create function public.ops_move_state(p_piece uuid, p_state text, p_actor text, p_note text,
                                      p_client text, p_until date, p_reason text,
                                      p_ref_kind text, p_ref_id text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_from text; v_reason text;
begin
  select state into v_from from ops_pieces where piece_id = p_piece for update;
  if not found then raise exception 'piece % not found', p_piece; end if;

  if not ((v_from = 'in_stock' and p_state in ('reserved', 'booked_out', 'damaged'))
       or (v_from in ('reserved', 'booked_out', 'damaged') and p_state = 'in_stock')) then
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

-- Manual state change from the floor (reserve, book out, mark damaged, and back).
create function public.ops_set_state(p_piece uuid, p_state text, p_actor text, p_note text default null,
                                     p_client text default null, p_until date default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not ops_has_right(p_actor, 'manage_stock') then
    raise exception 'not allowed: % lacks manage stock', p_actor;
  end if;
  perform ops_move_state(p_piece, p_state, p_actor, p_note, p_client, p_until, null, 'manual', null);
end $$;

-- Close an open review item. damaged / booked_out move the piece; still_in_stock changes nothing;
-- sold is accepted only when the piece is already sold (a sale is never typed in by hand).
create function public.ops_resolve_review(p_review bigint, p_resolution text, p_actor text,
                                          p_note text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_piece uuid; v_state text;
begin
  if not ops_has_right(p_actor, 'manage_stock') then
    raise exception 'not allowed: % lacks manage stock', p_actor;
  end if;
  if p_resolution is null or p_resolution not in ('sold', 'damaged', 'booked_out', 'still_in_stock') then
    raise exception 'resolution % is not allowed', p_resolution;
  end if;

  select r.piece_id into v_piece from ops_review r where r.review_id = p_review and r.status = 'open' for update;
  if not found then raise exception 'review % is not open', p_review; end if;
  select state into v_state from ops_pieces where piece_id = v_piece for update;

  if p_resolution = 'sold' then
    if v_state <> 'sold' then raise exception 'state % → sold is not allowed', v_state; end if;
  elsif p_resolution in ('damaged', 'booked_out') and v_state <> p_resolution then
    perform ops_move_state(v_piece, p_resolution, p_actor, p_note, null, null,
                           'review_resolved', 'review', p_review::text);
  end if;

  update ops_review
     set status = 'resolved', resolution = p_resolution, resolved_by = p_actor,
         resolved_at = now(), note = coalesce(p_note, note)
   where review_id = p_review;
end $$;

-- One-off: create the piece register from today's catalogue (in stock) and incoming list (in transit).
create function public.ops_initial_fill(p_actor text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_run bigint; v_stock int; v_transit int;
begin
  if not ops_has_right(p_actor, 'manage_stock') then
    raise exception 'not allowed: % lacks manage stock', p_actor;
  end if;
  if exists (select 1 from ops_pieces) then raise exception 'initial fill already done'; end if;

  select max(id) into v_run from cat_import_runs;

  insert into ops_pieces(store_id, brand, serial, article, model_id, variant_id, size, state, last_seen_run, last_seen_at)
  select 1, m.brand, btrim(p.serial), m.article, m.model_id, p.variant_id, p.size, 'in_stock', p.import_run, now()
    from cat_pieces p
    join cat_variants v on v.variant_id = p.variant_id
    join cat_models   m on m.model_id   = v.model_id;
  get diagnostics v_stock = row_count;

  insert into ops_pieces(store_id, brand, serial, article, model_id, variant_id, size, state)
  select 1, m.brand, btrim(i.serial), coalesce(i.article, m.article), m.model_id, i.variant_id, i.size, 'in_transit'
    from cat_incoming i
    left join cat_variants v on v.variant_id = i.variant_id
    join cat_models m on m.model_id = coalesce(i.model_id, v.model_id)
   where not exists (select 1 from cat_pieces s where upper(btrim(s.serial)) = upper(btrim(i.serial)));
  get diagnostics v_transit = row_count;

  insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor)
  select piece_id, null, state, 'initial_load', 'cat_run', v_run::text, p_actor from ops_pieces;

  return jsonb_build_object('in_stock', v_stock, 'in_transit', v_transit);
end $$;

revoke execute on function public.ops_has_right(text, text) from public, anon, authenticated;
revoke execute on function public.ops_move_state(uuid, text, text, text, text, date, text, text, text) from public, anon, authenticated;
revoke execute on function public.ops_set_state(uuid, text, text, text, text, date) from public, anon, authenticated;
revoke execute on function public.ops_resolve_review(bigint, text, text, text) from public, anon, authenticated;
revoke execute on function public.ops_initial_fill(text) from public, anon, authenticated;
