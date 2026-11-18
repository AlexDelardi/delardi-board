-- Stock enrichment, slice 2: stk_load_enrichment. Invented fixtures. Rolled back.
begin;
do $$
declare pl jsonb; r jsonb; v_a uuid; v_b uuid; p jsonb;
begin
  pl := jsonb_build_object('built', 'stk t3',
    'models', jsonb_build_array(jsonb_build_object('model_id', 'ZY-SA', 'article', 'ZY-ART-A', 'brand', 'T3 Jeweller',
        'brand_raw', jsonb_build_array('T3 Jeweller'), 'category', 'jewellery', 'retail_category', 'ring', 'model_name', 'Zy Ring',
        'in_stock', true, 'qty_stock', 2, 'arrival_years', '[]'::jsonb, 'variant_count', 1, 'completeness', 0, 'missing_crucial', '[]'::jsonb,
        'has_unconfirmed', false, 'metal_keys', '[]'::jsonb, 'stone_keys', '[]'::jsonb, 'size_keys', '[]'::jsonb, 'qty_transit', 0)),
    'variants', jsonb_build_array(jsonb_build_object('variant_id', 'ZY-SA-V1', 'model_id', 'ZY-SA', 'in_stock', true, 'qty_stock', 2, 'qty_in', 2,
        'qty_sold', 0, 'arrival_years', '[]'::jsonb, 'found_online', false, 'sources', '[]'::jsonb, 'sort_order', 1, 'qty_transit', 0)),
    'pieces', jsonb_build_array(jsonb_build_object('serial', 'ZY.00.80001', 'variant_id', 'ZY-SA-V1', 'price_uzs', 11200000),
                                jsonb_build_object('serial', 'ZY.00.80002', 'variant_id', 'ZY-SA-V1')),
    'attributes', '[]'::jsonb, 'links', '[]'::jsonb, 'expected', '[]'::jsonb);
  perform cat_load(pl, 'stk t3');
  select piece_id into v_a from ops_pieces where serial = 'ZY.00.80001';
  select piece_id into v_b from ops_pieces where serial = 'ZY.00.80002';

  p := jsonb_build_object(
    'receipts', jsonb_build_array(jsonb_build_object('colibri_no', 'T3-7', 'arrival_date', '2026-10-14', 'supplier', 'T3 Supplier', 'contract', 'No. 1', 'currency', 'EUR'),
                                  jsonb_build_object('colibri_no', 'T3-8', 'arrival_date', null)),
    'pieces', jsonb_build_array(
      jsonb_build_object('brand', 't3 jeweller', 'serial', 'zy.00.80001', 'barcode', '6000000000024', 'receipt_no', 'T3-7', 'data', jsonb_build_object('Бренд', 'T3 Jeweller', 'НДС', 0.12)),
      jsonb_build_object('brand', 'T3 Jeweller', 'serial', 'ZY.00.80002', 'barcode', '6000000000024', 'receipt_no', 'T3-8', 'data', jsonb_build_object('Бренд', 'T3 Jeweller')),
      jsonb_build_object('brand', 'T3 Jeweller', 'serial', 'NOT-IN-TOOL', 'barcode', '1', 'receipt_no', 'T3-8', 'data', '{}'::jsonb)),
    'costs', jsonb_build_array(
      jsonb_build_object('brand', 'T3 Jeweller', 'serial', 'ZY.00.80001', 'invoice_price', 500, 'currency', 'EUR', 'fx_rate', 13000, 'invoice_uzs', 6500000,
        'customs_vat_uzs', 130000, 'clearance_uzs', 20000, 'assay_uzs', 10000, 'customs_fee_uzs', 5000, 'other_uzs', 0, 'landed_uzs', 6665000,
        'match_quality', 'exact', 'source_file', 't3.xlsx (1C T3, 2026-10-01)'),
      jsonb_build_object('brand', 'T3 Jeweller', 'serial', 'NOT-IN-TOOL', 'landed_uzs', 1, 'match_quality', 'exact')));
  r := stk_load_enrichment(p, 't3 stock report.xlsx');
  assert (r->>'pieces_in')::int = 3 and (r->>'pieces_found')::int = 2 and (r->>'pieces_not_in_stock_tool')::int = 1
     and r->'not_found_sample'->>0 = 'T3 Jeweller NOT-IN-TOOL', 'found / missing: ' || r::text;
  assert (r->>'colibri_new')::int = 2 and (r->>'codes_added')::int = 2 and (r->>'receipts_new')::int = 2
     and (r->>'costs_set')::int = 1 and (r->>'costs_without_piece')::int = 1, 'first load: ' || r::text;

  r := stk_piece_origin(v_a);
  assert r->'colibri'->'data'->>'НДС' = '0.12' and r->'colibri'->>'source_file' = 't3 stock report.xlsx', 'colibri: ' || r::text;
  assert r->'receipt'->>'supplier' = 'T3 Supplier' and r->'receipt'->>'arrival_date' = '2026-10-14' and r->'receipt'->>'currency' = 'EUR', 'receipt: ' || r::text;
  assert r->'codes'->0->>'code' = '6000000000024' and (r->'codes'->0->>'active')::boolean, 'code';
  assert (select barcode from ops_pieces where piece_id = v_a) = '6000000000024', 'barcode on the piece';
  assert stk_piece_origin(v_b)->'receipt'->>'arrival_date' is null, 'arrival unknown stays unknown';
  r := stk_piece_cost(v_a);
  assert r->>'match_quality' = 'exact' and (r->>'landed_uzs')::numeric = 6665000 and (r->>'margin_uzs')::numeric = 3335000, 'cost: ' || r::text;
  assert stk_piece_cost(v_b)->>'match_quality' = 'tbd', 'no cost stays TBD';

  -- the same payload again changes nothing
  r := stk_load_enrichment(p, 't3 stock report.xlsx');
  assert (r->>'colibri_same')::int = 2 and (r->>'colibri_new')::int = 0 and (r->>'colibri_changed')::int = 0 and (r->>'codes_added')::int = 0
     and (r->>'codes_retired')::int = 0 and (r->>'receipts_new')::int = 0 and (r->>'receipts_updated')::int = 0, 'second load: ' || r::text;
  assert (select count(*) from ops_piece_codes where piece_id in (v_a, v_b)) = 2 and (select count(*) from ops_receipts where colibri_no like 'T3-%') = 2, 'no duplicates';

  -- a later report: new barcode retires the old one, a changed column updates the record, a date arrives, an unknown date does not erase one
  p := jsonb_build_object(
    'receipts', jsonb_build_array(jsonb_build_object('colibri_no', 'T3-8', 'arrival_date', '2026-11-02'), jsonb_build_object('colibri_no', 'T3-7', 'arrival_date', null)),
    'pieces', jsonb_build_array(jsonb_build_object('brand', 'T3 Jeweller', 'serial', 'ZY.00.80001', 'barcode', '6000000000031', 'receipt_no', 'T3-7',
        'data', jsonb_build_object('Бренд', 'T3 Jeweller', 'НДС', 12))));
  r := stk_load_enrichment(p, 't3 later.xlsx');
  assert (r->>'colibri_changed')::int = 1 and (r->>'codes_added')::int = 1 and (r->>'codes_retired')::int = 1 and (r->>'receipts_updated')::int = 1, 'later load: ' || r::text;
  r := stk_piece_origin(v_a);
  assert r->'codes'->0->>'code' = '6000000000031' and not (r->'codes'->1->>'active')::boolean and r->'codes'->1->>'retired_at' is not null
     and r->'receipt'->>'arrival_date' = '2026-10-14' and r->'receipt'->>'supplier' = 'T3 Supplier' and r->'colibri'->>'source_file' = 't3 later.xlsx', 'after later load: ' || r::text;
  assert stk_piece_origin(v_b)->'receipt'->>'arrival_date' = '2026-11-02', 'date filled in';
  assert (stk_piece_list('{"q":"6000000000024"}')->>'count')::int = 2, 'old and shared code still finds both';

  -- a corrected match: with costs_complete, a cost the payload no longer carries is withdrawn; without it, costs stay
  r := stk_load_enrichment(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('brand', 'T3 Jeweller', 'serial', 'ZY.00.80001'))), 't3');
  assert (r->>'costs_removed')::int = 0 and stk_piece_cost(v_a)->>'match_quality' = 'exact', 'costs kept by default';
  insert into ops_piece_costs(piece_id, landed_uzs, match_quality) values (v_b, 1, 'estimated');
  r := stk_load_enrichment(jsonb_build_object('costs_complete', true, 'pieces', jsonb_build_array(jsonb_build_object('brand', 'T3 Jeweller', 'serial', 'ZY.00.80001')),
        'costs', '[]'::jsonb), 't3');
  assert (r->>'costs_removed')::int = 1 and stk_piece_cost(v_a)->>'match_quality' = 'tbd' and stk_piece_cost(v_b)->>'match_quality' = 'estimated', 'withdrawn only for the payload''s pieces: ' || r::text;

  -- Codex on #15: a narrower report adds and changes columns but never erases one already on file
  r := stk_load_enrichment(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('brand', 'T3 Jeweller', 'serial', 'ZY.00.80001',
        'data', jsonb_build_object('НДС', 15, 'Описание', 'new')))), 't3 narrow.xlsx');
  assert (r->>'colibri_changed')::int = 1, 'narrow load: ' || r::text;
  r := stk_piece_origin(v_a, true)->'colibri'->'data';
  assert r->>'Бренд' = 'T3 Jeweller' and r->>'НДС' = '15' and r->>'Описание' = 'new', 'merged, not replaced: ' || r::text;

  -- Codex on #14: purchase-price columns of the Colibri record need the cost right
  update ops_piece_colibri set data = data || '{"Цена оригинального инвойса": 875, "Инв. цена, долл": 983.15, "Коэф-т 1": 2.31, "Коэф-т 2": 1, "Цена в СФ": 5, "Рек. цена, долл": 2270}' where piece_id = v_a;
  r := stk_piece_origin(v_a)->'colibri'->'data';
  assert not (r ?| array['Цена оригинального инвойса', 'Инв. цена, долл', 'Коэф-т 1', 'Коэф-т 2', 'Цена в СФ']) and r->>'Рек. цена, долл' = '2270' and r->>'Бренд' = 'T3 Jeweller', 'no purchase prices without the right: ' || r::text;
  assert stk_piece_origin(v_a, false)->'colibri'->'data' = r, 'default is without';
  r := stk_piece_origin(v_a, true)->'colibri'->'data';
  assert r->>'Цена оригинального инвойса' = '875' and r->>'Коэф-т 1' = '2.31', 'with the right: ' || r::text;

  begin perform stk_load_enrichment('{"pieces": 5}', 'x'); assert false, 'bad payload accepted'; exception when raise_exception then null; end;
  assert not has_function_privilege('anon', 'public.stk_load_enrichment(jsonb, text)', 'execute')
     and not has_function_privilege('authenticated', 'public.stk_load_enrichment(jsonb, text)', 'execute'), 'loader is closed';
  raise notice 'stk_t3 ok';
end $$;
rollback;
