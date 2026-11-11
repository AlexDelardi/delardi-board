-- Sprint 2, migration 2: protect sales history, link CRM sales to ticket lines, apply tickets to pieces.
-- Spec: docs/specs/2026-11-11-s2-foundation-design.md §6, tests T5/T6. Plan Task 4.
-- Pre-check run 11 Nov 2026: 0 crm_transactions rows point to a missing client.

-- A client with purchases can no longer be hard-deleted (the CRM soft-deletes; every other link
-- to crm_clients already blocks a delete — this was the only cascade).
alter table public.crm_transactions drop constraint crm_transactions_client_id_fkey;
alter table public.crm_transactions add constraint crm_transactions_client_id_fkey
  foreign key (client_id) references public.crm_clients(client_id) on delete restrict;

-- Which ticket line a CRM purchase came from (filled by the Sprint 3 loader and the till).
alter table public.crm_transactions add column ticket_line_id uuid
  references public.ops_ticket_lines(line_id) on delete set null;
create index crm_transactions_ticket_line on public.crm_transactions (ticket_line_id) where ticket_line_id is not null;

-- Apply one ticket line to its piece. Called by loaders and the till, never by a person, so no rights check.
-- sale:   piece → sold (from any state except sold / not_received), open reviews auto-closed.
--         Already sold by this line → nothing. Sold by another line, or not received → ticket_conflict review.
-- refund: piece sold → in_stock. Not sold → nothing.
-- Lines without a piece, and lines of void tickets, change nothing.
create function public.ops_apply_ticket_line(p_line uuid, p_actor text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_kind text; v_piece uuid; v_status text; v_state text; v_sold_line uuid;
begin
  select l.kind, l.piece_id, t.status into v_kind, v_piece, v_status
    from ops_ticket_lines l join ops_tickets t using (ticket_id)
   where l.line_id = p_line;
  if not found then raise exception 'ticket line % not found', p_line; end if;
  if v_piece is null or v_status = 'void' then return; end if;

  select state, sold_line_id into v_state, v_sold_line from ops_pieces where piece_id = v_piece for update;

  if v_kind = 'sale' then
    if v_state = 'sold' and v_sold_line = p_line then return; end if;
    if v_state in ('sold', 'not_received') then
      insert into ops_review(piece_id, kind, note)
      select v_piece, 'ticket_conflict', format('sale line %s on a piece that is %s', p_line, v_state)
       where not exists (select 1 from ops_review r
                          where r.piece_id = v_piece and r.kind = 'ticket_conflict' and r.status = 'open');
      return;
    end if;
    update ops_pieces
       set state = 'sold', state_since = now(), sold_line_id = p_line,
           hold_client_id = null, hold_until = null, state_note = null, updated_at = now()
     where piece_id = v_piece;
    insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor)
    values (v_piece, v_state, 'sold', 'sold', 'ticket_line', p_line::text, p_actor);
    update ops_review set status = 'auto_closed', resolved_at = now(), resolved_by = p_actor
     where piece_id = v_piece and status = 'open';

  elsif v_kind = 'refund' then
    if v_state <> 'sold' then return; end if;
    -- the serial is already live again as another piece (reused after sale): flag instead of failing
    if exists (select 1 from ops_pieces o, ops_pieces me
                where me.piece_id = v_piece and o.piece_id <> v_piece
                  and o.state not in ('sold', 'not_received')
                  and o.brand = me.brand and upper(btrim(o.serial)) = upper(btrim(me.serial))) then
      insert into ops_review(piece_id, kind, note)
      select v_piece, 'ticket_conflict', format('refund line %s but the serial is live as another piece', p_line)
       where not exists (select 1 from ops_review r
                          where r.piece_id = v_piece and r.kind = 'ticket_conflict' and r.status = 'open');
      return;
    end if;
    update ops_pieces
       set state = 'in_stock', state_since = now(), sold_line_id = null, updated_at = now()
     where piece_id = v_piece;
    insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor)
    values (v_piece, 'sold', 'in_stock', 'refunded', 'ticket_line', p_line::text, p_actor);
  end if;
end $$;

revoke execute on function public.ops_apply_ticket_line(uuid, text) from public, anon, authenticated;
