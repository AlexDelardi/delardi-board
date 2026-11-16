-- POS Task 3: piece search, posting a sale in one step, receipt text. Invented fixtures. Rolled back.
begin;
-- ticket numbers from 1 inside this transaction; ALTER SEQUENCE is transactional, so the rollback
-- leaves both sequences as they were (nextval alone is not rolled back)
alter sequence pos_ticket_no_seq restart;
alter sequence pos_training_no_seq restart;

-- expects pos_post_sale(p) to refuse with a message starting with p_prefix, and to leave no ticket behind
create function pg_temp.t3_refused(p jsonb, p_prefix text) returns void language plpgsql as $$
declare n0 bigint := (select count(*) from ops_tickets); n1 bigint;
begin
  begin
    perform pos_post_sale(p, 'pos t3');
  exception when others then
    n1 := (select count(*) from ops_tickets);
    if sqlerrm not like p_prefix || '%' then
      raise exception 'expected "%", got "%"', p_prefix, sqlerrm;
    end if;
    if n1 <> n0 then raise exception 'refused post left a ticket (% -> %)', n0, n1; end if;
    return;
  end;
  raise exception 'expected "%", but the post went through', p_prefix;
end $$;

do $$
declare
  pl jsonb; r jsonb; res jsonb; p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p9 uuid;
  v_tid uuid; v_line uuid; v_month numeric; v_d bigint; base jsonb; tk ops_tickets%rowtype; v_rt text;
