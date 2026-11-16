-- POS Task 2: barcode through the stock load; feeds refuse what the sales tool owns after go-live. Invented fixtures. Rolled back.
begin;
do $$
declare
  pl jsonb; r jsonb; p_sold uuid; v_tid uuid; v_line uuid; v_bc text; b bigint; res jsonb; run bigint;
  l jsonb; t jsonb;
begin
  insert into ops_stores(store_id, code, name)
  select 1, 'POS-STORE', 'POS store' where not exists (select 1 from ops_stores where store_id = 1);

  -- a tiny catalogue: one model, one variant, three pieces
  pl := jsonb_build_object('built', 'pos t2',
    'models', jsonb_build_array(jsonb_build_object('model_id', 'ZZ-M1', 'article', 'ZZ-ART-1', 'brand', 'ZZ Brand', 'brand_raw', jsonb_build_array('ZZ Brand'),
                'category', 'jewellery', 'retail_category', 'Jewellery', 'in_stock', true, 'qty_stock', 1,
                'arrival_years', '[]'::jsonb, 'variant_count', 1, 'completeness', 0, 'missing_crucial', '[]'::jsonb,
                'has_unconfirmed', false, 'metal_keys', '[]'::jsonb, 'stone_keys', '[]'::jsonb, 'size_keys', '[]'::jsonb,
                'qty_transit', 0)),
    'variants', jsonb_build_array(jsonb_build_object('variant_id', 'ZZ-M1-V1', 'model_id', 'ZZ-M1', 'in_stock', true, 'qty_stock', 1,
                'qty_in', 1, 'qty_sold', 0, 'arrival_years', '[]'::jsonb, 'found_online', false, 'sources', '[]'::jsonb,
                'sort_order', 1, 'qty_transit', 0)),
    'pieces', jsonb_build_array(
      jsonb_build_object('serial', 'ZZ.00.90001', 'variant_id', 'ZZ-M1-V1', 'size', '52', 'price_uzs', 1000000,
                         'barcode', '2000000000017')),
    'attributes', '[]'::jsonb, 'links', '[]'::jsonb, 'expected', '[]'::jsonb);

  -- barcode in
  r := cat_load(pl, 'pos t2 a');
  assert (select barcode from cat_pieces where serial = 'ZZ.00.90001') = '2000000000017', 'cat_pieces.barcode';
  assert (select barcode from ops_pieces where serial = 'ZZ.00.90001') = '2000000000017', 'ops_pieces.barcode (new piece)';
  assert (r->'ops'->>'sold_by_us_in_load')::int = 0, 'no guard hit yet ' || r::text;

  -- barcode kept: the same piece loaded without a barcode
  pl := jsonb_set(pl, '{pieces}', jsonb_build_array(
      jsonb_build_object('serial', 'ZZ.00.90001', 'variant_id', 'ZZ-M1-V1', 'size', '52', 'price_uzs', 1000000)));
  drop table if exists _ov_new, _cat_facet_stage_v2;
  r := cat_load(pl, 'pos t2 b');
  assert (select barcode from cat_pieces where serial = 'ZZ.00.90001') is null, 'cat_pieces barcode empty without one';
  assert (select barcode from ops_pieces where serial = 'ZZ.00.90001') = '2000000000017', 'ops_pieces.barcode kept';
  assert (r->'ops'->>'refreshed')::int = 1, 'piece refreshed ' || r::text;

  -- sold by us: piece sold on a delardi ticket, then its serial shows in the stock load
  insert into ops_pieces(store_id, brand, serial, state, last_seen_run)
  values (1, 'ZZ Brand', 'ZZ.00.90002', 'in_stock', (select max(id) from cat_import_runs)) returning piece_id into p_sold;
  insert into ops_tickets(store_id, source, ticket_no, sold_at) values (1, 'delardi', 'D-000001', date '2030-05-01')
    returning ticket_id into v_tid;
  insert into ops_ticket_lines(ticket_id, line_no, kind, serial_raw, brand_raw, piece_id)
    values (v_tid, 1, 'sale', 'ZZ.00.90002', 'ZZ Brand', p_sold) returning line_id into v_line;
  update ops_pieces set state = 'sold', state_since = now(), sold_line_id = v_line where piece_id = p_sold;

  pl := jsonb_set(pl, '{pieces}', jsonb_build_array(
      jsonb_build_object('serial', 'ZZ.00.90001', 'variant_id', 'ZZ-M1-V1', 'size', '52', 'price_uzs', 1000000),
      jsonb_build_object('serial', 'zz.00.90002', 'variant_id', 'ZZ-M1-V1', 'size', '52', 'price_uzs', 1000000)));
  drop table if exists _ov_new, _cat_facet_stage_v2;
  r := cat_load(pl, 'pos t2 c');
  assert (select count(*) from ops_pieces where upper(serial) = 'ZZ.00.90002') = 1, 'no new piece for a serial our tool sold';
  assert (select state from ops_pieces where piece_id = p_sold) = 'sold', 'piece stays sold';
  assert (select count(*) from ops_review where piece_id = p_sold and kind = 'ticket_conflict' and status = 'open'
            and note like '%sold on D-000001%') = 1, 'one open ticket_conflict review with the ticket number';
  assert (r->'ops'->>'sold_by_us_in_load')::int = 1, 'sold_by_us_in_load ' || r::text;
  -- loaded again: the review is raised once
  drop table if exists _ov_new, _cat_facet_stage_v2;
  r := cat_load(pl, 'pos t2 d');
  assert (select count(*) from ops_review where piece_id = p_sold and kind = 'ticket_conflict' and status = 'open') = 1,
         'review not raised twice';
  assert (r->'ops'->>'sold_by_us_in_load')::int = 1, 'still counted ' || r::text;

  -- Colibri-sold is not guarded: no error, the existing behaviour (a new live piece and a serial_reused review)
  update ops_tickets set source = 'colibri', ticket_no = 'POS-C-1' where ticket_id = v_tid;
  update ops_review set status = 'auto_closed', resolved_at = now(), resolved_by = 'test' where piece_id = p_sold;
  drop table if exists _ov_new, _cat_facet_stage_v2;
  r := cat_load(pl, 'pos t2 e');
  assert (r->'ops'->>'sold_by_us_in_load')::int = 0, 'colibri ticket is not guarded ' || r::text;
  assert (select count(*) from ops_pieces where upper(serial) = 'ZZ.00.90002' and state = 'in_stock') = 1,
         'colibri-sold serial in the load comes back as a new piece, as in S2';
  assert exists (select 1 from ops_review r2 join ops_pieces o on o.piece_id = r2.piece_id
                  where o.serial = 'zz.00.90002' and r2.kind = 'serial_reused'), 'serial_reused raised, as in S2';

  -- go-live: ticket loader
  l := jsonb_build_object('line_no', 1, 'kind', 'sale', 'article', null, 'colour', null, 'item_name', 'ZZ ring',
         'size', null, 'qty', 1, 'price_list', null, 'price_current', null, 'discount_pct', null, 'discount_amt', null,
         'net', 100000, 'brand_raw', 'ZZ Brand', 'serial_raw', null, 'sk', null, 'vip', null);
  t := jsonb_build_object('seller_raw', null, 'client_raw', null, 'note', null, 'source_file', 'ZZ-sales.xlsx',
         'payments', '[]'::jsonb, 'lines', jsonb_build_array(l));
  pl := jsonb_build_object('tickets', jsonb_build_array(
          t || jsonb_build_object('ticket_no', 'ZZ-G1', 'sold_at', '2030-05-31'),
          t || jsonb_build_object('ticket_no', 'ZZ-G2', 'sold_at', '2030-06-01')));
  update pos_settings set go_live_date = null;
  r := ops_load_tickets(pl, 'test');
  assert (r->>'tickets_new')::int = 2 and r->'refused_after_go_live' = '[]'::jsonb, 'no go-live date: both load ' || r::text;
  delete from ops_tickets where ticket_no in ('ZZ-G1', 'ZZ-G2');
  update pos_settings set go_live_date = date '2030-06-01';
  r := ops_load_tickets(pl, 'test');
  assert (r->>'tickets_new')::int = 1 and r->'refused_after_go_live' = '["ZZ-G2"]'::jsonb, 'go-live: second refused ' || r::text;
  assert exists (select 1 from ops_tickets where ticket_no = 'ZZ-G1') and not exists (select 1 from ops_tickets where ticket_no = 'ZZ-G2'),
         'only the earlier ticket is stored';
  -- go-live: CRM purchase import
  insert into crm_clients(client_id, record_type, name_colibri) values ('DLD-9001', 'client', 'Zztest Clientov');
  insert into crm_import_batches(created_by, period_from, period_to) values ('test', '2030-05-01', '2030-06-30') returning id into b;
  insert into crm_import_lines(batch_id, row_no, sold_at, name_raw, name_key, item, article, qty, gross, discount_pct, net) values
    (b, 1, '2030-05-31', 'Zztest Clientov', crm_name_key('Zztest Clientov'), 'ZZ ring', 'ZZ-IMP-1', 1, 500000, 0, 500000),
    (b, 2, '2030-06-01', 'Zztest Clientov', crm_name_key('Zztest Clientov'), 'ZZ ring', 'ZZ-IMP-2', 1, 700000, 0, 700000);
  res := crm_import_apply(b, 'test');
  assert (res->>'refused_after_go_live')::int = 1, 'one CRM line refused ' || res::text;
  assert (select count(*) from crm_transactions where client_id = 'DLD-9001' and article = 'ZZ-IMP-1') = 1, 'earlier line applied';
  assert (select count(*) from crm_transactions where client_id = 'DLD-9001' and article = 'ZZ-IMP-2') = 0, 'go-live line not applied';
end $$;
select 'pos_t2 ok' as result;
rollback;
