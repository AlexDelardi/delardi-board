-- POS fix 1 (16 Nov): search must not match pieces whose catalogue fields are empty; the receipt carries
-- each item's reference, category, metal and size. Invented fixtures. Rolled back.
begin;
alter sequence pos_ticket_no_seq restart;
alter sequence pos_training_no_seq restart;

do $$
declare pl jsonb; r jsonb; res jsonb; pa uuid; v_rt text; v_tid uuid;
begin
  insert into ops_stores(store_id, code, name)
  select 1, 'POS-STORE', 'POS store' where not exists (select 1 from ops_stores where store_id = 1);
  update pos_settings set mode = 'training', shop_address = 'Zz street 1, Tashkent';
  insert into crm_sales_reps(source_name, label) values ('T7 Source', 'T7 Rep');

  pl := jsonb_build_object('built', 'pos t7',
    'models', jsonb_build_array(
      -- model A: every field filled
      jsonb_build_object('model_id', 'ZZ-MA', 'article', 'ZZ-ART-A', 'brand', 'T7 Watchmaker',
        'brand_raw', jsonb_build_array('T7 Watchmaker'), 'category', 'watch', 'retail_category', 'watch',
        'collection', 'Zz Vintage', 'model_name', 'Zz Infinity Edition', 'in_stock', true, 'qty_stock', 1,
        'arrival_years', '[]'::jsonb, 'variant_count', 1, 'completeness', 0, 'missing_crucial', '[]'::jsonb,
        'has_unconfirmed', false, 'metal_keys', '["white_gold"]'::jsonb, 'stone_keys', '[]'::jsonb,
        'size_keys', '[]'::jsonb, 'qty_transit', 0),
      -- model B: no collection (null) — must never match a search for model A
      jsonb_build_object('model_id', 'ZZ-MB', 'article', 'ZZ-ART-B', 'brand', 'T7 Jeweller',
        'brand_raw', jsonb_build_array('T7 Jeweller'), 'category', 'jewellery', 'retail_category', 'bracelet_element',
        'model_name', 'Zz Hoops', 'in_stock', true, 'qty_stock', 1,
        'arrival_years', '[]'::jsonb, 'variant_count', 1, 'completeness', 0, 'missing_crucial', '[]'::jsonb,
        'has_unconfirmed', false, 'metal_keys', '[]'::jsonb, 'stone_keys', '[]'::jsonb,
        'size_keys', '[]'::jsonb, 'qty_transit', 0)),
    'variants', jsonb_build_array(
      jsonb_build_object('variant_id', 'ZZ-MA-V1', 'model_id', 'ZZ-MA', 'in_stock', true, 'qty_stock', 1, 'qty_in', 1,
        'qty_sold', 0, 'arrival_years', '[]'::jsonb, 'found_online', false, 'sources', '[]'::jsonb, 'sort_order', 1,
        'qty_transit', 0),
      jsonb_build_object('variant_id', 'ZZ-MB-V1', 'model_id', 'ZZ-MB', 'in_stock', true, 'qty_stock', 1, 'qty_in', 1,
        'qty_sold', 0, 'arrival_years', '[]'::jsonb, 'found_online', false, 'sources', '[]'::jsonb, 'sort_order', 1,
        'qty_transit', 0)),
    'pieces', jsonb_build_array(
      jsonb_build_object('serial', 'ZZ.00.70001', 'variant_id', 'ZZ-MA-V1', 'size', '40', 'price_uzs', 50000000),
      jsonb_build_object('serial', 'ZZ.00.70002', 'variant_id', 'ZZ-MB-V1', 'price_uzs', 20000000)),
    'attributes', '[]'::jsonb, 'links', '[]'::jsonb, 'expected', '[]'::jsonb);
  r := cat_load(pl, 'pos t7');
  update cat_models set metal_keys = '{white_gold}' where model_id = 'ZZ-MA';  -- the load derives keys from attributes
  select piece_id into pa from ops_pieces where serial = 'ZZ.00.70001';
  assert pa is not null, 'fixture loaded';

  -- search by reference: only model A (model B's empty collection must not make it match)
  res := pos_search_pieces('ZZ-ART-A', 'training');
  assert jsonb_array_length(res) = 1 and res->0->>'serial' = 'ZZ.00.70001', 'reference finds only A: ' || res::text;
  -- search by model name words
  res := pos_search_pieces('Zz Infinity Edition', 'training');
  assert jsonb_array_length(res) = 1 and res->0->>'serial' = 'ZZ.00.70001', 'name finds only A: ' || res::text;
  -- a word nothing has
  res := pos_search_pieces('Qqqqnothing', 'training');
  assert jsonb_array_length(res) = 0, 'no match is empty: ' || res::text;
  -- model B still found by its own words
  res := pos_search_pieces('Zz Hoops', 'training');
  assert jsonb_array_length(res) = 1 and res->0->>'serial' = 'ZZ.00.70002', 'B by its name: ' || res::text;

  -- receipt: reference, category, metal, size, serial
  r := pos_post_sale(jsonb_build_object('walk_in', true, 'seller', 'T7 Rep', 'expect_mode', 'training',
         'lines', jsonb_build_array(jsonb_build_object('piece_id', pa, 'price_uzs', 50000000))
                  || jsonb_build_array(jsonb_build_object('piece_id',
                       (select piece_id from ops_pieces where serial = 'ZZ.00.70002'), 'price_uzs', 20000000)),
         'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 70000000))), 'pos t7');
  v_tid := (r->>'ticket_id')::uuid;
  select receipt_text into v_rt from ops_tickets where ticket_id = v_tid;
  assert v_rt like E'%T7 Watchmaker · Zz Infinity Edition\nRef. ZZ-ART-A · Watch · White gold · Size 40\nS/N ZZ.00.70001\n50 000 000 −0% = 50 000 000%',
         'receipt item A: ' || v_rt;
  -- empty parts are left out, underscores become spaces
  assert v_rt like E'%T7 Jeweller · Zz Hoops\nRef. ZZ-ART-B · Bracelet element\nS/N ZZ.00.70002\n%', 'receipt item B: ' || v_rt;
end $$;

-- Codex (PR #5): a prospect added at the till becomes a client with its first live purchase
do $$
declare pa uuid; r jsonb;
begin
  insert into crm_clients(client_id, record_type, name_confirmed) values ('PRS-9701', 'prospect', 'Zz Prospectova');
  update pos_settings set mode = 'live';
  select piece_id into pa from ops_pieces where serial = 'ZZ.00.70001';
  r := pos_post_sale(jsonb_build_object('client_id', 'PRS-9701', 'seller', 'T7 Rep', 'expect_mode', 'live',
         'lines', jsonb_build_array(jsonb_build_object('piece_id', pa, 'price_uzs', 50000000)),
         'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 50000000))), 'pos t7');
  assert (select record_type from crm_clients where client_id = 'PRS-9701') = 'client', 'prospect promoted';
  assert exists (select 1 from crm_events where client_id = 'PRS-9701' and action = 'became_client'
                  and note like '%' || (r->>'ticket_no') || '%'), 'became_client event names the ticket';
end $$;

-- Codex (PR #5): one suspended sale per mode, enforced by the database (not only by a check two devices can both pass)
do $$
begin
  insert into pos_drafts(mode, walk_in, created_by) values ('training', true, 'pos t7');
  begin
    insert into pos_drafts(mode, walk_in, created_by) values ('training', true, 'pos t7');
    raise exception 'a second training draft was accepted';
  exception when unique_violation then null;
  end;
  insert into pos_drafts(mode, walk_in, created_by) values ('live', true, 'pos t7');  -- the other mode is separate
end $$;

select 'pos_t7 ok' as result;
rollback;
