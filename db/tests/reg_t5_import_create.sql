-- One register, step 5: the Stock upload creates a piece whose design we know and sets retail prices,
-- converting Colibri's selling price in dollars at the shelf rate (pos_settings.usd_shelf_rate), as Colibri does.
-- Invented fixtures. Rolled back.
begin;
\ir fixtures/s2_seed.sql
do $$
declare r jsonb; x jsonb; f jsonb; p1 uuid; pn uuid; n0 int;
  rw constant jsonb := '{"Бренд":"Zeta Seed"}'::jsonb;
begin
  if not exists (select 1 from ops_pieces) then perform ops_initial_fill('Alex'); end if;
  perform cat_refresh_stock();
  select piece_id into p1 from ops_pieces where serial = 'ZS-S001';
  assert (select usd_shelf_rate from pos_settings where id = 1) = 12500, 'the shelf rate is the one Colibri uses';
  n0 := (select qty_stock from cat_variants where variant_id = 'ZS-M2-WG');

  f := jsonb_build_object('file_name', 'reg t5.xlsx', 'rows', jsonb_build_array(
    -- 2: a new serial of a design with one colour: created, priced 2 124.5 USD x 12 500
    jsonb_build_object('row', 2, 'colibri', rw || '{"Артикул":"ZS-M2","Серийный номер":"ZR-N001","Размер":"17","Штрих Код":"ZR-BC9","Цена продажи, долл":"2 124,5"}'::jsonb, 'extra', '{}'::jsonb),
    -- 3: a new serial of a design with two colours, colour named by its code
    jsonb_build_object('row', 3, 'colibri', rw || jsonb_build_object('Артикул', 'ZS-M1', 'Серийный номер', 'ZR-N002', 'Код цвета', (select colour_code from cat_variants where variant_id = 'ZS-M1-YG'), 'Цена продажи, долл', 100), 'extra', '{}'::jsonb),
    -- 4: two colours and nothing says which: waits, as before
    jsonb_build_object('row', 4, 'colibri', rw || '{"Артикул":"ZS-M1","Серийный номер":"ZR-N003"}'::jsonb, 'extra', '{}'::jsonb),
    -- 5: a design we do not know: waits for Colibri, as before
    jsonb_build_object('row', 5, 'colibri', rw || '{"Артикул":"ZS-UNKNOWN","Серийный номер":"ZR-N004"}'::jsonb, 'extra', '{}'::jsonb),
    -- 6: a piece we hold, with a new price
    jsonb_build_object('row', 6, 'colibri', rw || '{"Артикул":"ZS-M1","Серийный номер":"ZS-S001","Цена продажи, долл":0.2}'::jsonb, 'extra', '{}'::jsonb),
    -- 7: a piece we hold, no price in the file: its price stays
    jsonb_build_object('row', 7, 'colibri', rw || '{"Артикул":"ZS-M1","Серийный номер":"ZS-S002","Цена продажи, долл":""}'::jsonb, 'extra', '{}'::jsonb)));

  r := stk_import(f, 'Alex', false);
  assert (r->'summary'->>'create')::int = 2 and (r->'summary'->>'pending')::int = 2 and (r->'summary'->>'repriced')::int = 1 and (r->'summary'->>'error')::int = 0,
         format('preview summary: %s', r->'summary');
  x := r->'rows'->0;
  assert x->>'status' = 'create' and x->>'model_id' = 'ZS-M2' and x->>'variant_id' = 'ZS-M2-WG' and (x->>'price_uzs')::bigint = 26556250, format('row 2: %s', x);
  assert r->'rows'->1->>'status' = 'create' and r->'rows'->1->>'variant_id' = 'ZS-M1-YG', format('row 3: %s', r->'rows'->1);
  assert r->'rows'->2->>'status' = 'pending' and r->'rows'->2->>'reason' = 'colour_unclear', format('row 4: %s', r->'rows'->2);
  assert r->'rows'->3->>'status' = 'pending' and r->'rows'->3->>'reason' = 'no_design', format('row 5: %s', r->'rows'->3);
  assert r->'rows'->4->>'status' = 'update' and r->'rows'->4->'price' = '{"old":1000,"new":2500}'::jsonb, format('row 6: %s', r->'rows'->4);
  assert r->'rows'->5->'price' is null, 'no price cell, no price change';
  assert not exists (select 1 from ops_pieces where serial like 'ZR-N%') and (select price_uzs from ops_pieces where piece_id = p1) = 1000, 'a preview changes nothing';

  r := stk_import(f, 'Alex', true);
  assert (r->>'applied')::boolean, 'applied';
  select piece_id into pn from ops_pieces where serial = 'ZR-N001';
  assert (select (state, brand, article, model_id, variant_id, size, barcode, price_uzs) = ('in_stock', 'Zeta Seed', 'ZS-M2', 'ZS-M2', 'ZS-M2-WG', '17', 'ZR-BC9', 26556250)
            from ops_pieces where piece_id = pn), format('created piece: %s', (select to_jsonb(o) from ops_pieces o where piece_id = pn));
  assert (select count(*) from ops_piece_events where piece_id = pn and from_state is null and to_state = 'in_stock' and reason = 'arrived' and ref_kind = 'manual' and actor = 'Alex') = 1, 'its arrival is in its history';
  assert (select count(*) from ops_piece_changes where piece_id = pn and field = 'price' and source = 'upload' and old_value is null and new_value = '26556250' and actor = 'Alex') = 1, 'its first price is recorded';
  assert exists (select 1 from ops_piece_colibri where piece_id = pn), 'the row''s details are on the new piece';
  assert (select qty_stock from cat_variants where variant_id = 'ZS-M2-WG') = n0 + 1, 'the catalogue counts it at once';
  assert (select variant_id from ops_pieces where serial = 'ZR-N002') = 'ZS-M1-YG', 'colour by its code';
  assert not exists (select 1 from ops_pieces where serial in ('ZR-N003', 'ZR-N004')) and (select count(*) from ops_upload_pending where serial_key in ('ZR-N003', 'ZR-N004')) = 2, 'the two unclear rows wait';
  assert (select price_uzs from ops_pieces where piece_id = p1) = 2500
     and (select count(*) from ops_piece_changes where piece_id = p1 and field = 'price' and source = 'upload' and old_value = '1000' and new_value = '2500') = 1, 'a held piece is repriced, with history';
  assert (select price_uzs from ops_pieces where serial = 'ZS-S002') = 1000, 'no price cell: untouched';
  assert (select (price_min_uzs, price_max_uzs) = (1000, 1250000) from cat_models where model_id = 'ZS-M1'), 'the catalogue price range follows';

  -- the same file again: nothing to create, nothing to reprice
  r := stk_import(f, 'Alex', false);
  assert (r->'summary'->>'create')::int = 0 and (r->'summary'->>'repriced')::int = 0, format('second preview: %s', r->'summary');

  -- a price that is not a number stops the file
  r := stk_import(jsonb_build_object('file_name', 'bad.xlsx', 'rows', jsonb_build_array(
         jsonb_build_object('row', 2, 'colibri', rw || '{"Артикул":"ZS-M2","Серийный номер":"ZR-N009","Цена продажи, долл":"abc"}'::jsonb, 'extra', '{}'::jsonb))), 'Alex', false);
  assert r->'rows'->0->>'status' = 'error' and r->'rows'->0->'errors' @> '[{"code":"bad_price"}]'::jsonb, format('bad price: %s', r->'rows'->0);

  -- a piece that was sold is not repriced, and its serial does not create a second piece
  update ops_pieces set state = 'sold' where serial = 'ZS-S004';
  r := stk_import(jsonb_build_object('file_name', 'sold.xlsx', 'rows', jsonb_build_array(
         jsonb_build_object('row', 2, 'colibri', rw || '{"Артикул":"ZS-M2","Серийный номер":"ZS-S004","Цена продажи, долл":9}'::jsonb, 'extra', '{}'::jsonb))), 'Alex', true);
  assert (select count(*) from ops_pieces where serial = 'ZS-S004') = 1 and (select price_uzs from ops_pieces where serial = 'ZS-S004') = 2000
     and (r->'summary'->>'create')::int = 0 and (r->'summary'->>'repriced')::int = 0, format('sold piece: %s', r->'summary');
end $$;
select 'reg_t5 ok' as result;
rollback;
