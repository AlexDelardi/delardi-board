-- POS 4: suspend, list and cancel suspended sales; void a posted sale; clear training.
-- Only the sales-api edge function (service role) calls these; nothing is reachable from the API roles.

-- A suspended line may have no price yet; its discount is stored as precisely as a posted line (numeric(6,4)).
alter table public.pos_draft_lines alter column price_uzs drop not null;
alter table public.pos_draft_lines alter column discount_pct type numeric(6,4);

-- A void puts the piece back in stock with the reason in its history: reason 'void: <reason>', ref_kind 'ticket'.
alter table public.ops_piece_events drop constraint ops_piece_events_reason_check;
alter table public.ops_piece_events add constraint ops_piece_events_reason_check
  check (reason = any (array['initial_load', 'arrived', 'sold', 'refunded', 'reserved', 'released', 'booked_out',
                             'returned_from_loan', 'damaged', 'repaired', 'review_resolved', 'serial_reused'])
         or reason like 'void: %');
alter table public.ops_piece_events drop constraint ops_piece_events_ref_kind_check;
alter table public.ops_piece_events add constraint ops_piece_events_ref_kind_check
  check (ref_kind = any (array['cat_run', 'ticket_line', 'review', 'manual', 'ticket']));

-- Seller label → Colibri source_name (a label must match exactly one current rep). Same message as pos_post_sale.
create function public.pos_rep_source(p_label text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_src text; n int;
begin
  select min(source_name), count(*) into v_src, n from crm_sales_reps where label = btrim(p_label) and active;
  if n <> 1 then raise exception 'choose a seller: % is not a current sales rep', btrim(p_label); end if;
  return v_src;
end $$;
revoke execute on function public.pos_rep_source(text) from public, anon, authenticated;

-- Suspend a sale (new, or replacing the lines of p.draft_id). Same shape as pos_post_sale without payments.
-- Client, walk-in and seller may still be open; whatever is given must be valid. A line may have no price yet.
-- The pieces are locked in piece_id order (as pos_post_sale does) and checked under the lock, so a suspend
-- racing a post can never leave a draft holding a sold piece.
create function public.pos_suspend(p jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_mode   text;
  v_lines  jsonb := case when jsonb_typeof(p->'lines') = 'array' then p->'lines' else '[]'::jsonb end;
  v_client text := nullif(btrim(p->>'client_id'), '');
  v_walk   boolean := coalesce((p->>'walk_in')::boolean, false);
  v_draft  bigint := nullif(btrim(p->>'draft_id'), '')::bigint;
  v_seller text;
  v_srcs   text[] := '{}';
  l        jsonb;
  v_price  numeric;
  v_disc   numeric;
  pc       record;
  v_held   bigint;
  i        int;
begin
  -- shape
  if jsonb_array_length(v_lines) = 0 then raise exception 'no lines'; end if;
  if exists (select 1 from jsonb_array_elements(v_lines) e where nullif(e->>'piece_id', '') is null) then
    raise exception 'no lines: a line has no piece';
  end if;
  if (select count(distinct (e->>'piece_id')::uuid) from jsonb_array_elements(v_lines) e) <> jsonb_array_length(v_lines) then
    raise exception 'piece listed twice';
  end if;
  if v_client is not null and v_walk then raise exception 'choose a client or walk-in'; end if;
  if v_client is not null and not exists (select 1 from crm_clients where client_id = v_client
                                                                       and record_state not in ('merged', 'deleted')) then
    raise exception 'choose a client or walk-in: client % not found', v_client;
  end if;

  -- sellers (optional while suspended)
  if nullif(btrim(p->>'seller'), '') is not null then v_seller := pos_rep_source(p->>'seller'); end if;
  for l in select e from jsonb_array_elements(v_lines) e loop
    v_srcs := v_srcs || case when nullif(btrim(l->>'seller'), '') is not null then pos_rep_source(l->>'seller') end;
  end loop;

  -- prices (optional) and discounts, as pos_post_sale checks them
  for l in select e from jsonb_array_elements(v_lines) e loop
    v_disc := coalesce((l->>'discount_pct')::numeric, 0);
    if v_disc < 0 or v_disc >= 100 then raise exception 'discount must be 0 to 100, and below 100'; end if;
    if v_disc <> round(v_disc, 4) then raise exception 'discount must be 0 to 100 with at most 4 decimals'; end if;
    v_price := (l->>'price_uzs')::numeric;
    if v_price is not null and (v_price <= 0 or v_price <> trunc(v_price)) then
      raise exception 'price must be positive whole so''m';
    end if;
  end loop;

  -- mode (held steady against a switch)
  select mode into v_mode from pos_settings where id = 1 for share;

  -- pieces: locked in piece_id order, then checked under the lock; the draft row after them,
  -- the same order as pos_post_sale (pieces, then deleting its draft), so the two cannot deadlock
  perform 1 from ops_pieces
   where piece_id in (select (e->>'piece_id')::uuid from jsonb_array_elements(v_lines) e)
   order by piece_id for update;
  if v_draft is not null then
    perform 1 from pos_drafts where draft_id = v_draft and mode = v_mode for update;
    if not found then raise exception 'suspended sale % not found', v_draft; end if;
  end if;
  for pc in select o.piece_id, o.serial, o.state
              from jsonb_array_elements(v_lines) e
              left join ops_pieces o on o.piece_id = (e->>'piece_id')::uuid
             order by (e->>'piece_id')::uuid loop
    if pc.piece_id is null then raise exception 'piece not found'; end if;
    if pc.state <> 'in_stock' then raise exception 'piece % is not in stock', pc.serial; end if;
    select min(draft_id) into v_held from pos_draft_lines
     where mode = v_mode and piece_id = pc.piece_id and draft_id is distinct from v_draft;
    if v_held is not null then raise exception 'piece % is in suspended sale %', pc.serial, v_held; end if;
  end loop;

  if v_draft is null then
    insert into pos_drafts(mode, client_id, walk_in, seller, fiscal_ref, created_by)
    values (v_mode, v_client, v_walk, v_seller, nullif(btrim(p->>'fiscal_ref'), ''),
            coalesce(nullif(btrim(p_actor), ''), 'unknown'))
    returning draft_id into v_draft;
  else
    update pos_drafts
       set client_id = v_client, walk_in = v_walk, seller = v_seller, fiscal_ref = nullif(btrim(p->>'fiscal_ref'), ''),
           updated_at = now()
     where draft_id = v_draft;
    delete from pos_draft_lines where draft_id = v_draft;
  end if;

  i := 0;
  for l in select e from jsonb_array_elements(v_lines) e loop
    i := i + 1;
    insert into pos_draft_lines(draft_id, line_no, piece_id, price_uzs, discount_pct, seller, mode)
    values (v_draft, i, (l->>'piece_id')::uuid, (l->>'price_uzs')::bigint, coalesce((l->>'discount_pct')::numeric, 0),
            v_srcs[i], v_mode);
  end loop;

  return jsonb_build_object('draft_id', v_draft);
end $$;
revoke execute on function public.pos_suspend(jsonb, text) from public, anon, authenticated;

-- Suspended sales of one mode, newest first. Sellers by label only.
create function public.pos_drafts_list(p_mode text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_mode is null or p_mode not in ('training', 'live') then raise exception 'mode must be training or live'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'draft_id', d.draft_id, 'created_by', d.created_by, 'created_at', d.created_at,
             'client_id', d.client_id, 'walk_in', d.walk_in,
             'seller', (select r.label from crm_sales_reps r where r.source_name = d.seller),
             'lines', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'piece_id', l.piece_id, 'serial', o.serial, 'brand', o.brand, 'model_name', m.model_name,
                        'price_uzs', l.price_uzs, 'discount_pct', trim_scale(l.discount_pct),
                        'seller', (select r.label from crm_sales_reps r where r.source_name = l.seller))
                      order by l.line_no)
                 from pos_draft_lines l
                 join ops_pieces o on o.piece_id = l.piece_id
                 left join cat_models m on m.model_id = o.model_id
                where l.draft_id = d.draft_id), '[]'::jsonb))
           order by d.created_at desc, d.draft_id desc)
      from pos_drafts d where d.mode = p_mode), '[]'::jsonb);
