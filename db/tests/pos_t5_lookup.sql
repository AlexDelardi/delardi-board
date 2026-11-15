-- POS Task 5: ticket list, detail, ticket by line. Invented fixtures. Rolled back.
begin;
alter sequence pos_ticket_no_seq restart;
alter sequence pos_training_no_seq restart;

do $$
declare
  pl jsonb; res jsonb; p1 uuid; p2 uuid; r1 jsonb; r2 jsonb;
  c1 uuid; c2 uuid; c3 uuid; v_line uuid; v_today date := (now() at time zone 'Asia/Tashkent')::date;
  d jsonb; k text;
begin
  insert into ops_stores(store_id, code, name)
  select 1, 'POS-STORE', 'POS store' where not exists (select 1 from ops_stores where store_id = 1);
  update pos_settings set shop_address = 'Zz street 1, Tashkent';
  insert into crm_clients(client_id, record_type, name_colibri, name_confirmed)
    values ('DLD-9001', 'client', 'Zztest Clientov', 'Zztest Clientov');
  insert into crm_sales_reps(source_name, label) values ('S3T Source', 'S3T Rep');

  pl := jsonb_build_object('built', 'pos t5',
    'models', jsonb_build_array(jsonb_build_object('model_id', 'ZZ-M5', 'article', 'ZZ-ART-5', 'brand', 'S3T Brand',
                'brand_raw', jsonb_build_array('S3T Brand'), 'category', 'jewellery', 'retail_category', 'Jewellery',
                'collection', 'Zz Collection', 'model_name', 'Zz Ring', 'in_stock', true, 'qty_stock', 2,
                'arrival_years', '[]'::jsonb, 'variant_count', 1, 'completeness', 0, 'missing_crucial', '[]'::jsonb,
                'has_unconfirmed', false, 'metal_keys', '["gold_white"]'::jsonb, 'stone_keys', '["diamond"]'::jsonb,
                'size_keys', '[]'::jsonb, 'qty_transit', 0)),
    'variants', jsonb_build_array(jsonb_build_object('variant_id', 'ZZ-M5-V1', 'model_id', 'ZZ-M5', 'colour_code', 'WG',
                'in_stock', true, 'qty_stock', 2, 'qty_in', 2, 'qty_sold', 0, 'arrival_years', '[]'::jsonb,
                'found_online', false, 'sources', '[]'::jsonb, 'sort_order', 1, 'qty_transit', 0)),
    'pieces', jsonb_build_array(
      jsonb_build_object('serial', 'ZZ.00.50001', 'variant_id', 'ZZ-M5-V1', 'size', '16', 'price_uzs', 10000000),
      jsonb_build_object('serial', 'ZZ.00.50002', 'variant_id', 'ZZ-M5-V1', 'size', '17', 'price_uzs', 4000000)),
    'attributes', '[]'::jsonb, 'links', '[]'::jsonb, 'expected', '[]'::jsonb);
  perform cat_load(pl, 'pos t5 a');
  select piece_id into p1 from ops_pieces where serial = 'ZZ.00.50001';
  select piece_id into p2 from ops_pieces where serial = 'ZZ.00.50002';

  -- training ticket (T-000001) then live ticket (D-000001, client DLD-9001)
  r1 := pos_post_sale(jsonb_build_object('walk_in', true, 'seller', 'S3T Rep',
          'lines', jsonb_build_array(jsonb_build_object('piece_id', p2, 'price_uzs', 4000000)),
          'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 4000000))), 'pos t5');
  assert r1->>'ticket_no' = 'T-000001', 'training ticket ' || r1::text;
  perform pos_set_mode('live', 'pos t5');
  r2 := pos_post_sale(jsonb_build_object('client_id', 'DLD-9001', 'seller', 'S3T Rep',
          'lines', jsonb_build_array(jsonb_build_object('piece_id', p1, 'price_uzs', 10000000, 'discount_pct', 10)),
          'payments', jsonb_build_array(jsonb_build_object('method', 'card', 'card_type', 'humo', 'amount', 9000000))), 'pos t5');
  assert r2->>'ticket_no' = 'D-000001', 'live ticket ' || r2::text;

  -- Colibri tickets: a recent one with a sale and a refund line, an old one
  insert into ops_tickets(store_id, source, ticket_no, sold_at, seller, seller_raw, client_raw, card_no, source_file)
    values (1, 'colibri', 'ZZ-C1', v_today - 5, 'S3T Source', 'raw seller', 'Zzraw Buyer', '9999', 'zz.xlsx')
    returning ticket_id into c1;
  insert into ops_ticket_lines(ticket_id, line_no, kind, article, item_name, serial_raw, brand_raw, price_current, net, extra)
    values (c1, 1, 'sale', 'ZZ-ART-C', 'Zz Bracelet', 'ZZ.00.60001', 'S3T Brand', 5000000, 5000000, '{"seller":"S3T Source"}'),
           (c1, 2, 'refund', 'ZZ-ART-D', 'Zz Chain', 'ZZ.00.60002', 'S3T Other', 1200000, 1200000, null);
  insert into ops_ticket_payments(ticket_id, method, amount, raw) values (c1, 'cash', 3800000, 'cash');
  insert into ops_tickets(store_id, source, ticket_no, sold_at, seller, client_raw)
    values (1, 'colibri', 'ZZ-C2', v_today - 60, 'S3T Source', 'Zzold Buyer') returning ticket_id into c2;
  insert into ops_ticket_lines(ticket_id, line_no, kind, item_name, serial_raw, brand_raw, price_current, net)
    values (c2, 1, 'sale', 'Zz Old Ring', 'ZZ.00.60003', 'S3T Brand', 700000, 700000);
  -- the live and training tickets sold today; push the live one 10 days back to prove ordering
  update ops_tickets set sold_at = v_today - 10 where ticket_no = 'D-000001';

  -- default window: excludes the 60-day-old one and the training one
  res := pos_ticket_list('{}');
  assert (res->>'count')::int = 2 and (res->>'page')::int = 1, 'default count ' || res::text;
  assert (res->>'net_total')::numeric = 5000000 - 1200000 + 9000000, 'net_total refund negative ' || res::text;
  assert res->'rows'->0->>'ticket_no' = 'ZZ-C1' and res->'rows'->1->>'ticket_no' = 'D-000001', 'newest first ' || res::text;
  assert (res->'rows'->0->>'net')::numeric = 3800000 and (res->'rows'->0->>'lines')::int = 2
         and res->'rows'->0->>'items' = 'S3T Brand Zz Bracelet ×2' and res->'rows'->0->>'source' = 'colibri'
         and res->'rows'->0->>'status' = 'posted' and res->'rows'->0->>'seller' = 'S3T Source'
         and res->'rows'->0->>'client_name' = 'Zzraw Buyer' and res->'rows'->0->>'client_id' is null
         and (res->'rows'->0->>'walk_in')::boolean = false and res->'rows'->0->>'sold_at' is not null
         and res->'rows'->0->>'ticket_id' = c1::text, 'colibri row ' || (res->'rows'->0)::text;
  assert res->'rows'->1->>'items' = 'S3T Brand Zz Ring' and res->'rows'->1->>'client_id' = 'DLD-9001'
         and res->'rows'->1->>'client_name' = (select display_name from crm_queue where client_id = 'DLD-9001'),
         'live row ' || (res->'rows'->1)::text;
  -- all of ticket / window
  res := pos_ticket_list('{"from":"2000-01-01"}');
  assert (res->>'count')::int = 3 and res->'rows'->2->>'ticket_no' = 'ZZ-C2', 'explicit from ' || res::text;
  res := pos_ticket_list(jsonb_build_object('to', (v_today - 30)::text));
  assert (res->>'count')::int = 1 and res->'rows'->0->>'ticket_no' = 'ZZ-C2', 'to only: no default window';
  -- source
  res := pos_ticket_list('{"source":"delardi"}');
  assert (res->>'count')::int = 1 and res->'rows'->0->>'ticket_no' = 'D-000001', 'source delardi ' || res::text;
  res := pos_ticket_list('{"source":"colibri","from":"2000-01-01"}');
  assert (res->>'count')::int = 2, 'source colibri';
  -- training
  res := pos_ticket_list('{"training":true}');
  assert (res->>'count')::int = 1 and res->'rows'->0->>'ticket_no' = 'T-000001' and res->'rows'->0->>'source' = 'training'
         and (res->'rows'->0->>'net')::numeric = 4000000, 'training only ' || res::text;
  assert not exists (select 1 from jsonb_array_elements(pos_ticket_list('{"from":"2000-01-01"}')->'rows') e
                      where e->>'ticket_no' like 'T-%'), 'default excludes T-';
  assert (pos_ticket_list('{"training":false}')->>'count')::int = 2, 'training false';
  -- seller / status
  assert (pos_ticket_list('{"seller":"S3T Source"}')->>'count')::int = 2, 'seller filter (both live and colibri)';
  assert (pos_ticket_list('{"seller":"nobody"}')->>'count')::int = 0, 'seller none';
  assert (pos_ticket_list('{"status":"void"}')->>'count')::int = 0, 'status void none';
  assert (pos_ticket_list('{"status":"posted"}')->>'count')::int = 2, 'status posted';
  -- search
  assert pos_ticket_list('{"q":"ZZ.00.60001"}')->'rows'->0->>'ticket_no' = 'ZZ-C1', 'q serial';
  assert (pos_ticket_list('{"q":"zz-art-d"}')->>'count')::int = 1, 'q article, any line, case-insensitive';
  assert (pos_ticket_list('{"q":"S3T Brand"}')->>'count')::int = 2, 'q brand';
  assert (pos_ticket_list('{"q":"Zztest"}')->>'count')::int = 1 and pos_ticket_list('{"q":"Zztest"}')->'rows'->0->>'ticket_no' = 'D-000001',
         'q client display name';
  assert pos_ticket_list('{"q":"zzraw"}')->'rows'->0->>'ticket_no' = 'ZZ-C1', 'q client_raw';
  assert pos_ticket_list('{"q":"D-000001"}')->'rows'->0->>'ticket_no' = 'D-000001', 'q ticket number';
  assert (pos_ticket_list('{"q":"D-00000"}')->>'count')::int = 0, 'ticket number is exact, not partial';
  -- search escapes
  assert (pos_ticket_list('{"q":"%"}')->>'count')::int = 0, '% literal';
  assert (pos_ticket_list('{"q":"_"}')->>'count')::int = 0, '_ literal';
  assert (pos_ticket_list('{"q":"\\"}')->>'count')::int = 0, 'backslash';
  assert (pos_ticket_list(jsonb_build_object('q', ''''))->>'count')::int = 0, 'quote';
  assert (pos_ticket_list('{"q":"Ёж"}')->>'count')::int = 0, 'cyrillic';
  assert (pos_ticket_list('{"q":"   "}')->>'count')::int = 2, 'blank q is no filter';

  -- pagination: 51 more Colibri tickets today (so the window has 53 rows)
  insert into ops_tickets(store_id, source, ticket_no, sold_at, seller)
    select 1, 'colibri', 'ZZ-P' || lpad(g::text, 3, '0'), v_today, 'S3T Source 2' from generate_series(1, 51) g;
  res := pos_ticket_list('{"seller":"S3T Source 2"}');
  assert (res->>'count')::int = 51 and jsonb_array_length(res->'rows') = 50 and res->'rows'->0->>'ticket_no' = 'ZZ-P051'
         and (res->>'net_total')::numeric = 0, 'page 1 ' || (res->>'count');
  res := pos_ticket_list('{"seller":"S3T Source 2","page":2}');
  assert jsonb_array_length(res->'rows') = 1 and (res->>'page')::int = 2 and res->'rows'->0->>'ticket_no' = 'ZZ-P001'
         and (res->>'count')::int = 51, 'page 2 has 1 row';
  assert jsonb_array_length(pos_ticket_list('{"seller":"S3T Source 2","page":3}')->'rows') = 0, 'page 3 empty';

  -- detail
  d := pos_ticket_detail(c1);
  assert d->'ticket'->>'ticket_no' = 'ZZ-C1' and d->'ticket'->>'source' = 'colibri' and d->'ticket'->>'seller' = 'S3T Source'
         and d->'ticket'->>'client_raw' = 'Zzraw Buyer', 'detail ticket';
  foreach k in array array['seller_raw', 'card_no', 'source_file'] loop
    assert not (d->'ticket') ? k, 'detail omits ' || k;
  end loop;
  assert jsonb_array_length(d->'lines') = 2 and d->'lines'->0->>'kind' = 'sale' and d->'lines'->1->>'kind' = 'refund'
         and d->'lines'->0->>'seller' = 'S3T Source' and d->'lines'->1->>'seller' is null
         and d->'lines'->0 ? 'piece_id' and d->'lines'->0 ? 'model_id' and d->'lines'->0 ? 'variant_id', 'detail lines';
  assert jsonb_array_length(d->'payments') = 1 and (d->'payments'->0->>'amount')::numeric = 3800000, 'detail payments';
  assert d->>'client_name' = 'Zzraw Buyer', 'detail client_name raw';
  d := pos_ticket_detail((r2->>'ticket_id')::uuid);
  assert d->>'client_name' = (select display_name from crm_queue where client_id = 'DLD-9001')
         and d->'ticket'->>'receipt_text' is not null and d->'lines'->0->>'piece_id' = p1::text, 'detail live';
  assert pos_ticket_detail(gen_random_uuid()) is null, 'unknown id is null';
  assert pos_ticket_detail(null) is null, 'null id is null';

  -- by line
  select line_id into v_line from ops_ticket_lines where ticket_id = c1 and line_no = 2;
  assert pos_ticket_by_line(v_line) = c1, 'by line round trip';
  assert pos_ticket_by_line(gen_random_uuid()) is null, 'by line unknown';
end $$;

select 'pos_t5 ok' as result;
rollback;
