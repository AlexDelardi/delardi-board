-- Stock enrichment, slice 1: Colibri record, codes, receipts, costs, the view-cost right. Invented fixtures. Rolled back.
begin;
do $$
declare pl jsonb; r jsonb; v_a uuid; v_b uuid; v_rc bigint; f text;
begin
  pl := jsonb_build_object('built', 'stk t2',
    'models', jsonb_build_array(
      jsonb_build_object('model_id', 'ZY-SA', 'article', 'ZY-ART-A', 'brand', 'T2 Jeweller',
        'brand_raw', jsonb_build_array('T2 Jeweller'), 'category', 'jewellery', 'retail_category', 'ring',
        'model_name', 'Zy Ring', 'in_stock', true, 'qty_stock', 2,
        'arrival_years', '[]'::jsonb, 'variant_count', 1, 'completeness', 0, 'missing_crucial', '[]'::jsonb,
        'has_unconfirmed', false, 'metal_keys', '[]'::jsonb, 'stone_keys', '[]'::jsonb,
        'size_keys', '[]'::jsonb, 'qty_transit', 0)),
    'variants', jsonb_build_array(
      jsonb_build_object('variant_id', 'ZY-SA-V1', 'model_id', 'ZY-SA', 'in_stock', true, 'qty_stock', 2, 'qty_in', 2,
        'qty_sold', 0, 'arrival_years', '[]'::jsonb, 'found_online', false, 'sources', '[]'::jsonb, 'sort_order', 1,
        'qty_transit', 0)),
    'pieces', jsonb_build_array(
      jsonb_build_object('serial', 'ZY.00.90001', 'variant_id', 'ZY-SA-V1', 'price_uzs', 11200000),
      jsonb_build_object('serial', 'ZY.00.90002', 'variant_id', 'ZY-SA-V1')),
    'attributes', '[]'::jsonb, 'links', '[]'::jsonb, 'expected', '[]'::jsonb);
  r := cat_load(pl, 'stk t2');
  select piece_id into v_a from ops_pieces where serial = 'ZY.00.90001';
  select piece_id into v_b from ops_pieces where serial = 'ZY.00.90002';
  assert v_a is not null and v_b is not null, 'fixture loaded';

  -- rights: view_cost is its own right, off by default, Alex has it
  assert ops_has_right('Alex', 'view_cost'), 'Alex views cost';
  assert ops_has_right('Alex', 'view_stock') and ops_has_right('Alex', 'manage_stock'), 'older rights kept';
  insert into board_users(name, passcode_hash, can_view_stock) values ('T2 Viewer', 'not-a-real-hash-t2', true);
  assert not ops_has_right('T2 Viewer', 'view_cost'), 'view stock does not give view cost';

  -- a piece with nothing recorded: every block is empty, nothing fails
  r := stk_piece_origin(v_b);
  assert r->'colibri' = 'null'::jsonb and r->'receipt' = 'null'::jsonb and r->'codes' = '[]'::jsonb
         and r->>'hs_code' is null and r->>'ikpu' is null, 'empty origin: ' || r::text;
  r := stk_piece_cost(v_b);
  assert r->>'match_quality' = 'tbd' and r->>'landed_uzs' is null and r->>'margin_uzs' is null
         and r->>'shelf_price_uzs' is null, 'empty cost: ' || r::text;
  assert stk_piece_origin(gen_random_uuid()) is null and stk_piece_cost(gen_random_uuid()) is null, 'unknown piece is null';

  -- fill piece A
  insert into ops_receipts(supplier, contract, invoice_no, invoice_date, currency, arrival_date, customs_decl, source_file)
    values ('T2 Supplier SpA', 'No. T2-01', 'INV-77', '2026-10-01', 'EUR', '2026-10-14', null, 't2.xlsx') returning receipt_id into v_rc;
  update ops_pieces set receipt_id = v_rc where piece_id = v_a;
  insert into ops_piece_colibri(piece_id, data, source_file) values (v_a, '{"Бренд":"T2 Jeweller","Штрих Код":"6000000000017","НДС":0}', 't2 export.xlsx');
  insert into ops_piece_codes(piece_id, code, kind) values (v_a, '6000000000017', 'colibri'), (v_a, 'ERA-OLD-1', 'era');
  update ops_piece_codes set active = false, retired_at = now() where code = 'ERA-OLD-1';
  insert into ops_piece_costs(piece_id, invoice_price, currency, fx_rate, invoice_uzs, customs_vat_uzs, clearance_uzs, assay_uzs,
                              customs_fee_uzs, other_uzs, landed_uzs, match_quality, source_file)
    values (v_a, 500, 'EUR', 13000, 6500000, 130000, 20000, 10000, 5000, 0, 6665000, 'estimated', 't2 cost.xlsx');
  update cat_models set hs_code = '7113190000', ikpu = '07113001001000000' where model_id = 'ZY-SA';

  r := stk_piece_origin(v_a);
  assert r->'colibri'->'data'->>'Штрих Код' = '6000000000017' and r->'colibri'->>'source_file' = 't2 export.xlsx', 'colibri record: ' || r::text;
  assert r->'receipt'->>'supplier' = 'T2 Supplier SpA' and r->'receipt'->>'arrival_date' = '2026-10-14'
         and r->'receipt'->>'customs_decl' is null and r->'receipt'->>'invoice_no' = 'INV-77', 'receipt: ' || r::text;
  assert jsonb_array_length(r->'codes') = 2 and r->'codes'->0->>'kind' = 'colibri' and (r->'codes'->0->>'active')::boolean
         and not (r->'codes'->1->>'active')::boolean, 'codes, active first: ' || (r->'codes')::text;
  assert r->>'hs_code' = '7113190000' and r->>'ikpu' = '07113001001000000', 'hs/ikpu';
  -- no money in the origin answer
  assert r::text !~ 'landed|invoice_price|margin|6665000', 'origin carries no cost: ' || r::text;

  -- cost: shelf 11 200 000 incl. 12% VAT = 10 000 000 net; margin = 10 000 000 - 6 665 000
  r := stk_piece_cost(v_a);
  assert (r->>'landed_uzs')::numeric = 6665000 and r->>'match_quality' = 'estimated' and (r->>'invoice_price')::numeric = 500
         and r->>'currency' = 'EUR', 'cost: ' || r::text;
  assert (r->>'shelf_price_uzs')::numeric = 11200000 and (r->>'vat_pct')::numeric = 12 and (r->>'net_price_uzs')::numeric = 10000000
         and (r->>'margin_uzs')::numeric = 3335000 and (r->>'margin_pct')::numeric = 33.4, 'margin: ' || r::text;

  -- the piece answer of v1 still carries no cost, and the list finds a piece by any of its codes, retired too
  r := stk_piece_detail(v_a);
  assert r::text !~ 'landed|invoice_price|margin_uzs', 'detail carries no cost';
  assert (stk_piece_list('{"q":"6000000000017"}')->>'count')::int = 1 and (stk_piece_list('{"q":"era-old-1"}')->>'count')::int = 1, 'search by code';

  -- constraints
  begin insert into ops_piece_codes(piece_id, code, kind) values (v_a, 'X', 'nonsense'); assert false, 'bad kind accepted';
  exception when check_violation then null; end;
  begin insert into ops_piece_costs(piece_id, match_quality) values (v_b, 'tbd'); assert false, 'tbd row accepted';
  exception when check_violation then null; end;

  -- nothing is callable or readable by the API roles
  foreach f in array array['stk_piece_origin(uuid, boolean)', 'stk_piece_cost(uuid)', 'stk_colibri_cost_columns()'] loop
    assert not has_function_privilege('anon', 'public.' || f, 'execute') and not has_function_privilege('authenticated', 'public.' || f, 'execute'), f || ' is closed';
  end loop;
  foreach f in array array['ops_receipts', 'ops_piece_colibri', 'ops_piece_codes', 'ops_piece_costs'] loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || f)::regclass), f || ' has RLS';
    assert not has_table_privilege('anon', 'public.' || f, 'select') and not has_table_privilege('authenticated', 'public.' || f, 'select'), f || ' is closed';
  end loop;
  raise notice 'stk_t2 ok';
end $$;
rollback;
