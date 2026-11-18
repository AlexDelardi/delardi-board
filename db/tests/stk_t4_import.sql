-- Stock enrichment, slice 3: stk_import (preview and apply). Invented fixtures. Rolled back.
begin;
do $$
declare pl jsonb; r jsonb; v_a uuid; v_b uuid; f jsonb; rowa jsonb; rowb jsonb; rownew jsonb; x jsonb;
begin
  pl := jsonb_build_object('built', 'stk t4',
    'models', jsonb_build_array(jsonb_build_object('model_id', 'ZY-SA', 'article', 'ZY-ART-A', 'brand', 'T4 Jeweller',
        'brand_raw', jsonb_build_array('T4 Jeweller'), 'category', 'jewellery', 'retail_category', 'ring', 'model_name', 'Zy Ring',
        'in_stock', true, 'qty_stock', 2, 'arrival_years', '[]'::jsonb, 'variant_count', 1, 'completeness', 0, 'missing_crucial', '[]'::jsonb,
        'has_unconfirmed', false, 'metal_keys', '[]'::jsonb, 'stone_keys', '[]'::jsonb, 'size_keys', '[]'::jsonb, 'qty_transit', 0)),
    'variants', jsonb_build_array(jsonb_build_object('variant_id', 'ZY-SA-V1', 'model_id', 'ZY-SA', 'in_stock', true, 'qty_stock', 2, 'qty_in', 2,
        'qty_sold', 0, 'arrival_years', '[]'::jsonb, 'found_online', false, 'sources', '[]'::jsonb, 'sort_order', 1, 'qty_transit', 0)),
    'pieces', jsonb_build_array(jsonb_build_object('serial', 'ZY.00.70001', 'variant_id', 'ZY-SA-V1', 'price_uzs', 11200000),
                                jsonb_build_object('serial', 'ZY.00.70002', 'variant_id', 'ZY-SA-V1')),
    'attributes', '[]'::jsonb, 'links', '[]'::jsonb, 'expected', '[]'::jsonb);
  perform cat_load(pl, 'stk t4');
  select piece_id into v_a from ops_pieces where serial = 'ZY.00.70001';
  select piece_id into v_b from ops_pieces where serial = 'ZY.00.70002';

  rowa := jsonb_build_object('row', 2, 'colibri', jsonb_build_object('Бренд', 'T4 Jeweller', 'Артикул', 'ZY-ART-A', 'Серийный номер', 'zy.00.70001',
            'Цена оригинального инвойса', 875, 'Состав', '', 'Страна', 'Италия'),
          'extra', jsonb_build_object('hs_code', '7113190000', 'ikpu', 'TBD', 'supplier', 'T4 Supplier SpA', 'contract', 'No. 4', 'invoice_no', 'INV-4',
            'invoice_date', '2026-10-01', 'currency', 'EUR', 'arrival_date', '2026-10-14', 'customs_decl', ' ', 'brand_barcode', '8050000000011',
            'category', 'Ring', 'metal', 'White gold', 'metal_purity', '750', 'name_uz', 'Uzuk', 'store', 'tbd'));
  rowb := jsonb_build_object('row', 3, 'colibri', jsonb_build_object('Бренд', 'T4 Jeweller', 'Артикул', 'ZY-ART-A', 'Серийный номер', 'ZY.00.70002'),
          'extra', jsonb_build_object('supplier', 'T4 Supplier SpA', 'invoice_no', 'inv-4', 'arrival_date', '2026-10-14'));
  rownew := jsonb_build_object('row', 4, 'colibri', jsonb_build_object('Бренд', 'T4 Jeweller', 'Артикул', 'ZY-ART-A', 'Серийный номер', 'ZY.00.79999', 'Страна', 'Италия'),
          'extra', jsonb_build_object('supplier', 'T4 Supplier SpA', 'invoice_no', 'INV-4'));
  f := jsonb_build_object('file_name', 't4 upload.xlsx', 'rows', jsonb_build_array(rowa, rowb, rownew));

  -- rights
  insert into board_users(name, passcode_hash, can_view_stock) values ('T4 Viewer', 'not-a-real-hash-t4', true);
  begin perform stk_import(f, 'T4 Viewer', false); assert false, 'viewer may import'; exception when raise_exception then null; end;

  -- preview: says what would happen, changes nothing
  r := stk_import(f, 'Alex', false);
  assert not (r->>'applied')::boolean and r->'summary' = '{"rows":3,"update":2,"same":0,"pending":1,"error":0}'::jsonb, 'preview summary: ' || (r->'summary')::text;
  x := r->'rows'->0;
  assert x->>'status' = 'update' and (x->>'row')::int = 2 and x->>'piece_id' = v_a::text and x->>'serial' = 'zy.00.70001', 'row a: ' || x::text;
  assert x->'changes' = '{"colibri_new":5,"colibri_changed":0,"details":4,"receipt":"new","brand_code":true,"hs_code":true,"ikpu":false}'::jsonb, 'row a changes: ' || (x->'changes')::text;
  assert r->'rows'->2->>'status' = 'pending', 'unknown serial waits';
  assert (select count(*) from ops_piece_colibri where piece_id in (v_a, v_b)) = 0 and (select count(*) from ops_upload_pending) = 0
     and (select hs_code from cat_models where model_id = 'ZY-SA') is null and (select receipt_id from ops_pieces where piece_id = v_a) is null, 'preview wrote nothing';

  -- apply
  r := stk_import(f, 'Alex', true);
  assert (r->>'applied')::boolean and (r->>'waiting')::int = 1, 'applied: ' || r::text;
  x := stk_piece_origin(v_a, true);
  assert x->'colibri'->'data'->>'Страна' = 'Италия' and x->'colibri'->'data'->>'Цена оригинального инвойса' = '875' and not (x->'colibri'->'data' ? 'Состав')
     and x->'colibri'->>'source_file' = 't4 upload.xlsx', 'colibri: ' || x::text;
  assert not (stk_piece_origin(v_a)->'colibri'->'data' ? 'Цена оригинального инвойса'), 'invoice price still needs the cost right';
  assert x->'receipt'->>'supplier' = 'T4 Supplier SpA' and x->'receipt'->>'invoice_no' = 'INV-4' and x->'receipt'->>'arrival_date' = '2026-10-14'
     and x->'receipt'->>'customs_decl' is null and x->'receipt'->>'currency' = 'EUR', 'receipt: ' || (x->'receipt')::text;
  assert x->>'hs_code' = '7113190000' and x->>'ikpu' is null, 'hs set, TBD ikpu left empty';
  assert x->'details' = '{"category":"Ring","metal":"White gold","metal_purity":"750","name_uz":"Uzuk"}'::jsonb, 'details: ' || (x->'details')::text;
  assert exists (select 1 from ops_piece_codes where piece_id = v_a and kind = 'brand' and code = '8050000000011' and active), 'brand barcode';
  assert (select receipt_id from ops_pieces where piece_id = v_b) = (select receipt_id from ops_pieces where piece_id = v_a), 'same invoice, same document (case ignored)';
  assert (select count(*) from ops_receipts where supplier = 'T4 Supplier SpA') = 1, 'one document';

  -- the same file again: nothing to change
  r := stk_import(f, 'Alex', false);
  assert r->'summary' = '{"rows":3,"update":0,"same":2,"pending":1,"error":0}'::jsonb, 'second preview: ' || (r->'summary')::text;

  -- a different value never overwrites: it is reported
  r := stk_import(jsonb_build_object('rows', jsonb_build_array(jsonb_build_object('row', 2, 'colibri', rowa->'colibri',
        'extra', jsonb_build_object('hs_code', '7113110000', 'supplier', 'Somebody Else', 'ikpu', '07113001001000000')))), 'Alex', true);
  x := r->'rows'->0;
  assert x->>'status' = 'update' and (x->'changes'->>'ikpu')::boolean and not (x->'changes'->>'hs_code')::boolean, 'ikpu fills: ' || x::text;
  assert x->'warnings' @> '[{"code":"hs_differs","on_file":"7113190000"}]'::jsonb and x->'warnings' @> '[{"code":"receipt_differs","field":"supplier","on_file":"T4 Supplier SpA"}]'::jsonb, 'warnings: ' || (x->'warnings')::text;
  assert stk_piece_origin(v_a)->>'hs_code' = '7113190000' and stk_piece_origin(v_a)->'receipt'->>'supplier' = 'T4 Supplier SpA' and stk_piece_origin(v_a)->>'ikpu' = '07113001001000000', 'kept';

  -- the waiting row is applied when its piece appears
  insert into ops_pieces(store_id, brand, serial, article, model_id, variant_id, state, state_since)
    select store_id, brand, 'ZY.00.79999', article, model_id, variant_id, 'in_stock', now() from ops_pieces where piece_id = v_a;
  assert stk_apply_pending() = 1, 'pending applied';
  assert (select count(*) from ops_upload_pending) = 0, 'pending list emptied';
  select stk_piece_origin(piece_id) into x from ops_pieces where serial = 'ZY.00.79999';
  assert x->'colibri'->'data'->>'Страна' = 'Италия' and x->'receipt'->>'invoice_no' = 'INV-4', 'pending row landed: ' || x::text;

  -- Codex on #18: a waiting row is not applied to a piece of another reference; it keeps waiting
  perform stk_import(jsonb_build_object('rows', jsonb_build_array(jsonb_build_object('row', 2,
    'colibri', jsonb_build_object('Бренд', 'T4 Jeweller', 'Артикул', 'OTHER-REF', 'Серийный номер', 'ZY.00.78888', 'Страна', 'Франция')))), 'Alex', true);
  insert into ops_pieces(store_id, brand, serial, article, model_id, variant_id, state, state_since)
    select store_id, brand, 'ZY.00.78888', article, model_id, variant_id, 'in_stock', now() from ops_pieces where piece_id = v_a;
  assert stk_apply_pending() = 0, 'a row for another reference is not applied';
  assert (select count(*) from ops_upload_pending where serial_key = 'ZY.00.78888') = 1, 'and it keeps waiting';
  assert not exists (select 1 from ops_piece_colibri c join ops_pieces o using (piece_id) where o.serial = 'ZY.00.78888'), 'the piece was not touched';
  delete from ops_upload_pending where serial_key = 'ZY.00.78888';

  -- Codex on #18: attaching a piece to an arrival document that is already complete is a change, so it can be loaded
  insert into ops_pieces(store_id, brand, serial, article, model_id, variant_id, state, state_since)
    select store_id, brand, 'ZY.00.77777', article, model_id, variant_id, 'in_stock', now() from ops_pieces where piece_id = v_a;
  x := jsonb_build_object('rows', jsonb_build_array(jsonb_build_object('row', 2,
    'colibri', jsonb_build_object('Бренд', 'T4 Jeweller', 'Артикул', 'ZY-ART-A', 'Серийный номер', 'ZY.00.77777'),
    'extra', jsonb_build_object('supplier', 'T4 Supplier SpA', 'invoice_no', 'INV-4'))));
  update ops_piece_colibri set data = data where false;
  insert into ops_piece_colibri(piece_id, data) select piece_id, '{"Бренд":"T4 Jeweller","Артикул":"ZY-ART-A","Серийный номер":"ZY.00.77777"}' from ops_pieces where serial = 'ZY.00.77777';
  r := stk_import(x, 'Alex', false);
  assert r->'rows'->0->>'status' = 'update' and r->'rows'->0->'changes'->>'receipt' = 'link', 'link is a change: ' || (r->'rows'->0)::text;
  perform stk_import(x, 'Alex', true);
  assert (select receipt_id from ops_pieces where serial = 'ZY.00.77777') = (select receipt_id from ops_pieces where piece_id = v_a), 'linked';
  assert stk_import(x, 'Alex', false)->'rows'->0->>'status' = 'same', 'then nothing left to do';

  -- errors: each is named, and a file with any error is not applied at all
  f := jsonb_build_object('rows', jsonb_build_array(
    jsonb_build_object('row', 2, 'colibri', jsonb_build_object('Бренд', 'T4 Jeweller', 'Артикул', 'ZY-ART-A', 'Серийный номер', 'DUP-1')),
    jsonb_build_object('row', 3, 'colibri', jsonb_build_object('Бренд', 't4 jeweller', 'Артикул', 'ZY-ART-A', 'Серийный номер', 'dup-1')),
    jsonb_build_object('row', 4, 'colibri', jsonb_build_object('Бренд', 'T4 Jeweller', 'Артикул', 'OTHER-REF', 'Серийный номер', 'ZY.00.70001')),
    jsonb_build_object('row', 5, 'colibri', jsonb_build_object('Бренд', '', 'Серийный номер', 'TBD')),
    jsonb_build_object('row', 6, 'colibri', jsonb_build_object('Бренд', 'T4 Jeweller', 'Артикул', 'ZY-ART-A', 'Серийный номер', 'OK-1', 'Страна', 'X'),
      'extra', jsonb_build_object('hs_code', '7113', 'ikpu', 'abc', 'invoice_date', '14.10.2026', 'arrival_date', '2026-02-31'))));
  r := stk_import(f, 'Alex', false);
  assert r->'summary' = '{"rows":5,"update":0,"same":0,"pending":0,"error":5}'::jsonb, 'errors summary: ' || (r->'summary')::text;
  assert r->'rows'->0->'errors' = '[{"code":"serial_repeated"}]'::jsonb and r->'rows'->1->'errors' = '[{"code":"serial_repeated"}]'::jsonb, 'repeat';
  assert r->'rows'->2->'errors' = '[{"code":"serial_other_reference","on_file":"ZY-ART-A"}]'::jsonb, 'other reference: ' || (r->'rows'->2)::text;
  assert r->'rows'->3->'errors' = '[{"code":"no_brand"},{"code":"no_serial"},{"code":"no_article"}]'::jsonb, 'missing: ' || (r->'rows'->3)::text;
  assert r->'rows'->4->'errors' = '[{"code":"bad_hs"},{"code":"bad_ikpu"},{"code":"bad_date","field":"invoice_date"},{"code":"bad_date","field":"arrival_date"}]'::jsonb, 'formats: ' || (r->'rows'->4)::text;
  begin perform stk_import(f, 'Alex', true); assert false, 'a file with errors was applied'; exception when raise_exception then null; end;
  assert (select count(*) from ops_upload_pending) = 0, 'nothing loaded from a file with errors';
  begin perform stk_import('{"rows": []}', 'Alex', false); assert false, 'empty accepted'; exception when raise_exception then null; end;

  assert not has_function_privilege('anon', 'public.stk_import(jsonb, text, boolean)', 'execute') and not has_function_privilege('authenticated', 'public.stk_apply_pending()', 'execute')
     and not has_table_privilege('anon', 'public.ops_upload_pending', 'select') and not has_table_privilege('authenticated', 'public.ops_piece_extra', 'select'), 'closed';
  raise notice 'stk_t4 ok';
end $$;
rollback;