begin
  insert into ops_stores(store_id, code, name)
  select 1, 'POS-STORE', 'POS store' where not exists (select 1 from ops_stores where store_id = 1);
  update pos_settings set shop_address = 'Zz street 1, Tashkent', cash_notice_uzs = 170000000;
  insert into crm_clients(client_id, record_type, name_colibri, name_confirmed)
    values ('DLD-9001', 'client', 'Zztest Clientov', 'Zztest Clientov');
  insert into crm_sales_reps(source_name, label) values ('S3T Source', 'S3T Rep'), ('S3T Source 2', 'S3T Rep 2');

  -- catalogue and pieces through the real stock load
  pl := jsonb_build_object('built', 'pos t3',
    'models', jsonb_build_array(jsonb_build_object('model_id', 'ZZ-M3', 'article', 'ZZ-ART-3', 'brand', 'S3T Brand',
                'brand_raw', jsonb_build_array('S3T Brand'), 'category', 'jewellery', 'retail_category', 'Jewellery',
                'collection', 'Zz Collection', 'model_name', 'Zz Ring', 'in_stock', true, 'qty_stock', 6,
                'arrival_years', '[]'::jsonb, 'variant_count', 1, 'completeness', 0, 'missing_crucial', '[]'::jsonb,
                'has_unconfirmed', false, 'metal_keys', '["gold_white"]'::jsonb, 'stone_keys', '["diamond"]'::jsonb,
                'size_keys', '[]'::jsonb, 'qty_transit', 0)),
    'variants', jsonb_build_array(jsonb_build_object('variant_id', 'ZZ-M3-V1', 'model_id', 'ZZ-M3', 'colour_code', 'WG',
                'in_stock', true, 'qty_stock', 6, 'qty_in', 6, 'qty_sold', 0, 'arrival_years', '[]'::jsonb,
                'found_online', false, 'sources', '[]'::jsonb, 'sort_order', 1, 'qty_transit', 0)),
    'pieces', jsonb_build_array(
      jsonb_build_object('serial', 'ZZ.00.30001', 'variant_id', 'ZZ-M3-V1', 'size', '16', 'price_uzs', 31500000,
                         'barcode', '2000000000024'),
      jsonb_build_object('serial', 'ZZ.00.30002', 'variant_id', 'ZZ-M3-V1', 'size', '17', 'price_uzs', 20000000,
                         'barcode', '2000000000024'),
      jsonb_build_object('serial', 'ZZ.00.30003', 'variant_id', 'ZZ-M3-V1', 'size', '18', 'price_uzs', 9990000,
                         'barcode', '2000000000031'),
      jsonb_build_object('serial', 'ZZ.00.30004', 'variant_id', 'ZZ-M3-V1', 'size', '18', 'price_uzs', 170000001),
      jsonb_build_object('serial', 'ZZ.00.30005', 'variant_id', 'ZZ-M3-V1', 'size', '18', 'price_uzs', 170000000),
      jsonb_build_object('serial', 'ZZ.00.30009', 'variant_id', 'ZZ-M3-V1', 'size', '18', 'price_uzs', 5000000,
                         'barcode', '2000000000024')),
    'attributes', '[]'::jsonb, 'links', '[]'::jsonb, 'expected', '[]'::jsonb);
  r := cat_load(pl, 'pos t3 a');
  select piece_id into p1 from ops_pieces where serial = 'ZZ.00.30001';
  select piece_id into p2 from ops_pieces where serial = 'ZZ.00.30002';
  select piece_id into p3 from ops_pieces where serial = 'ZZ.00.30003';
  select piece_id into p4 from ops_pieces where serial = 'ZZ.00.30004';
  select piece_id into p5 from ops_pieces where serial = 'ZZ.00.30005';
  select piece_id into p9 from ops_pieces where serial = 'ZZ.00.30009';
  assert p1 is not null and p9 is not null, 'fixture pieces loaded';
  update ops_pieces set state = 'sold', state_since = now() where piece_id = p9;

  -- search by barcode: three pieces, the sold one not sellable
  res := pos_search_pieces('2000000000024', 'training');
  assert jsonb_array_length(res) = 3, 'barcode: 3 results ' || res::text;
  assert (select count(*) from jsonb_array_elements(res) e where (e->>'sellable')::boolean) = 2, 'two sellable';
  assert (select (e->>'sellable')::boolean from jsonb_array_elements(res) e where e->>'serial' = 'ZZ.00.30009') = false,
         'sold piece not sellable';
  assert res->2->>'serial' = 'ZZ.00.30009', 'sellable first ' || res::text;
  assert res->0->>'brand' = 'S3T Brand' and res->0->>'article' = 'ZZ-ART-3' and res->0->>'collection' = 'Zz Collection'
         and res->0->>'model_name' = 'Zz Ring' and res->0->>'colour' = 'WG' and res->0->>'size' = '16'
         and res->0->>'barcode' = '2000000000024' and (res->0->>'price_uzs')::bigint = 31500000
         and res->0->'metal_keys' = (select to_jsonb(metal_keys) from cat_models where model_id = 'ZZ-M3')
         and res->0->'stone_keys' = (select to_jsonb(stone_keys) from cat_models where model_id = 'ZZ-M3')
         and jsonb_typeof(res->0->'metal_keys') = 'array'
         and res->0->>'state' = 'in_stock' and res->0->'held' = 'null'::jsonb
         and res->0->>'piece_id' = p1::text, 'result fields ' || (res->0)::text;

  -- search by exact serial, case and space insensitive
  res := pos_search_pieces(' zz.00. 30003 ', 'training');
  assert jsonb_array_length(res) = 1 and res->0->>'serial' = 'ZZ.00.30003', 'exact serial ' || res::text;

  -- search escapes: literal %, _, quote, Cyrillic, backslash never error
  assert pos_search_pieces('%', 'training') = '[]'::jsonb, '% is literal';
  assert pos_search_pieces('_', 'training') = '[]'::jsonb, '_ is literal';
  assert pos_search_pieces('''', 'training') = '[]'::jsonb, 'quote';
  assert pos_search_pieces('ЗЗ', 'training') = '[]'::jsonb, 'cyrillic';
  assert pos_search_pieces('\', 'training') = '[]'::jsonb, 'backslash';
  assert pos_search_pieces('', 'training') = '[]'::jsonb, 'empty';
  assert pos_search_pieces('   ', 'training') = '[]'::jsonb, 'blank';
  assert pos_search_pieces(null, 'training') = '[]'::jsonb, 'null';

  -- search words: serial prefix and a brand word
  res := pos_search_pieces('zz.00.3000 S3T', 'training');
  assert jsonb_array_length(res) = 6, 'words: all six ' || res::text;
  assert jsonb_array_length(pos_search_pieces('zz.00.3000 nosuchbrand', 'training')) = 0, 'every word must match';
  assert jsonb_array_length(pos_search_pieces('collection ring', 'training')) = 6, 'collection and model name words';

  base := jsonb_build_object('walk_in', true, 'seller', 'S3T Rep');

  -- training post
  assert (select mode from pos_settings) = 'training', 'starts in training';
  v_month := (select coalesce(sum(net), 0) from ops_ticket_monthly);
  res := pos_post_sale(jsonb_build_object('client_id', 'DLD-9001', 'walk_in', false, 'seller', 'S3T Rep',
           'mode', 'live',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p1, 'price_uzs', 31500000, 'discount_pct', 5)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'card', 'card_type', 'uzcard', 'amount', 29925000))),
         'pos t3');
  assert res->>'ticket_no' = 'T-000001' and res->>'mode' = 'training' and (res->>'total')::numeric = 29925000
         and (res->>'cash_notice')::boolean = false, 'training result ' || res::text;
  select * into tk from ops_tickets where ticket_id = (res->>'ticket_id')::uuid;
  assert tk.source = 'training' and tk.store_id = 1 and tk.seller = 'S3T Source' and tk.client_id = 'DLD-9001'
         and tk.walk_in = false and tk.entered_by = 'pos t3' and tk.status = 'posted'
         and tk.sold_at = (now() at time zone 'Asia/Tashkent')::date, 'training ticket row';
  select line_id into v_line from ops_ticket_lines where ticket_id = tk.ticket_id;
  assert (select net = 29925000 and piece_id is null and kind = 'sale' and qty = 1 and line_no = 1
                 and price_list = 31500000 and price_current = 31500000 and discount_pct = 5 and discount_amt = 1575000
                 and article = 'ZZ-ART-3' and colour = 'WG' and item_name = 'Zz Ring' and size = '16'
                 and model_id = 'ZZ-M3' and variant_id = 'ZZ-M3-V1' and serial_raw = 'ZZ.00.30001'
                 and brand_raw = 'S3T Brand' and extra is null
            from ops_ticket_lines where line_id = v_line), 'training line';
  assert (select method = 'card' and card_type = 'uzcard' and amount = 29925000 and raw = 'card'
            from ops_ticket_payments where ticket_id = tk.ticket_id), 'training payment';
  assert (select state from ops_pieces where piece_id = p1) = 'in_stock', 'training leaves the piece in stock';
  assert not exists (select 1 from ops_piece_events where piece_id = p1 and reason = 'sold'), 'no sold event';
  assert not exists (select 1 from crm_transactions where ticket_line_id = v_line), 'training: no crm row';
  assert not exists (select 1 from crm_transactions where client_id = 'DLD-9001'), 'training: no crm row at all';
  assert (select coalesce(sum(net), 0) from ops_ticket_monthly) = v_month, 'training not in monthly';
  v_rt := tk.receipt_text;
  assert split_part(v_rt, E'\n', 1) = 'TRAINING — NOT A SALE' and split_part(v_rt, E'\n', 2) = 'DELARDI'
         and split_part(v_rt, E'\n', 3) = 'Zz street 1, Tashkent', 'training receipt head ' || v_rt;
  assert v_rt like '%T-000001%' and v_rt like '%29 925 000%' and v_rt like '%Seller: S3T Rep%'
         and v_rt like '%Client: Zztest Clientov%' and v_rt like '%S3T Brand Zz Ring · ZZ.00.30001%'
         and v_rt like '%31 500 000 −5% = 29 925 000%' and v_rt like '%Total 29 925 000%'
         and v_rt like '%Uzcard 29 925 000%' and v_rt not like '%S3T Source%', 'training receipt body ' || v_rt;

  -- rounding (training: the piece is not used up)
  res := pos_post_sale(base || jsonb_build_object(
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p3, 'price_uzs', 9990000, 'discount_pct', 7.5)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 9240750))), 'pos t3');
  assert (select net from ops_ticket_lines where ticket_id = (res->>'ticket_id')::uuid) = 9240750, 'net 9240750';
  assert res->>'ticket_no' = 'T-000002', 'training numbers run on';
  res := pos_post_sale(base || jsonb_build_object(
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p3, 'price_uzs', 1000001, 'discount_pct', 50)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 500001))), 'pos t3');
  assert (select net = 500001 and discount_amt = 500000 from ops_ticket_lines where ticket_id = (res->>'ticket_id')::uuid),
         '.5 rounds away from zero';

  -- live post
  perform pos_set_mode('live', 'pos t3');
  res := pos_post_sale(base || jsonb_build_object(
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p1, 'price_uzs', 31500000, 'discount_pct', 5)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 20000000),
                                         jsonb_build_object('method', 'card', 'card_type', 'visa', 'amount', 9925000))),
         'pos t3');
  assert res->>'ticket_no' = 'D-000001' and res->>'mode' = 'live', 'live result ' || res::text;
  select * into tk from ops_tickets where ticket_id = (res->>'ticket_id')::uuid;
  assert tk.source = 'delardi' and tk.walk_in and tk.client_id is null, 'live ticket';
  select line_id into v_line from ops_ticket_lines where ticket_id = tk.ticket_id;
  assert (select piece_id from ops_ticket_lines where line_id = v_line) = p1, 'live line holds the piece';
  assert (select state = 'sold' and sold_line_id = v_line from ops_pieces where piece_id = p1), 'piece sold';
  assert (select count(*) from ops_piece_events where piece_id = p1 and reason = 'sold') = 1, 'one sold event';
  assert (select array_agg(method || '/' || coalesce(card_type, '-') order by payment_id) from ops_ticket_payments
           where ticket_id = tk.ticket_id) = array['cash/-', 'visa/visa'], 'payments cash and visa';
  assert (select raw from ops_ticket_payments where ticket_id = tk.ticket_id and method = 'visa') = 'visa', 'raw label';
  assert not exists (select 1 from crm_transactions where ticket_line_id = v_line), 'walk-in: no crm row';
  assert (select coalesce(sum(net), 0) from ops_ticket_monthly) = v_month + 29925000, 'live in monthly';
  v_rt := tk.receipt_text;
  assert split_part(v_rt, E'\n', 1) = 'DELARDI' and v_rt like '%D-000001%' and v_rt like '%Client: Walk-in%'
         and v_rt like '%Cash 20 000 000%' and v_rt like '%Visa 9 925 000%' and v_rt not like '%TRAINING%',
         'live receipt ' || v_rt;
  assert v_rt ~ ('Ticket D-000001 · \d\d\.\d\d\.\d{4} \d\d:\d\d'), 'ticket line with date ' || v_rt;

  -- live client post, with a line seller who differs
  res := pos_post_sale(jsonb_build_object('client_id', 'DLD-9001', 'walk_in', false, 'seller', 'S3T Rep',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p2, 'price_uzs', 20000000, 'discount_pct', 0,
                                                         'seller', 'S3T Rep 2')),
           'payments', jsonb_build_array(jsonb_build_object('method', 'transfer', 'amount', 20000000))), 'pos t3');
  assert res->>'ticket_no' = 'D-000002', 'client post ' || res::text;
  select line_id into v_line from ops_ticket_lines where ticket_id = (res->>'ticket_id')::uuid;
  assert (select extra from ops_ticket_lines where line_id = v_line) = '{"seller": "S3T Source 2"}'::jsonb, 'line seller';
  assert (select count(*) from crm_transactions where ticket_line_id = v_line) = 1, 'one crm row';
  assert (select client_id = 'DLD-9001' and brand = 'S3T Brand' and category = 'jewellery' and item = 'Zz Ring'
                 and qty = 1 and gross_uzs = 20000000 and discount_pct = 0 and net_uzs = 20000000
                 and advisor = 'S3T Source 2' and article = 'ZZ-ART-3' and cat_model_id = 'ZZ-M3'
                 and cat_variant_id = 'ZZ-M3-V1' and sold_at = (now() at time zone 'Asia/Tashkent')::date
            from crm_transactions where ticket_line_id = v_line), 'crm row fields';
  assert (select lifetime_spend_uzs = 20000000 and purchase_occasions = 1 and items_bought = 1
            from crm_clients where client_id = 'DLD-9001'), 'lifetime spend includes it';
  assert (select payment_ok from (select method = 'transfer' and raw = 'transfer' payment_ok
            from ops_ticket_payments where ticket_id = (res->>'ticket_id')::uuid) x), 'transfer';
  assert (select receipt_text like '%Client: Zztest Clientov%' and receipt_text like '%Transfer 20 000 000%'
            from ops_tickets where ticket_id = (res->>'ticket_id')::uuid), 'client receipt';

  -- second sale of a sold piece
  perform pg_temp.t3_refused(base || jsonb_build_object(
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p1, 'price_uzs', 31500000, 'discount_pct', 0)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 31500000))),
         'piece ZZ.00.30001 is not in stock');
  assert (select count(*) from ops_ticket_lines where piece_id = p1) = 1, 'no second line for the piece';

  -- payments mismatch: short, over, empty
  base := base || jsonb_build_object('lines',
            jsonb_build_array(jsonb_build_object('piece_id', p3, 'price_uzs', 9990000, 'discount_pct', 0)));
  perform pg_temp.t3_refused(base || jsonb_build_object('payments',
            jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 9989999))), 'payments 9989999 do not match total 9990000');
  perform pg_temp.t3_refused(base || jsonb_build_object('payments',
            jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 9990001))), 'payments 9990001 do not match total 9990000');
  perform pg_temp.t3_refused(base || jsonb_build_object('payments', '[]'::jsonb), 'payments 0 do not match total');
  perform pg_temp.t3_refused(base - 'payments', 'payments 0 do not match total');
  base := base || jsonb_build_object('payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 9990000)));

  -- other refusals
  perform pg_temp.t3_refused(base - 'walk_in', 'choose a client or walk-in');
  perform pg_temp.t3_refused(base || '{"walk_in": false}', 'choose a client or walk-in');
  perform pg_temp.t3_refused(base || '{"client_id": "DLD-9001"}', 'choose a client or walk-in');
  perform pg_temp.t3_refused(base - 'seller', 'choose a seller');
  perform pg_temp.t3_refused(base || '{"seller": " "}', 'choose a seller');
  perform pg_temp.t3_refused(base || '{"seller": "S3T Source"}', 'choose a seller');
  perform pg_temp.t3_refused(base || '{"seller": "Nobody"}', 'choose a seller');
  perform pg_temp.t3_refused(base || jsonb_build_object('lines', jsonb_build_array(jsonb_build_object(
            'piece_id', p3, 'price_uzs', 9990000, 'discount_pct', 0, 'seller', 'Nobody'))), 'choose a seller');
  perform pg_temp.t3_refused(base || '{"lines": []}', 'no lines');
  perform pg_temp.t3_refused(base - 'lines', 'no lines');
  perform pg_temp.t3_refused(base || jsonb_build_object('lines', jsonb_build_array(
            jsonb_build_object('piece_id', p3, 'price_uzs', 4995000, 'discount_pct', 0),
            jsonb_build_object('piece_id', p3, 'price_uzs', 4995000, 'discount_pct', 0))), 'piece listed twice');
  perform pg_temp.t3_refused(base || jsonb_build_object('lines', jsonb_build_array(jsonb_build_object(
            'piece_id', p3, 'price_uzs', 9990000, 'discount_pct', 101))), 'discount must be 0 to 100');
  perform pg_temp.t3_refused(base || jsonb_build_object('lines', jsonb_build_array(jsonb_build_object(
            'piece_id', p3, 'price_uzs', 9990000, 'discount_pct', -1))), 'discount must be 0 to 100');
  perform pg_temp.t3_refused(base || jsonb_build_object('lines', jsonb_build_array(jsonb_build_object(
            'piece_id', p3, 'price_uzs', 0, 'discount_pct', 0))), 'price must be positive');
  perform pg_temp.t3_refused(base || jsonb_build_object('lines', jsonb_build_array(jsonb_build_object(
            'piece_id', p3, 'price_uzs', 9990000, 'discount_pct', 100))), 'discount must be 0 to 100');
  perform pg_temp.t3_refused(base || jsonb_build_object('lines', jsonb_build_array(jsonb_build_object(
            'piece_id', p3, 'price_uzs', 9990000, 'discount_pct', 5.00001))), 'discount must be 0 to 100');
  perform pg_temp.t3_refused(base || jsonb_build_object('lines', jsonb_build_array(jsonb_build_object(
            'piece_id', p3, 'price_uzs', 9990000.5, 'discount_pct', 0))), 'price must be positive');
  perform pg_temp.t3_refused(base || jsonb_build_object('payments', jsonb_build_array(
            jsonb_build_object('method', 'qr', 'amount', 9990000))), 'payment method must be');
  perform pg_temp.t3_refused(base || jsonb_build_object('payments', jsonb_build_array(
            jsonb_build_object('method', 'card', 'amount', 9990000))), 'card payment needs a card type');
  perform pg_temp.t3_refused(base || jsonb_build_object('payments', jsonb_build_array(
            jsonb_build_object('method', 'card', 'card_type', 'amex', 'amount', 9990000))), 'card payment needs a card type');
  perform pg_temp.t3_refused(base || jsonb_build_object('lines', jsonb_build_array(jsonb_build_object(
            'piece_id', p9, 'price_uzs', 9990000, 'discount_pct', 0))), 'piece ZZ.00.30009 is not in stock');

  -- cash notice; a training suspended sale holding the piece does not block a live post
  insert into pos_drafts(mode, walk_in, created_by) values ('training', true, 'pos t3') returning draft_id into v_d;
  insert into pos_draft_lines(draft_id, line_no, piece_id, price_uzs, mode) values (v_d, 1, p4, 170000001, 'training');
  res := pos_post_sale(jsonb_build_object('walk_in', true, 'seller', 'S3T Rep',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p4, 'price_uzs', 170000001, 'discount_pct', 0)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 170000001))), 'pos t3');
  assert res->>'ticket_no' = 'D-000003', 'refusals burnt no ticket number ' || res::text;
  assert (res->>'cash_notice')::boolean = true, 'cash over the threshold';
  assert exists (select 1 from pos_drafts where draft_id = v_d), 'training draft untouched';
  delete from pos_drafts where draft_id = v_d;
  res := pos_post_sale(jsonb_build_object('walk_in', true, 'seller', 'S3T Rep',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p5, 'price_uzs', 170000000, 'discount_pct', 0)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 170000000))), 'pos t3');
  assert (res->>'cash_notice')::boolean = false, 'cash at the threshold';

  -- hold: a live suspended sale holds ZZ.00.30003
  insert into pos_drafts(mode, walk_in, created_by) values ('live', true, 'pos t3') returning draft_id into v_d;
  insert into pos_draft_lines(draft_id, line_no, piece_id, price_uzs, mode) values (v_d, 1, p3, 9990000, 'live');
  perform pg_temp.t3_refused(base, 'piece ZZ.00.30003 is in suspended sale ' || v_d);
  res := pos_search_pieces('ZZ.00.30003', 'live');
  assert res->0->'held' = jsonb_build_object('draft_id', v_d) and (res->0->>'sellable')::boolean = false, 'held in search';
  assert pos_search_pieces('ZZ.00.30003', 'training')->0->'held' = 'null'::jsonb, 'not held in training';
  -- posting the suspended sale itself goes through and removes the draft
  res := pos_post_sale(base || jsonb_build_object('draft_id', v_d), 'pos t3');
  assert not exists (select 1 from pos_drafts where draft_id = v_d), 'draft removed';
  assert (select state from ops_pieces where piece_id = p3) = 'sold', 'held piece sold through its own draft';

  -- R4: after a live post, the stock load still listing the serial leaves it sold and raises a ticket_conflict
  drop table if exists _ov_new, _cat_facet_stage_v2;
  pl := jsonb_set(pl, '{pieces}', (select jsonb_agg(e) from jsonb_array_elements(pl->'pieces') e
                                    where e->>'serial' <> 'ZZ.00.30009'));
  r := cat_load(pl, 'pos t3 b');
  assert (select state from ops_pieces where piece_id = p1) = 'sold', 'R4: piece stays sold';
  assert (select count(*) from ops_pieces where upper(btrim(serial)) = 'ZZ.00.30001') = 1, 'R4: no new piece';
  assert exists (select 1 from ops_review where piece_id = p1 and kind = 'ticket_conflict' and status = 'open'
                  and note like '%D-000001%'), 'R4: ticket_conflict names D-000001';
end $$;

-- "another sale is suspended": a live draft on another piece blocks a post that is not that draft
do $$
declare p uuid; v_d bigint;
begin
  insert into ops_pieces(store_id, brand, serial, state) values (1, 'S3T Brand', 'ZZ.00.30010', 'in_stock') returning piece_id into p;
  insert into ops_pieces(store_id, brand, serial, state) values (1, 'S3T Brand', 'ZZ.00.30011', 'in_stock');
  insert into pos_drafts(mode, walk_in, created_by) values ('live', true, 'pos t3') returning draft_id into v_d;
  insert into pos_draft_lines(draft_id, line_no, piece_id, price_uzs, mode) values (v_d, 1, p, 1000, 'live');
  perform pg_temp.t3_refused(jsonb_build_object('walk_in', true, 'seller', 'S3T Rep',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', (select piece_id from ops_pieces where serial = 'ZZ.00.30011'),
                                                         'price_uzs', 1000, 'discount_pct', 0)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 1000))), 'another sale is suspended');
end $$;

select 'pos_t3 ok' as result;
rollback;
