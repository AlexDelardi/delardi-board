-- S3 polish, migration 6: CRM linker — fixed pairing order, client recompute, run log.
-- Spec: docs/specs/2026-11-12-s3-sales-register-design.md §4.4. Plan: S3 polish Task 4 (items 3, 7, 12).
-- Replaces ops_link_crm_tickets from 20261113_s3_2_ticket_link.sql; the ops_ticket_monthly view is unchanged.

-- One row per linker run: who ran it and the result it returned.
create table public.ops_link_runs (
  run_id bigint generated always as identity primary key,
  run_at timestamptz not null default now(),
  actor  text not null,
  result jsonb not null
);
alter table public.ops_link_runs enable row level security;
revoke all on public.ops_link_runs from public, anon, authenticated;

-- Pair still-unlinked crm_transactions rows one to one with Colibri ticket lines no CRM row points to yet.
-- Keys: same date; same article, upper-case and trimmed, the line's article taken as article || ' ' || colour
-- first (CRM articles carrying the colour suffix) and then alone; same amount (sale: net_uzs = net,
-- refund: net_uzs = -net). Identical candidates pair in a fixed order: lines by (store_id, ticket_no, line_no,
-- line_id) against CRM rows by id.
-- Then every Colibri ticket with linked lines gets its client recomputed from them: one distinct client -> that
-- client; more than one -> null. client_id on Colibri tickets is owned by this function; screens that set a
-- client come with the till (S5) and will need their own rule. Tickets with no linked lines are left alone.
-- Each run is logged in ops_link_runs (actor, result).
-- Result: linked = rows linked by this run; tickets_client_changed = tickets whose client_id this run changed;
-- the other keys describe the state after the run:
--   tickets_with_client   Colibri tickets with a client_id
--   tickets_mixed_clients Colibri tickets whose linked lines name more than one client
--   crm_unlinked_2023plus CRM rows dated 2023-01-01 or later still without a ticket line
--   lines_unlinked        Colibri ticket lines no CRM row points to
create or replace function public.ops_link_crm_tickets(p_actor text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n_linked int := 0; v_n int; v_pass int; n_changed int; v_result jsonb;
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
             row_number() over (partition by x.d, x.a, x.amt
                                order by x.store_id, x.ticket_no, x.line_no, x.line_id) rn
        from (select l.line_id, t.sold_at d, t.store_id, t.ticket_no, l.line_no,
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

  -- client recompute for every Colibri ticket with linked lines (linked CRM rows without a client are ignored;
  -- a ticket whose linked rows name no client is left alone)
  update ops_tickets t set client_id = k.client_id, updated_at = now()
    from (select l.ticket_id,
                 case when count(distinct c.client_id) = 1 then min(c.client_id) end client_id
            from crm_transactions c join ops_ticket_lines l on l.line_id = c.ticket_line_id
           group by l.ticket_id having count(distinct c.client_id) >= 1) k
   where t.ticket_id = k.ticket_id and t.source = 'colibri' and t.client_id is distinct from k.client_id;
  get diagnostics n_changed = row_count;

  v_result := jsonb_build_object(
    'linked', n_linked,
    'tickets_client_changed', n_changed,
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

  insert into ops_link_runs(actor, result) values (p_actor, v_result);
  return v_result;
end $$;

revoke execute on function public.ops_link_crm_tickets(text) from public, anon, authenticated;
