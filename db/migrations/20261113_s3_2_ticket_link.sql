-- Sprint 3, migration 2: link CRM purchase lines to Colibri ticket lines, and the monthly ticket totals.
-- Spec: docs/specs/2026-11-12-s3-sales-register-design.md §4.4–4.5, tests T9–T11. Plan Task 4.

-- Pair still-unlinked crm_transactions rows one to one with Colibri ticket lines no CRM row points to yet.
-- Keys: same date; same article, upper-case and trimmed, the line's article taken as article || ' ' || colour
-- first (CRM articles carrying the colour suffix) and then alone; same amount (sale: net_uzs = net,
-- refund: net_uzs = -net). Identical candidates pair in order (ticket_no, line_no) against CRM id.
-- Then a ticket gets client_id when it has none and every linked line points to one client.
-- Result: linked = rows linked by this run; the other keys describe the state after the run:
--   tickets_with_client   Colibri tickets with a client_id
--   tickets_mixed_clients Colibri tickets whose linked lines name more than one client
--   crm_unlinked_2023plus CRM rows dated 2023-01-01 or later still without a ticket line
--   lines_unlinked        Colibri ticket lines no CRM row points to
create function public.ops_link_crm_tickets(p_actor text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n_linked int := 0; v_n int; v_pass int;
begin
  if p_actor is null or btrim(p_actor) = '' then raise exception 'actor required'; end if;

  -- pass 1: article with colour suffix; pass 2: article alone (on what pass 1 left)
  for v_pass in 1..2 loop
    with crm as (
      select c.id, c.sold_at::date d, upper(btrim(c.article)) a, c.net_uzs amt,
             row_number() over (partition by c.sold_at::date, upper(btrim(c.article)), c.net_uzs order by c.id) rn
        from crm_transactions c
       where c.ticket_line_id is null and c.article is not null and c.net_uzs is not null
    ), lines as (
      select x.line_id, x.d, x.a, x.amt,
             row_number() over (partition by x.d, x.a, x.amt order by x.ticket_no, x.line_no) rn
        from (select l.line_id, t.sold_at d, t.ticket_no, l.line_no,
                     upper(btrim(case when v_pass = 1 then l.article || ' ' || l.colour else l.article end)) a,
                     case l.kind when 'refund' then -l.net else l.net end amt
                from ops_ticket_lines l join ops_tickets t using (ticket_id)
               where t.source = 'colibri' and l.article is not null and l.net is not null
                 and (v_pass = 2 or l.colour is not null)
                 and not exists (select 1 from crm_transactions u where u.ticket_line_id = l.line_id)) x
    )
    update crm_transactions c set ticket_line_id = p.line_id
      from (select crm.id, lines.line_id from crm join lines using (d, a, amt, rn)) p
     where c.id = p.id;
    get diagnostics v_n = row_count;
    n_linked := n_linked + v_n;
  end loop;

  update ops_tickets t set client_id = k.client_id, updated_at = now()
    from (select l.ticket_id, min(c.client_id) client_id
            from crm_transactions c join ops_ticket_lines l on l.line_id = c.ticket_line_id
           group by l.ticket_id having count(distinct c.client_id) = 1) k
   where t.ticket_id = k.ticket_id and t.source = 'colibri' and t.client_id is null;

  return jsonb_build_object(
    'linked', n_linked,
    'tickets_with_client', (select count(*) from ops_tickets where source = 'colibri' and client_id is not null),
    'tickets_mixed_clients', (
      select coalesce(jsonb_agg(ticket_no order by ticket_no), '[]'::jsonb)
        from (select t.ticket_no
                from crm_transactions c join ops_ticket_lines l on l.line_id = c.ticket_line_id
                join ops_tickets t using (ticket_id)
               where t.source = 'colibri'
               group by t.ticket_id, t.ticket_no having count(distinct c.client_id) > 1) m),
    'crm_unlinked_2023plus', (select count(*) from crm_transactions
                               where ticket_line_id is null and sold_at >= date '2023-01-01'),
    'lines_unlinked', (select count(*) from ops_ticket_lines l join ops_tickets t using (ticket_id)
                        where t.source = 'colibri'
                          and not exists (select 1 from crm_transactions c where c.ticket_line_id = l.line_id)));
end $$;

revoke execute on function public.ops_link_crm_tickets(text) from public, anon, authenticated;

-- Ticket totals per month: net = sale nets minus refund nets; card and VISA as recorded on the tickets;
-- unrecorded = net - card - visa.
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
 group by 1;

revoke all on public.ops_ticket_monthly from public, anon, authenticated;