end $$;
revoke execute on function public.pos_drafts_list(text) from public, anon, authenticated;

-- Cancel a suspended sale: its lines cascade, its pieces are free again; one log row.
create function public.pos_cancel_draft(p_draft bigint, p_actor text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from pos_drafts where draft_id = p_draft;
  if not found then raise exception 'suspended sale % not found', p_draft; end if;
  insert into pos_settings_log(actor, field, new_value)
  values (coalesce(nullif(btrim(p_actor), ''), 'unknown'), 'draft_cancelled', p_draft::text);
end $$;
revoke execute on function public.pos_cancel_draft(bigint, text) from public, anon, authenticated;

-- Void a posted sale from this tool. The ticket is kept (status 'void'), never deleted.
-- Live (delardi): each piece this ticket sold goes back in stock with the reason in its history,
-- the CRM purchase rows of its lines are removed and those clients recomputed. Training: status only.
create function public.pos_void_ticket(p_ticket uuid, p_reason text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t        ops_tickets%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_actor  text := coalesce(nullif(btrim(p_actor), ''), 'unknown');
  pc       record;
  n        int := 0;
  v_ids    text[];
begin
  select * into t from ops_tickets where ticket_id = p_ticket for update;
  if not found then raise exception 'ticket % not found', p_ticket; end if;
  if t.source not in ('delardi', 'training') then raise exception 'only sales from this tool can be voided'; end if;
  if t.status = 'void' then raise exception 'already void'; end if;
  if v_reason is null then raise exception 'give a reason'; end if;

  update ops_tickets
     set status = 'void', void_reason = v_reason, voided_by = v_actor, voided_at = now(), updated_at = now()
   where ticket_id = p_ticket;

  if t.source = 'delardi' then
    -- pieces locked in piece_id order (as posting does)
    perform 1 from ops_pieces
     where piece_id in (select piece_id from ops_ticket_lines where ticket_id = p_ticket and piece_id is not null)
     order by piece_id for update;
    for pc in select o.piece_id
                from ops_ticket_lines l
                join ops_pieces o on o.piece_id = l.piece_id and o.state = 'sold' and o.sold_line_id = l.line_id
               where l.ticket_id = p_ticket
               order by o.piece_id loop
      update ops_pieces
         set state = 'in_stock', state_since = now(), sold_line_id = null, updated_at = now()
       where piece_id = pc.piece_id;
      insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor)
      values (pc.piece_id, 'sold', 'in_stock', 'void: ' || v_reason, 'ticket', t.ticket_no, v_actor);
      n := n + 1;
    end loop;

    with del as (
      delete from crm_transactions
       where ticket_line_id in (select line_id from ops_ticket_lines where ticket_id = p_ticket)
      returning client_id)
    select array_agg(distinct client_id) into v_ids from del;
    if v_ids is not null then perform crm_recompute_purchases(v_ids); end if;
  end if;

  return jsonb_build_object('ticket_no', t.ticket_no, 'pieces_returned', n);
end $$;
revoke execute on function public.pos_void_ticket(uuid, text, text) from public, anon, authenticated;

-- Remove every training ticket (lines and payments cascade) and every training suspended sale; one log row.
create function public.pos_clear_training(p_actor text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t int; v_d int;
begin
  delete from ops_tickets where source = 'training';
  get diagnostics v_t = row_count;
  delete from pos_drafts where mode = 'training';
  get diagnostics v_d = row_count;
  insert into pos_settings_log(actor, field, new_value)
  values (coalesce(nullif(btrim(p_actor), ''), 'unknown'), 'training_cleared',
          format('tickets %s, drafts %s', v_t, v_d));
  return jsonb_build_object('tickets', v_t, 'drafts', v_d);
end $$;
revoke execute on function public.pos_clear_training(text) from public, anon, authenticated;

-- Void tickets stay out of the monthly totals (Task 1's view counted them; status filter added).
drop view public.ops_ticket_monthly;
create view public.ops_ticket_monthly with (security_invoker = true) as
select date_trunc('month', t.sold_at)::date as month,
       count(*) as tickets,
       coalesce(sum(l.sale_lines), 0)::bigint as sale_lines,
       coalesce(sum(l.refund_lines), 0)::bigint as refund_lines,
       coalesce(sum(l.net), 0) as net,
       coalesce(sum(p.card), 0) as card,
       coalesce(sum(p.visa), 0) as visa,
       coalesce(sum(l.net), 0) - coalesce(sum(p.card), 0) - coalesce(sum(p.visa), 0) as unrecorded
  from ops_tickets t
  left join (select ticket_id,
                    count(*) filter (where kind = 'sale') sale_lines,
                    count(*) filter (where kind = 'refund') refund_lines,
                    sum(case kind when 'refund' then -net else net end) net
               from ops_ticket_lines group by ticket_id) l using (ticket_id)
  left join (select ticket_id,
                    sum(amount) filter (where method = 'card') card,
                    sum(amount) filter (where method = 'visa') visa
               from ops_ticket_payments group by ticket_id) p using (ticket_id)
 where t.source <> 'training' and t.status = 'posted'
 group by 1;
revoke all on public.ops_ticket_monthly from public, anon, authenticated;
