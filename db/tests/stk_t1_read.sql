-- Stock tool v1, task 1: view-stock right and the stk_* read functions. Invented fixtures. Rolled back.
begin;
do $$
declare pl jsonb; r jsonb; v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_line uuid; v_tid uuid; v_tid2 uuid;
        v_rev1 bigint; v_rev2 bigint; f text; n int;
begin
  pl := jsonb_build_object('built', 'stk t1',
    'models', jsonb_build_array(
      jsonb_build_object('model_id', 'ZZ-SA', 'article', 'ZZ-ART-A', 'brand', 'T1 Watchmaker',
        'brand_raw', jsonb_build_array('T1 Watchmaker'), 'category', 'watch', 'retail_category', 'watch',
        'collection', 'Zz Vintage', 'model_name', 'Zz Infinity Edition', 'in_stock', true, 'qty_stock', 2,
        'arrival_years', '[]'::jsonb, 'variant_count', 1, 'completeness', 0, 'missing_crucial', '[]'::jsonb,
        'has_unconfirmed', false, 'metal_keys', '["white_gold"]'::jsonb, 'stone_keys', '[]'::jsonb,
        'size_keys', '[]'::jsonb, 'qty_transit', 0, 'gender', 'unisex'),
      jsonb_build_object('model_id', 'ZZ-SB', 'article', 'ZZ-ART-B', 'brand', 'T1 Jeweller',
        'brand_raw', jsonb_build_array('T1 Jeweller'), 'category', 'jewellery', 'retail_category', 'bracelet_element',
        'model_name', 'Zz 100% Hoops', 'in_stock', true, 'qty_stock', 2,
        'arrival_years', '[]'::jsonb, 'variant_count', 1, 'completeness', 0, 'missing_crucial', '[]'::jsonb,
        'has_unconfirmed', false, 'metal_keys', '[]'::jsonb, 'stone_keys', '[]'::jsonb,
        'size_keys', '[]'::jsonb, 'qty_transit', 0)),
    'variants', jsonb_build_array(
      jsonb_build_object('variant_id', 'ZZ-SA-V1', 'model_id', 'ZZ-SA', 'in_stock', true, 'qty_stock', 2, 'qty_in', 2,
        'qty_sold', 0, 'arrival_years', '[]'::jsonb, 'found_online', false, 'sources', '[]'::jsonb, 'sort_order', 1,
        'qty_transit', 0),
      jsonb_build_object('variant_id', 'ZZ-SB-V1', 'model_id', 'ZZ-SB', 'in_stock', true, 'qty_stock', 2, 'qty_in', 2,
        'qty_sold', 0, 'arrival_years', '[]'::jsonb, 'found_online', false, 'sources', '[]'::jsonb, 'sort_order', 1,
        'qty_transit', 0)),
    'pieces', jsonb_build_array(
      jsonb_build_object('serial', 'ZZ.00.80001', 'variant_id', 'ZZ-SA-V1', 'size', '40', 'price_uzs', 50000000),
      jsonb_build_object('serial', 'ZZ.00.80002', 'variant_id', 'ZZ-SA-V1', 'price_uzs', 30000000),
      jsonb_build_object('serial', 'ZZ.00.80003', 'variant_id', 'ZZ-SB-V1', 'price_uzs', 20000000),
      jsonb_build_object('serial', 'ZZ.00.80004', 'variant_id', 'ZZ-SB-V1')),
    'attributes', '[]'::jsonb, 'links', '[]'::jsonb, 'expected', '[]'::jsonb);
  r := cat_load(pl, 'stk t1');
  update cat_models set metal_keys = '{white_gold}', gender = 'unisex' where model_id = 'ZZ-SA';
  select piece_id into v_a from ops_pieces where serial = 'ZZ.00.80001';
  select piece_id into v_b from ops_pieces where serial = 'ZZ.00.80002';
  select piece_id into v_c from ops_pieces where serial = 'ZZ.00.80003';
  select piece_id into v_d from ops_pieces where serial = 'ZZ.00.80004';
  assert v_a is not null and v_d is not null, 'fixture loaded';
  update ops_pieces set state = 'in_stock' where piece_id in (v_a, v_d);
  update ops_pieces set state = 'reserved', state_note = 'for a visitor' where piece_id = v_b;
  update ops_pieces set state = 'sold' where piece_id = v_c;
  update ops_pieces set barcode = 'ZZBAR0001' where piece_id = v_a;

  -- rights
  assert ops_has_right('Alex', 'view_stock'), 'Alex views stock';
  assert ops_has_right('Alex', 'manage_stock'), 'manage_stock kept';
  insert into board_users(name, passcode_hash) values ('T1 Nobody', 'not-a-real-hash-t1');
  assert not ops_has_right('T1 Nobody', 'view_stock'), 'default is no';
  assert not ops_has_right('Alex', 'no_such_right'), 'unknown right is no';
  assert exists (select 1 from information_schema.columns where table_name = 'editor_sessions' and column_name = 'can_use_stock'), 'can_use_stock column';

  -- list: count and order (brand, article, serial)
  r := stk_piece_list('{"q":"ZZ.00.8"}');
  assert (r->>'count')::int = 4 and (r->>'page')::int = 1 and (r->>'page_size')::int = 50, 'count: ' || r::text;
  assert (select string_agg(x->>'serial', ',') from jsonb_array_elements(r->'rows') x)
         = 'ZZ.00.80003,ZZ.00.80004,ZZ.00.80001,ZZ.00.80002', 'order: ' || (r->'rows')::text;
  assert r->'rows'->0 ?& array['piece_id','serial','barcode','brand','article','collection','model_name','colour','size',
                               'category','state','state_since','price_uzs'], 'row fields';
  assert r->'rows'->2->>'barcode' = 'ZZBAR0001' and r->'rows'->2->>'category' = 'watch'
         and (r->'rows'->2->>'price_uzs')::numeric = 50000000 and r->'rows'->2->>'article' = 'ZZ-ART-A', 'row values';
  assert r->'rows'->1->'price_uzs' = 'null'::jsonb, 'unpriced is null';

  -- q: serial, barcode, reference, model name, words (AND), literal %
  assert (stk_piece_list('{"q":"zz.00.80002"}')->>'count')::int = 1, 'q serial, case-insensitive: ' || stk_piece_list('{"q":"zz.00.80002"}')::text;
  assert (stk_piece_list('{"q":"ZZBAR0001"}')->>'count')::int = 1, 'q barcode';
  assert (stk_piece_list('{"q":"ZZ-ART-B"}')->>'count')::int = 2, 'q reference';
  assert (stk_piece_list('{"q":"infinity edition"}')->>'count')::int = 2, 'q model name words';
  assert (stk_piece_list('{"q":"infinity hoops"}')->>'count')::int = 0, 'words are ANDed';
  assert (stk_piece_list('{"q":"100%"}')->>'count')::int = 2, 'literal percent matches';
  assert (stk_piece_list('{"q":"%"}')->>'count')::int = 2, 'percent alone is literal, not a wildcard';
  assert (stk_piece_list('{"q":"_"}')->>'count')::int = 0, 'underscore is literal';
  assert (stk_piece_list('{"q":"Zz Vintage"}')->>'count')::int = 2, 'q collection';
  assert (stk_piece_list('{"q":"T1 Jeweller"}')->>'count')::int = 2, 'q brand';

  -- states, brand, category, price
  r := stk_piece_list('{"q":"ZZ.00.8","states":["in_stock","reserved"]}');
  assert (r->>'count')::int = 3, 'states filter: ' || r::text;
  assert (stk_piece_list('{"q":"ZZ.00.8","states":["sold"]}')->>'count')::int = 1, 'states sold';
  assert (stk_piece_list('{"q":"ZZ.00.8","brand":"T1 Jeweller"}')->>'count')::int = 2, 'brand filter';
  assert (stk_piece_list('{"q":"ZZ.00.8","category":"watch"}')->>'count')::int = 2, 'category filter';
  assert (stk_piece_list('{"q":"ZZ.00.8","price_min":25000000}')->>'count')::int = 2, 'price_min';
  assert (stk_piece_list('{"q":"ZZ.00.8","price_max":25000000}')->>'count')::int = 1, 'price_max excludes unpriced';
  r := stk_piece_list('{"q":"ZZ.00.8","price_min":20000000,"price_max":30000000}');
  assert (r->>'count')::int = 2, 'price range: ' || r::text;

  -- totals: ignore states and page; unpriced counted, adds 0
  r := stk_piece_list('{"q":"ZZ.00.8","states":["sold"]}');
  assert (select count(*) from jsonb_array_elements(r->'totals')) = 3, 'totals show every state: ' || (r->'totals')::text;
  assert (select (x->>'pieces')::int from jsonb_array_elements(r->'totals') x where x->>'state' = 'in_stock') = 2, 'in_stock pieces';
  assert (select (x->>'value')::numeric from jsonb_array_elements(r->'totals') x where x->>'state' = 'in_stock') = 50000000, 'in_stock value';
  assert (select (x->>'unpriced')::int from jsonb_array_elements(r->'totals') x where x->>'state' = 'in_stock') = 1, 'in_stock unpriced';
  assert (select (x->>'value')::numeric from jsonb_array_elements(r->'totals') x where x->>'state' = 'sold') = 20000000, 'sold value';
  assert (select (x->>'unpriced')::int from jsonb_array_elements(r->'totals') x where x->>'state' = 'sold') = 0, 'sold unpriced';

  -- paging: 51 more pieces
  insert into ops_pieces(store_id, brand, serial, state)
  select 1, 'T1 Pager', 'ZZ.00.9' || lpad(g::text, 4, '0'), 'in_stock' from generate_series(1, 51) g;
  r := stk_piece_list('{"q":"T1 Pager"}');
  assert (r->>'count')::int = 51 and jsonb_array_length(r->'rows') = 50, 'page 1 has 50';
  r := stk_piece_list('{"q":"T1 Pager","page":2}');
  assert (r->>'page')::int = 2 and jsonb_array_length(r->'rows') = 1 and r->'rows'->0->>'serial' = 'ZZ.00.90051', 'page 2 has 1';
  assert (select (x->>'pieces')::int from jsonb_array_elements(r->'totals') x where x->>'state' = 'in_stock') = 51, 'totals ignore page';
  -- a page past the end is empty, not an error
  assert jsonb_array_length(stk_piece_list('{"q":"T1 Pager","page":9}')->'rows') = 0, 'page past the end';

  -- detail: events newest first, sale with ticket_no, review
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status) values (1, 'colibri', 'T1-9001', date '2026-11-10', 'posted')
    returning ticket_id into v_tid;
  insert into ops_ticket_lines(ticket_id, line_no, kind, piece_id, serial_raw, price_list, price_current, net)
    values (v_tid, 1, 'sale', v_c, 'ZZ.00.80003', 20000000, 20000000, 20000000) returning line_id into v_line;
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status) values (1, 'training', 'TRN-9001', date '2026-11-12', 'posted')
    returning ticket_id into v_tid2;
  insert into ops_ticket_lines(ticket_id, line_no, kind, piece_id, serial_raw, price_list, price_current, net)
    values (v_tid2, 1, 'sale', v_c, 'ZZ.00.80003', 20000000, 20000000, 20000000);
  insert into ops_piece_events(piece_id, at, from_state, to_state, reason, ref_kind, ref_id, actor, note) values
    (v_c, '2027-01-01 10:00+00', null, 'in_stock', 'arrived', 'cat_run', '1', 'sync', null),
    (v_c, '2027-01-02 10:00+00', 'in_stock', 'sold', 'sold', 'ticket_line', v_line::text, 'sync', 'sold at the till');
  insert into ops_review(piece_id, kind, raised_at, note) values (v_c, 'ticket_conflict', '2026-11-11 08:00+00', 'newer one') returning review_id into v_rev2;
  insert into ops_review(piece_id, kind, raised_at, status, resolution, resolved_by, resolved_at, note)
    values (v_c, 'serial_reused', '2026-11-02 08:00+00', 'resolved', 'still_in_stock', 'Alex', '2026-11-03 08:00+00', 'checked');

  r := stk_piece_detail(v_c);
  assert r->'piece'->>'serial' = 'ZZ.00.80003' and r->'piece'->>'state' = 'sold', 'detail piece: ' || r::text;
  assert r->'piece' ?& array['hold_client_id','hold_until','state_note','shipped_on','first_seen_at'], 'detail piece extra fields';
  assert stk_piece_detail(v_a)->'model'->>'gender' = 'unisex' and stk_piece_detail(v_a)->'model'->'metal_keys' = '["white_gold"]'::jsonb, 'model gender and metals';
  assert r->'model' ?& array['metal_keys','stone_keys','gender','subcategory'], 'model fields: ' || (r->'model')::text;
  assert jsonb_array_length(r->'events') = 3 and r->'events'->0->>'to_state' = 'sold'
         and r->'events'->1->>'to_state' = 'in_stock', 'events newest first: ' || (r->'events')::text;
  assert r->'events'->0->>'ticket_no' = 'T1-9001' and r->'events'->0->>'ticket_id' = v_tid::text, 'event ticket';
  assert r->'events'->1->'ticket_no' = 'null'::jsonb, 'no ticket on other events';
  assert jsonb_array_length(r->'sales') = 2, 'sales: ' || (r->'sales')::text;
  assert exists (select 1 from jsonb_array_elements(r->'sales') s where s->>'ticket_no' = 'T1-9001' and s->>'source' = 'colibri'
                   and s->>'kind' = 'sale' and (s->>'net')::numeric = 20000000 and s->>'status' = 'posted'), 'sale row';
  assert exists (select 1 from jsonb_array_elements(r->'sales') s where s->>'source' = 'training'), 'training sale shown, marked';
  assert jsonb_array_length(r->'reviews') = 2, 'reviews';
  assert exists (select 1 from jsonb_array_elements(r->'reviews') s where s->>'status' = 'open' and s->>'kind' = 'ticket_conflict'), 'open review';
  assert exists (select 1 from jsonb_array_elements(r->'reviews') s where s->>'resolution' = 'still_in_stock' and s->>'resolved_by' = 'Alex'), 'resolved review';
  assert r->'client_name' = 'null'::jsonb, 'no client';
  assert stk_piece_detail(gen_random_uuid()) is null, 'unknown piece is null';
  assert not (r::text ilike '%cost%' or r::text ilike '%margin%'), 'no cost in detail';

  -- held piece: client name from crm_queue
  insert into crm_clients(client_id, record_type, name_confirmed) values ('DLD-9901', 'client', 'Zz Holder');
  update ops_pieces set hold_client_id = 'DLD-9901', hold_until = date '2026-12-01' where piece_id = v_b;
  r := stk_piece_detail(v_b);
  assert r->>'client_name' = 'Zz Holder' and r->'piece'->>'hold_client_id' = 'DLD-9901', 'client name: ' || r::text;

  -- review list: open only, oldest first
  insert into ops_review(piece_id, kind, raised_at, note) values (v_a, 'missing_from_export', '2026-11-05 08:00+00', 'older one');
  r := stk_review_list();
  assert jsonb_array_length(r) = 2 and r->0->>'kind' = 'missing_from_export' and r->1->>'kind' = 'ticket_conflict', 'review order: ' || r::text;
  assert r->0->'piece'->>'serial' = 'ZZ.00.80001' and r->0->'piece' ?& array['piece_id','serial','brand','article','model_name','state'], 'review piece';
  assert r->0->>'note' = 'older one' and r->0 ? 'review_id' and r->0 ? 'raised_at', 'review fields';

  -- facets
  r := stk_facets();
  assert r->'brands' @> '["T1 Jeweller","T1 Watchmaker","T1 Pager"]'::jsonb, 'brands: ' || r::text;
  assert r->'categories' @> '["watch","bracelet_element"]'::jsonb, 'categories: ' || r::text;
  assert (select array_agg(x order by ord) from jsonb_array_elements_text(r->'brands') with ordinality t(x, ord))
         = (select array_agg(x order by x) from jsonb_array_elements_text(r->'brands') x), 'brands sorted';

  -- export: all filtered rows, all pages
  r := stk_export('{"q":"T1 Pager"}');
  assert jsonb_typeof(r) = 'array' and jsonb_array_length(r) = 51, 'export all pages: ' || jsonb_array_length(r);
  assert jsonb_array_length(stk_export('{"q":"ZZ.00.8","states":["sold"]}')) = 1, 'export honours filters';
  -- cap
  insert into ops_pieces(store_id, brand, serial, state)
  select 1, 'T1 Bulk', 'ZZ.01.' || lpad(g::text, 5, '0'), 'in_stock' from generate_series(1, 5000) g;
  assert jsonb_array_length(stk_export('{"q":"T1 Bulk"}')) = 5000, 'exactly 5000 is fine';
  insert into ops_pieces(store_id, brand, serial, state) values (1, 'T1 Bulk', 'ZZ.01.99999', 'in_stock');
  begin
    perform stk_export('{"q":"T1 Bulk"}');
    raise exception 'export over the cap was accepted';
  exception when others then
    assert sqlerrm = 'too many rows to export (5001); narrow the filters', 'cap message: ' || sqlerrm;
  end;

  -- privileges
  foreach f in array array['stk_piece_list(jsonb)', 'stk_piece_detail(uuid)', 'stk_review_list()', 'stk_facets()', 'stk_export(jsonb)', 'stk_base(jsonb)', 'stk_row_json(stk_row)', 'ops_has_right(text,text)'] loop
    assert not has_function_privilege('anon', 'public.' || f, 'execute'), 'anon must not run ' || f;
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute'), 'authenticated must not run ' || f;
  end loop;
end $$;

select 'stk_t1 ok' as result;
rollback;
