-- The Colibri receipt number on a till sale, the main-number switch, and the Colibri export as a cross-check.
-- Invented fixtures. Rolled back.
begin;
alter sequence pos_ticket_no_seq restart;
alter sequence pos_training_no_seq restart;
do $$
declare
  res jsonb; r jsonb; p1 uuid; p2 uuid; p3 uuid; t1 uuid; t2 uuid; ok boolean; msg text; sale jsonb; n0 int;
begin
  insert into ops_stores(store_id, code, name) select 1, 'POS-STORE', 'POS store' where not exists (select 1 from ops_stores where store_id = 1);
  insert into crm_sales_reps(source_name, label) values ('T9 Source', 'T9 Rep');
  insert into ops_pieces(store_id, brand, serial, state, price_uzs) values (1, 'T9 Brand', 'T9.0001', 'in_stock', 10000000) returning piece_id into p1;
  insert into ops_pieces(store_id, brand, serial, state, price_uzs) values (1, 'T9 Brand', 'T9.0002', 'in_stock', 20000000) returning piece_id into p2;
  insert into ops_pieces(store_id, brand, serial, state, price_uzs) values (1, 'T9 Brand', 'T9.0003', 'in_stock', 5000000) returning piece_id into p3;
  perform pos_set_mode('live', 'pos t9');

  -- the switch: till numbers by default; changing it is logged
  assert (select main_ticket_no from pos_settings) = 'till', 'till numbers by default';
  sale := jsonb_build_object('walk_in', true, 'seller', 'T9 Rep');

  -- till numbers main: the Colibri number is optional, kept, and the till number is the one shown
  res := pos_post_sale(sale || jsonb_build_object('colibri_no', ' K-1001 ',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p1, 'price_uzs', 10000000, 'discount_pct', 0)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 10000000))), 'pos t9');
  t1 := (res->>'ticket_id')::uuid;
  assert res->>'ticket_no' = 'D-000001' and res->>'display_no' = 'D-000001' and res->>'colibri_no' = 'K-1001', 'result ' || res::text;
  assert (select colibri_no = 'K-1001' and display_no is null and receipt_text like '%Ticket D-000001 ·%' from ops_tickets where ticket_id = t1), 'kept, till number printed';

  -- one posted sale per Colibri number, whatever the letter case
  begin
    perform pos_post_sale(sale || jsonb_build_object('colibri_no', 'k-1001',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p2, 'price_uzs', 20000000, 'discount_pct', 0)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 20000000))), 'pos t9');
    ok := false;
  exception when sqlstate 'P0001' then ok := sqlerrm = 'Colibri receipt k-1001 is already on sale D-000001'; msg := sqlerrm; end;
  assert ok, 'a number already used is refused: ' || coalesce(msg, 'went through');
  assert (select state from ops_pieces where piece_id = p2) = 'in_stock', 'the refused sale sold nothing';

  -- Colibri numbers main: needed to post, shown and printed
  r := pos_set_main_no('colibri', 'pos t9');
  assert r->>'main_ticket_no' = 'colibri' and (select main_ticket_no from pos_settings) = 'colibri'
     and exists (select 1 from pos_settings_log where field = 'main_ticket_no' and old_value = 'till' and new_value = 'colibri' and actor = 'pos t9'), 'switched and logged';
  begin perform pos_set_main_no('other', 'pos t9'); ok := false; exception when sqlstate 'P0001' then ok := true; end;
  assert ok, 'only till or colibri';
  begin
    perform pos_post_sale(sale || jsonb_build_object(
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p2, 'price_uzs', 20000000, 'discount_pct', 0)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 20000000))), 'pos t9');
    ok := false;
  exception when sqlstate 'P0001' then ok := sqlerrm = 'Colibri receipt number is needed'; end;
  assert ok, 'needed while Colibri numbers are main';
  res := pos_post_sale(sale || jsonb_build_object('colibri_no', 'K-1002',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p2, 'price_uzs', 20000000, 'discount_pct', 5)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 19000000))), 'pos t9');
  t2 := (res->>'ticket_id')::uuid;
  assert res->>'ticket_no' = 'D-000002' and res->>'display_no' = 'K-1002', 'Colibri number shown: ' || res::text;
  assert (select display_no = 'K-1002' and receipt_text like '%Ticket K-1002 ·%' from ops_tickets where ticket_id = t2), 'Colibri number printed';

  -- the other tools show the same main number: Performance, the Stock piece page, "Who bought it" in the Catalogue
  assert exists (select 1 from perf_tickets(current_date, current_date + 1, 1::smallint) x where x.ticket_id = t2 and x.ticket_no = 'K-1002'), 'Performance shows the Colibri number';
  assert exists (select 1 from perf_tickets(current_date, current_date + 1, 1::smallint) x where x.ticket_id = t1 and x.ticket_no = 'D-000001'), 'Performance keeps the till number of a sale posted under it';
  assert stk_piece_detail(p2)::text like '%"ticket_no": "K-1002"%' and stk_piece_detail(p2)::text not like '%"ticket_no": "D-000002"%', 'Stock piece page: ' || stk_piece_detail(p2)::text;
  insert into crm_clients(client_id, record_type, name_colibri, name_confirmed) values ('DLD-9909', 'client', 'Zztest Nine', 'Zztest Nine');
  insert into crm_transactions(client_id, sold_at, brand, item, qty, gross_uzs, discount_pct, net_uzs, advisor, ticket_line_id, cat_model_id)
  select 'DLD-9909', current_date, 'T9 Brand', 'T9 piece', 1, 20000000, 0.05, 19000000, 'T9 Source', l.line_id, 'T9-MODEL' from ops_ticket_lines l where l.ticket_id = t2;
  update crm_transactions set cat_model_id = 'T9-MODEL' where client_id = 'DLD-9909';      -- the link trigger clears it on insert
  assert cat_model_buyers('T9-MODEL')::text like '%"ticket_no": "K-1002"%', 'Who bought it: ' || cat_model_buyers('T9-MODEL')::text;

  -- the list carries both numbers and finds a sale by either
  r := pos_ticket_list('{"q":"k-1002"}');
  assert (r->>'count')::int = 1 and r->'rows'->0->>'display_no' = 'K-1002' and r->'rows'->0->>'ticket_no' = 'D-000002'
     and r->'rows'->0->>'colibri_no' = 'K-1002', 'found by the Colibri number: ' || r::text;
  assert (pos_ticket_list('{"q":"D-000002"}')->>'count')::int = 1, 'found by the till number';
  assert pos_ticket_list('{"q":"D-000001"}')->'rows'->0->>'display_no' = 'D-000001', 'an older sale keeps the number it was posted under';

  -- the Colibri export: the same receipts are compared, never written; an unknown one is refused as before
  n0 := (select count(*) from ops_tickets);
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(
         jsonb_build_object('ticket_no', 'K-1001', 'sold_at', current_date::text, 'lines', jsonb_build_array(
           jsonb_build_object('line_no', 1, 'kind', 'sale', 'serial_raw', 't9.0001 ', 'brand_raw', 'T9 Brand', 'net', 10000000)), 'payments', '[]'::jsonb),
         jsonb_build_object('ticket_no', 'K-1002', 'sold_at', current_date::text, 'lines', jsonb_build_array(
           jsonb_build_object('line_no', 1, 'kind', 'sale', 'serial_raw', 'T9.0003', 'brand_raw', 'T9 Brand', 'net', 19500000)), 'payments', '[]'::jsonb),
         jsonb_build_object('ticket_no', 'K-1003', 'sold_at', current_date::text, 'lines', jsonb_build_array(
           jsonb_build_object('line_no', 1, 'kind', 'sale', 'serial_raw', 'T9.0003', 'brand_raw', 'T9 Brand', 'net', 5000000)), 'payments', '[]'::jsonb))), 'pos t9');
  assert r->'till_matched' = '["K-1001"]'::jsonb and r->'till_differs' = '["K-1002"]'::jsonb and r->'refused_after_go_live' = '["K-1003"]'::jsonb,
         'paired, differing, missing from the till: ' || r::text;
  assert (select count(*) from ops_tickets) = n0 and (r->>'tickets_new')::int = 0, 'no ticket written';
  assert (select colibri_check = 'matched' and colibri_note is null and colibri_seen_at is not null from ops_tickets where ticket_id = t1), 'matched is kept on the sale';
  assert (select colibri_check = 'differs' and colibri_note = 'pieces: till T9.0002, Colibri T9.0003; total: till 19 000 000, Colibri 19 500 000'
            from ops_tickets where ticket_id = t2), 'the difference is spelled out: ' || (select colibri_note from ops_tickets where ticket_id = t2);
  assert (select state from ops_pieces where piece_id = p3) = 'in_stock', 'the export sold nothing';
  assert pos_ticket_list('{"q":"K-1002"}')->'rows'->0->>'colibri_check' = 'differs', 'the list shows the check';
  -- a corrected export clears the flag
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(
         jsonb_build_object('ticket_no', 'K-1002', 'sold_at', current_date::text, 'lines', jsonb_build_array(
           jsonb_build_object('line_no', 1, 'kind', 'sale', 'serial_raw', 'T9.0002', 'brand_raw', 'T9 Brand', 'net', 19000000)), 'payments', '[]'::jsonb))), 'pos t9');
  assert (select colibri_check = 'matched' and colibri_note is null from ops_tickets where ticket_id = t2), 'agreement clears it';

  -- a voided sale frees its number
  perform pos_void_ticket(t2, 'test', 'pos t9');
  res := pos_post_sale(sale || jsonb_build_object('colibri_no', 'K-1002',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p2, 'price_uzs', 20000000, 'discount_pct', 5)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 19000000))), 'pos t9');
  assert res->>'display_no' = 'K-1002', 'the number can be used again after a void';

  -- a receipt the register already holds from a Colibri export cannot be posted again from the till
  update pos_settings set go_live_date = current_date + 1;      -- as if still before go-live: the export writes
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(
         jsonb_build_object('ticket_no', 'K-0900', 'sold_at', current_date::text, 'lines', '[]'::jsonb, 'payments', '[]'::jsonb))), 'pos t9');
  assert (r->>'tickets_new')::int = 1, 'before go-live the export writes';
  begin
    perform pos_post_sale(sale || jsonb_build_object('colibri_no', 'K-0900',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p3, 'price_uzs', 5000000, 'discount_pct', 0)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 5000000))), 'pos t9');
    ok := false;
  exception when sqlstate 'P0001' then ok := sqlerrm = 'Colibri receipt K-0900 is already in the register, loaded from Colibri'; end;
  assert ok, 'already loaded from Colibri';

  assert not has_function_privilege('anon', 'public.pos_set_main_no(text,text)', 'execute')
     and not has_function_privilege('authenticated', 'public.pos_check_colibri(uuid,jsonb)', 'execute'), 'closed to the page';
end $$;
select 'pos_t9 ok' as result;
rollback;
