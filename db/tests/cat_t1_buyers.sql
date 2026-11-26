-- "Who bought it": cat_model_buyers. Invented fixtures only. Rolled back.
begin;
do $$
declare r jsonb; v_t uuid; v_t2 uuid; v_l uuid; v_l2 uuid; ok boolean;
begin
  insert into crm_clients(client_id, record_type, name_confirmed, related_party) values
    ('ZZB-001', 'client', 'Zara Buyer', false), ('ZZB-002', 'client', 'Founder Zed', true),
    ('ZZB-003', 'client', 'Old Record', false), ('ZZB-004', 'client', 'Kept Record', false);
  update crm_clients set merged_into = 'ZZB-004', record_state = 'merged' where client_id = 'ZZB-003';
  insert into crm_sales_reps(source_name, label, active) values ('ZZ SELLER FULL', 'Zoe S.', true);
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status) values (1, 'colibri', 'ZZ-T1', '2026-05-02', 'posted') returning ticket_id into v_t;
  insert into ops_ticket_lines(ticket_id, line_no, article, size, serial_raw, qty, net) values (v_t, 1, 'ZZ-ART', '54', 'ZZ.SER.1', 1, 100) returning line_id into v_l;
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status) values (1, 'colibri', 'ZZ-T2', '2026-06-02', 'void') returning ticket_id into v_t2;
  insert into ops_ticket_lines(ticket_id, line_no, article, qty, net) values (v_t2, 1, 'ZZ-ART', 1, 100) returning line_id into v_l2;
  insert into crm_transactions(client_id, sold_at, qty, net_uzs, advisor, cat_model_id, cat_variant_id, ticket_line_id) values
    ('ZZB-001', '2026-05-02', 1, 25000000, 'ZZ SELLER FULL', 'ZZ-MODEL', 'ZZ-MODEL-WG', v_l),
    ('ZZB-002', '2024-01-10', 1, 9000000, 'Someone Unlisted', 'ZZ-MODEL', 'ZZ-MODEL-YG', null),
    ('ZZB-003', '2025-03-03', 2, 18000000, null, 'ZZ-MODEL', null, null),
    ('ZZB-001', '2026-06-02', 1, 25000000, 'ZZ SELLER FULL', 'ZZ-MODEL', 'ZZ-MODEL-WG', v_l2),
    ('ZZB-001', '2026-07-01', 1, 5000000, null, 'ZZ-OTHER', null, null);
  -- the insert trigger relinks from article/item; set the links the way the linking job does, afterwards
  update crm_transactions set cat_model_id = 'ZZ-MODEL', cat_variant_id = case when advisor = 'Someone Unlisted' then 'ZZ-MODEL-YG' when advisor is null then null else 'ZZ-MODEL-WG' end
   where client_id in ('ZZB-001','ZZB-002','ZZB-003') and sold_at <> '2026-07-01';
  update crm_transactions set cat_model_id = 'ZZ-OTHER' where client_id = 'ZZB-001' and sold_at = '2026-07-01';

  assert not has_function_privilege('anon', 'public.cat_model_buyers(text)', 'execute')
     and not has_function_privilege('authenticated', 'public.cat_model_buyers(text)', 'execute'), 'closed to the page';

  r := cat_model_buyers('ZZ-MODEL');
  assert jsonb_array_length(r) = 3, 'three purchases: the voided ticket and the other model are left out, got ' || r::text;
  assert r->0->>'sold_at' = '2026-05-02' and r->1->>'sold_at' = '2025-03-03' and r->2->>'sold_at' = '2024-01-10', 'newest first';
  assert r->0->>'client_name' = 'Zara Buyer' and r->0->>'seller' = 'Zoe S.' and r->0->>'size' = '54' and r->0->>'serial' = 'ZZ.SER.1'
     and r->0->>'ticket_no' = 'ZZ-T1' and (r->0->>'ticket_id')::uuid = v_t and (r->0->>'net_uzs')::numeric = 25000000
     and r->0->>'variant_id' = 'ZZ-MODEL-WG', 'a purchase through a ticket carries name, seller label, size, serial and the ticket';
  assert r->1->>'client_id' = 'ZZB-004' and r->1->>'client_name' = 'Kept Record' and (r->1->>'qty')::int = 2 and r->1->>'seller' is null, 'a merged client points at the record that stayed';
  assert (r->2->>'related_party')::boolean and r->2->>'seller' = 'Someone Unlisted' and r->2->>'ticket_id' is null, 'related party marked; an unlisted seller shows as written; no ticket';
  assert cat_model_buyers('ZZ-NOTHING') = '[]'::jsonb, 'nothing sold: an empty list';

  assert not (r->0->>'refund')::boolean and not (r->1->>'refund')::boolean, 'a sale is not a return';

  -- a return: a refund line on a posted ticket, negative quantity
  insert into ops_ticket_lines(ticket_id, line_no, article, kind, qty, net) values (v_t, 2, 'ZZ-ART', 'refund', -1, -100) returning line_id into v_l2;
  insert into crm_transactions(client_id, sold_at, qty, net_uzs, ticket_line_id) values ('ZZB-001', '2026-05-09', -1, -25000000, v_l2);
  update crm_transactions set cat_model_id = 'ZZ-MODEL' where ticket_line_id = v_l2;
  r := cat_model_buyers('ZZ-MODEL');
  assert jsonb_array_length(r) = 4 and (r->0->>'refund')::boolean and (r->0->>'qty')::int = -1, 'a return is listed first, flagged, got ' || (r->0)::text;
  update ops_tickets set status = 'void' where ticket_id = v_t2;

  update ops_tickets set source = 'training', status = 'posted' where ticket_id = v_t2;
  assert jsonb_array_length(cat_model_buyers('ZZ-MODEL')) = 4, 'a training ticket is left out';
end $$;
select ' ok' as result;
rollback;
