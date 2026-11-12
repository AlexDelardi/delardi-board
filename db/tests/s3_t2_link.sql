-- Sprint 3, Task 4: CRM link and monthly view (spec §4.4–4.5, tests T10/T11). Synthetic data only. Rolled back.
-- Fixture dates are in 2030 (link cases, January) and 2022 (an old CRM line), so real rows never meet them.
begin;
do $$
declare
  r jsonb; r2 jsonb; l jsonb; tk jsonb; v_tid uuid;
  base_crm int; base_lines int; base_clients int;
  c_simple bigint; c_colour bigint; c_refund bigint; c_same1 bigint; c_same2 bigint;
  c_nomatch bigint; c_old bigint; c_mix1 bigint; c_mix2 bigint; c_delardi bigint;
  snap_links text; snap_clients text; m record;
begin
  -- what is already unlinked / client-linked before the fixtures (the count keys are global)
  select count(*) into base_crm from crm_transactions where ticket_line_id is null and sold_at >= date '2023-01-01';
  select count(*) into base_lines from ops_ticket_lines l join ops_tickets t using (ticket_id)
   where t.source = 'colibri' and not exists (select 1 from crm_transactions c where c.ticket_line_id = l.line_id);
  select count(*) into base_clients from ops_tickets where source = 'colibri' and client_id is not null;

  -- store and clients
  insert into ops_stores(store_id, code, name)
  select 1, 'S3T-STORE', 'S3T store' where not exists (select 1 from ops_stores where store_id = 1);
  insert into crm_clients(client_id, record_type) values ('S3T-C1', 'client'), ('S3T-C2', 'client');

  -- tickets through the loader; a sale line template, cases override what they need
  l := jsonb_build_object('line_no', 1, 'kind', 'sale', 'article', null, 'colour', null, 'item_name', 'S3T item',
         'size', null, 'qty', 1, 'price_list', null, 'price_current', null, 'discount_pct', null, 'discount_amt', null,
         'net', null, 'brand_raw', 'S3T Brand', 'serial_raw', null, 'sk', null, 'vip', null);
  tk := jsonb_build_object('seller_raw', null, 'client_raw', null, 'note', null, 'source_file', 'S3T-sales.xlsx');
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(
    -- simple link
    tk || jsonb_build_object('ticket_no', 'S3T-A', 'sold_at', '2030-01-10',
      'lines', jsonb_build_array(l || jsonb_build_object('article', 'S3T-ART-A', 'net', 100000)),
      'payments', jsonb_build_array(jsonb_build_object('method', 'card', 'amount', 100000, 'raw', 'S3T'))),
    -- article with colour suffix
    tk || jsonb_build_object('ticket_no', 'S3T-B', 'sold_at', '2030-01-11',
      'lines', jsonb_build_array(l || jsonb_build_object('article', '345512', 'colour', 'WG', 'net', 200000)),
      'payments', jsonb_build_array(jsonb_build_object('method', 'visa', 'amount', 150000, 'raw', 'S3T'))),
    -- refund
    tk || jsonb_build_object('ticket_no', 'S3T-C', 'sold_at', '2030-01-12',
      'lines', jsonb_build_array(l || jsonb_build_object('kind', 'refund', 'article', 'S3T-ART-C', 'net', 5000)),
      'payments', '[]'::jsonb),
    -- identical lines
    tk || jsonb_build_object('ticket_no', 'S3T-D', 'sold_at', '2030-01-13',
      'lines', jsonb_build_array(l || jsonb_build_object('article', 'S3T-ART-D', 'net', 300000),
                                 l || jsonb_build_object('line_no', 2, 'article', 'S3T-ART-D', 'net', 300000)),
      'payments', jsonb_build_array(jsonb_build_object('method', 'card', 'amount', 600000, 'raw', 'S3T'))),
    -- no match (CRM amount differs)
    tk || jsonb_build_object('ticket_no', 'S3T-E', 'sold_at', '2030-01-14',
      'lines', jsonb_build_array(l || jsonb_build_object('article', 'S3T-ART-E', 'net', 400000)),
      'payments', '[]'::jsonb),
    -- mixed clients
    tk || jsonb_build_object('ticket_no', 'S3T-F', 'sold_at', '2030-01-15',
      'lines', jsonb_build_array(l || jsonb_build_object('article', 'S3T-ART-F1', 'net', 50000),
                                 l || jsonb_build_object('line_no', 2, 'article', 'S3T-ART-F2', 'net', 60000)),
      'payments', jsonb_build_array(jsonb_build_object('method', 'card', 'amount', 110000, 'raw', 'S3T')))
  )), 'test');
  assert (r->>'tickets_new')::int = 6, 'fixture load ' || r::text;

  -- a till (non-Colibri) ticket line is never a candidate
  insert into ops_tickets(store_id, source, ticket_no, sold_at) values (1, 'delardi', 'S3T-DL', '2030-02-01')
  returning ticket_id into v_tid;
  insert into ops_ticket_lines(ticket_id, line_no, kind, article, net) values (v_tid, 1, 'sale', 'S3T-ART-G', 70000);

  -- CRM lines
  insert into crm_transactions(client_id, sold_at, article, net_uzs) values ('S3T-C1', '2030-01-10', 'S3T-ART-A', 100000)
  returning id into c_simple;
  insert into crm_transactions(client_id, sold_at, article, net_uzs) values ('S3T-C1', '2030-01-11', '345512 wg ', 200000)
  returning id into c_colour;
  insert into crm_transactions(client_id, sold_at, article, net_uzs) values ('S3T-C2', '2030-01-12', 'S3T-ART-C', -5000)
  returning id into c_refund;
  insert into crm_transactions(client_id, sold_at, article, net_uzs) values ('S3T-C1', '2030-01-13', 'S3T-ART-D', 300000)
  returning id into c_same1;
  insert into crm_transactions(client_id, sold_at, article, net_uzs) values ('S3T-C1', '2030-01-13', 'S3T-ART-D', 300000)
  returning id into c_same2;
  insert into crm_transactions(client_id, sold_at, article, net_uzs) values ('S3T-C1', '2030-01-14', 'S3T-ART-E', 399000)
  returning id into c_nomatch;
  insert into crm_transactions(client_id, sold_at, article, net_uzs) values ('S3T-C1', '2022-05-05', 'S3T-ART-Z', 1000)
  returning id into c_old;
  insert into crm_transactions(client_id, sold_at, article, net_uzs) values ('S3T-C1', '2030-01-15', 'S3T-ART-F1', 50000)
  returning id into c_mix1;
  insert into crm_transactions(client_id, sold_at, article, net_uzs) values ('S3T-C2', '2030-01-15', 'S3T-ART-F2', 60000)
  returning id into c_mix2;
  insert into crm_transactions(client_id, sold_at, article, net_uzs) values ('S3T-C1', '2030-02-01', 'S3T-ART-G', 70000)
  returning id into c_delardi;

  r := ops_link_crm_tickets('test');

  -- simple link
  assert (select l.line_id from ops_ticket_lines l join ops_tickets t using (ticket_id) where t.ticket_no = 'S3T-A')
         = (select ticket_line_id from crm_transactions where id = c_simple), 'simple: linked ' || r::text;
  assert (select client_id from ops_tickets where ticket_no = 'S3T-A') = 'S3T-C1', 'simple: ticket client';
  -- article with colour suffix
  assert (select l.line_id from ops_ticket_lines l join ops_tickets t using (ticket_id) where t.ticket_no = 'S3T-B')
         = (select ticket_line_id from crm_transactions where id = c_colour), 'colour: linked';
  assert (select client_id from ops_tickets where ticket_no = 'S3T-B') = 'S3T-C1', 'colour: ticket client';
  -- refund
  assert (select l.line_id from ops_ticket_lines l join ops_tickets t using (ticket_id) where t.ticket_no = 'S3T-C')
         = (select ticket_line_id from crm_transactions where id = c_refund), 'refund: linked';
  assert (select client_id from ops_tickets where ticket_no = 'S3T-C') = 'S3T-C2', 'refund: ticket client';
  -- identical lines: two links to two different lines of S3T-D
  assert (select count(distinct ticket_line_id) from crm_transactions where id in (c_same1, c_same2)) = 2,
         'identical: two distinct links';
  assert (select count(*) from crm_transactions c join ops_ticket_lines l on l.line_id = c.ticket_line_id
            join ops_tickets t using (ticket_id) where c.id in (c_same1, c_same2) and t.ticket_no = 'S3T-D') = 2,
         'identical: both on S3T-D';
  assert (select client_id from ops_tickets where ticket_no = 'S3T-D') = 'S3T-C1', 'identical: ticket client';
  -- no match
  assert (select ticket_line_id from crm_transactions where id = c_nomatch) is null, 'no match: stays null';
  assert (select ticket_line_id from crm_transactions where id = c_old) is null, 'no match: 2022 stays null';
  assert (select client_id from ops_tickets where ticket_no = 'S3T-E') is null, 'no match: no ticket client';
  assert (select ticket_line_id from crm_transactions where id = c_delardi) is null, 'till ticket line not a candidate';
  -- the 2023+ count holds the unmatched 2030 rows (amount, till) but not the 2022 one
  assert (r->>'crm_unlinked_2023plus')::int = base_crm + 2, 'crm_unlinked_2023plus ' || r::text;
  assert (r->>'lines_unlinked')::int = base_lines + 1, 'lines_unlinked (S3T-E only) ' || r::text;
  -- mixed clients
  assert (select count(*) from crm_transactions where id in (c_mix1, c_mix2) and ticket_line_id is not null) = 2,
         'mixed: both linked';
  assert (select client_id from ops_tickets where ticket_no = 'S3T-F') is null, 'mixed: no ticket client';
  assert (r->'tickets_mixed_clients') ? 'S3T-F', 'mixed: listed ' || r::text;
  assert not (r->'tickets_mixed_clients') ?| array['S3T-A', 'S3T-B', 'S3T-C', 'S3T-D', 'S3T-E'], 'mixed: only S3T-F';
  -- counts
  assert (select count(*) from crm_transactions c where c.client_id like 'S3T-%' and c.ticket_line_id is not null) = 7,
         'seven S3T links';
  assert (r->>'linked')::int >= 7, 'linked ' || r::text;
  assert (r->>'tickets_with_client')::int = base_clients + 4, 'tickets_with_client ' || r::text;
  -- one to one: no line is linked twice
  assert not exists (select 1 from crm_transactions where ticket_line_id is not null
                      group by ticket_line_id having count(*) > 1), 'a line linked twice';

  -- re-run: nothing changes
  select string_agg(id || ':' || coalesce(ticket_line_id::text, '-'), ',' order by id) into snap_links
    from crm_transactions where client_id like 'S3T-%';
  select string_agg(ticket_no || ':' || coalesce(client_id, '-'), ',' order by ticket_no) into snap_clients
    from ops_tickets where ticket_no like 'S3T-%';
  r2 := ops_link_crm_tickets('test');
  assert (r2->>'linked')::int = 0, 're-run: linked ' || r2::text;
  assert (r2 - 'linked') = (r - 'linked'), 're-run: same counts ' || r2::text || ' vs ' || r::text;
  assert (select string_agg(id || ':' || coalesce(ticket_line_id::text, '-'), ',' order by id)
            from crm_transactions where client_id like 'S3T-%') = snap_links, 're-run: links unchanged';
  assert (select string_agg(ticket_no || ':' || coalesce(client_id, '-'), ',' order by ticket_no)
            from ops_tickets where ticket_no like 'S3T-%') = snap_clients, 're-run: clients unchanged';

  -- view, January 2030: 6 tickets; sale lines A, B, D×2, E, F×2 = 7; refund C;
  -- net 100000+200000+600000+400000+110000-5000 = 1405000; card 100000+600000+110000 = 810000; visa 150000
  select * into m from ops_ticket_monthly where month = date '2030-01-01';
  assert m.tickets = 6, 'view: tickets ' || m::text;
  assert m.sale_lines = 7, 'view: sale_lines ' || m::text;
  assert m.refund_lines = 1, 'view: refund_lines ' || m::text;
  assert m.net = 1405000, 'view: net ' || m::text;
  assert m.card = 810000, 'view: card ' || m::text;
  assert m.visa = 150000, 'view: visa ' || m::text;
  assert m.unrecorded = 445000, 'view: unrecorded ' || m::text;
  -- February 2030: the till ticket, no payments
  select * into m from ops_ticket_monthly where month = date '2030-02-01';
  assert (m.tickets, m.sale_lines, m.refund_lines, m.net, m.card, m.visa, m.unrecorded)
         = (1::bigint, 1::bigint, 0::bigint, 70000::numeric, 0::numeric, 0::numeric, 70000::numeric), 'view: Feb ' || m::text;

  -- rights
  assert (select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.ops_ticket_monthly'::regclass),
         'view: security_invoker';
  assert not has_table_privilege('anon', 'public.ops_ticket_monthly', 'select'), 'view: anon select';
  assert not has_table_privilege('authenticated', 'public.ops_ticket_monthly', 'select'), 'view: authenticated select';
  assert not has_function_privilege('anon', 'public.ops_link_crm_tickets(text)', 'execute'), 'fn: anon execute';
  assert not has_function_privilege('authenticated', 'public.ops_link_crm_tickets(text)', 'execute'), 'fn: authenticated execute';
end $$;
select 's3_t2 ok' as result;
rollback;
