-- Receipt language (16 Nov): pos_receipt_text(ticket, lang) prints the receipt in English or Russian,
-- with the Russian shop address. Invented fixtures. Rolled back.
begin;
alter sequence pos_ticket_no_seq restart;
alter sequence pos_training_no_seq restart;

do $$
declare pl jsonb; r jsonb; res jsonb; pa uuid; v_rt text; v_en text; v_ru text; v_tid uuid;
begin
  insert into ops_stores(store_id, code, name)
  select 1, 'POS-STORE', 'POS store' where not exists (select 1 from ops_stores where store_id = 1);
  update pos_settings set mode = 'training', shop_address = 'Zz street 1, Tashkent', shop_address_ru = 'Зз улица 1, Ташкент';
  insert into crm_sales_reps(source_name, label) values ('T8 Source', 'T8 Rep');

  pl := jsonb_build_object('built', 'pos t8',
    'models', jsonb_build_array(
      -- model A: every field filled
      jsonb_build_object('model_id', 'ZZ8-MA', 'article', 'ZZ8-ART-A', 'brand', 'T8 Watchmaker',
        'brand_raw', jsonb_build_array('T8 Watchmaker'), 'category', 'watch', 'retail_category', 'watch',
        'collection', 'Zz Vintage', 'model_name', 'Zz Infinity Edition', 'in_stock', true, 'qty_stock', 1,
        'arrival_years', '[]'::jsonb, 'variant_count', 1, 'completeness', 0, 'missing_crucial', '[]'::jsonb,
        'has_unconfirmed', false, 'metal_keys', '["white_gold"]'::jsonb, 'stone_keys', '[]'::jsonb,
        'size_keys', '[]'::jsonb, 'qty_transit', 0),
      -- model B: no collection (null) — must never match a search for model A
      jsonb_build_object('model_id', 'ZZ8-MB', 'article', 'ZZ8-ART-B', 'brand', 'T8 Jeweller',
        'brand_raw', jsonb_build_array('T8 Jeweller'), 'category', 'jewellery', 'retail_category', 'bracelet_element',
        'model_name', 'Zz Hoops', 'in_stock', true, 'qty_stock', 1,
        'arrival_years', '[]'::jsonb, 'variant_count', 1, 'completeness', 0, 'missing_crucial', '[]'::jsonb,
        'has_unconfirmed', false, 'metal_keys', '[]'::jsonb, 'stone_keys', '[]'::jsonb,
        'size_keys', '[]'::jsonb, 'qty_transit', 0)),
    'variants', jsonb_build_array(
      jsonb_build_object('variant_id', 'ZZ8-MA-V1', 'model_id', 'ZZ8-MA', 'in_stock', true, 'qty_stock', 1, 'qty_in', 1,
        'qty_sold', 0, 'arrival_years', '[]'::jsonb, 'found_online', false, 'sources', '[]'::jsonb, 'sort_order', 1,
        'qty_transit', 0),
      jsonb_build_object('variant_id', 'ZZ8-MB-V1', 'model_id', 'ZZ8-MB', 'in_stock', true, 'qty_stock', 1, 'qty_in', 1,
        'qty_sold', 0, 'arrival_years', '[]'::jsonb, 'found_online', false, 'sources', '[]'::jsonb, 'sort_order', 1,
        'qty_transit', 0)),
    'pieces', jsonb_build_array(
      jsonb_build_object('serial', 'ZZ.00.80001', 'variant_id', 'ZZ8-MA-V1', 'size', '40', 'price_uzs', 50000000),
      jsonb_build_object('serial', 'ZZ.00.80002', 'variant_id', 'ZZ8-MB-V1', 'price_uzs', 20000000)),
    'attributes', '[]'::jsonb, 'links', '[]'::jsonb, 'expected', '[]'::jsonb);
  r := cat_load(pl, 'pos t8');
  update cat_models set metal_keys = '{white_gold}' where model_id = 'ZZ8-MA';  -- the load derives keys from attributes
  select piece_id into pa from ops_pieces where serial = 'ZZ.00.80001';
  assert pa is not null, 'fixture loaded';

  r := pos_post_sale(jsonb_build_object('walk_in', true, 'seller', 'T8 Rep', 'expect_mode', 'training',
         'lines', jsonb_build_array(jsonb_build_object('piece_id', pa, 'price_uzs', 50000000))
                  || jsonb_build_array(jsonb_build_object('piece_id',
                       (select piece_id from ops_pieces where serial = 'ZZ.00.80002'), 'price_uzs', 20000000)),
         'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 30000000),
                                       jsonb_build_object('method', 'card', 'card_type', 'humo', 'amount', 40000000))), 'pos t8');
  v_tid := (r->>'ticket_id')::uuid;
  select receipt_text into v_rt from ops_tickets where ticket_id = v_tid;
  v_en := pos_receipt_text(v_tid, 'en');
  v_ru := pos_receipt_text(v_tid, 'ru');
  -- the stored copy is unchanged: English, as posted; the one-argument call still means English
  assert v_rt = v_en and pos_receipt_text(v_tid) = v_en, 'stored copy and default are English: ' || v_rt;
  assert v_en like E'TRAINING — NOT A SALE\nDELARDI\nZz street 1, Tashkent\nTicket T-%', 'english head: ' || v_en;
  -- Russian: every fixed word, the Russian address, category and metal in Russian; names and amounts as they are
  assert v_ru like E'УЧЕБНЫЙ ЧЕК — НЕ ПРОДАЖА\nDELARDI\nЗз улица 1, Ташкент\nЧек T-% · __.__.____ __:__\nПродавец: T8 Rep\nКлиент: Без карты клиента\n%',
         'russian head: ' || v_ru;
  assert v_ru like E'%T8 Watchmaker · Zz Infinity Edition\nАрт. ZZ8-ART-A · Часы · Белое золото · Размер 40\nС/Н ZZ.00.80001\n50 000 000 −0% = 50 000 000%',
         'russian item A: ' || v_ru;
  assert v_ru like E'%T8 Jeweller · Zz Hoops\nАрт. ZZ8-ART-B · Элемент браслета\nС/Н ZZ.00.80002\n%', 'russian item B: ' || v_ru;
  assert v_ru like E'%\nИтого 70 000 000\nНаличные 30 000 000\nHumo 40 000 000', 'russian total and payments: ' || v_ru;
  -- an unknown language falls back to English; a missing Russian address falls back to the English one
  assert pos_receipt_text(v_tid, 'de') = v_en, 'unknown language is English';
  update pos_settings set shop_address_ru = null;
  assert pos_receipt_text(v_tid, 'ru') like E'%\nZz street 1, Tashkent\n%', 'no Russian address: English address';
  -- every category and metal the catalogue uses has a Russian word
  assert not exists (select 1 from (select retail_category k from cat_models union select unnest(metal_keys) from cat_models) x
                      where k is not null and pos_key_label_ru(k) = pos_key_label(k)), 'all keys translated';
end $$;

select 'pos_t8 ok' as result;
rollback;
