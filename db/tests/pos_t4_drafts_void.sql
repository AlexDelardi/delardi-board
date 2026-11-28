-- POS Task 4: suspend, cancel, void, clear training. Invented fixtures. Rolled back.
begin;
-- ticket numbers from 1 inside this transaction; ALTER SEQUENCE is transactional, so the rollback
-- leaves both sequences as they were (nextval alone is not rolled back)
alter sequence pos_ticket_no_seq restart;
alter sequence pos_training_no_seq restart;

-- expects the statement to raise a message starting with p_prefix, and to leave no ticket and no draft behind
create function pg_temp.t4_refused(p_sql text, p_prefix text) returns void language plpgsql as $$
declare t0 bigint := (select count(*) from ops_tickets); d0 bigint := (select count(*) from pos_draft_lines);
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_prefix || '%' then
      raise exception 'expected "%", got "%"', p_prefix, sqlerrm;
    end if;
    if (select count(*) from ops_tickets) <> t0 then raise exception 'refusal left a ticket'; end if;
    if (select count(*) from pos_draft_lines) <> d0 then raise exception 'refusal left draft lines'; end if;
    return;
  end;
  raise exception 'expected "%", but it went through: %', p_prefix, p_sql;
end $$;

do $$
declare
  pl jsonb; r jsonb; res jsonb; p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid;
  d1 bigint; d2 bigint; d3 bigint; d_live bigint; d_tr bigint; v_tid uuid; v_line uuid; v_col uuid; v_tr uuid;
  v_spend0 numeric; v_occ0 int; v_items0 int; m0 record; m1 record; v_log0 bigint; v_ev0 bigint; v_live0 bigint;
  sale jsonb; ev ops_piece_events%rowtype; tk ops_tickets%rowtype; v_month date := date_trunc('month', (now() at time zone 'Asia/Tashkent')::date)::date;
begin
  insert into ops_stores(store_id, code, name)
  select 1, 'POS-STORE', 'POS store' where not exists (select 1 from ops_stores where store_id = 1);
  insert into crm_clients(client_id, record_type, name_colibri, name_confirmed)
    values ('DLD-9001', 'client', 'Zztest Clientov', 'Zztest Clientov');
  insert into crm_sales_reps(source_name, label) values ('S3T Source', 'S3T Rep'), ('S3T Source 2', 'S3T Rep 2');

  pl := jsonb_build_object('built', 'pos t4',
    'models', jsonb_build_array(jsonb_build_object('model_id', 'ZZ-M4', 'article', 'ZZ-ART-4', 'brand', 'S3T Brand',
                'brand_raw', jsonb_build_array('S3T Brand'), 'category', 'jewellery', 'retail_category', 'Jewellery',
                'collection', 'Zz Collection', 'model_name', 'Zz Ring', 'in_stock', true, 'qty_stock', 5,
                'arrival_years', '[]'::jsonb, 'variant_count', 1, 'completeness', 0, 'missing_crucial', '[]'::jsonb,
                'has_unconfirmed', false, 'metal_keys', '["gold_white"]'::jsonb, 'stone_keys', '["diamond"]'::jsonb,
                'size_keys', '[]'::jsonb, 'qty_transit', 0)),
    'variants', jsonb_build_array(jsonb_build_object('variant_id', 'ZZ-M4-V1', 'model_id', 'ZZ-M4', 'colour_code', 'WG',
                'in_stock', true, 'qty_stock', 5, 'qty_in', 5, 'qty_sold', 0, 'arrival_years', '[]'::jsonb,
                'found_online', false, 'sources', '[]'::jsonb, 'sort_order', 1, 'qty_transit', 0)),
    'pieces', jsonb_build_array(
      jsonb_build_object('serial', 'ZZ.00.30001', 'variant_id', 'ZZ-M4-V1', 'size', '16', 'price_uzs', 31500000),
      jsonb_build_object('serial', 'ZZ.00.30002', 'variant_id', 'ZZ-M4-V1', 'size', '17', 'price_uzs', 20000000),
      jsonb_build_object('serial', 'ZZ.00.30003', 'variant_id', 'ZZ-M4-V1', 'size', '18', 'price_uzs', 9990000),
      jsonb_build_object('serial', 'ZZ.00.30004', 'variant_id', 'ZZ-M4-V1', 'size', '18', 'price_uzs', 12000000),
      jsonb_build_object('serial', 'ZZ.00.30005', 'variant_id', 'ZZ-M4-V1', 'size', '18', 'price_uzs', 5000000)),
    'attributes', '[]'::jsonb, 'links', '[]'::jsonb, 'expected', '[]'::jsonb);
  r := cat_load(pl, 'pos t4 a');
  select piece_id into p1 from ops_pieces where serial = 'ZZ.00.30001';
  select piece_id into p2 from ops_pieces where serial = 'ZZ.00.30002';
  select piece_id into p3 from ops_pieces where serial = 'ZZ.00.30003';
  select piece_id into p4 from ops_pieces where serial = 'ZZ.00.30004';
  select piece_id into p5 from ops_pieces where serial = 'ZZ.00.30005';
  assert p1 is not null and p5 is not null, 'fixture pieces loaded';

  perform pos_set_mode('live', 'pos t4');

  ---------------- suspend
  res := pos_suspend(jsonb_build_object('client_id', 'DLD-9001', 'walk_in', false, 'seller', 'S3T Rep',
           'mode', 'training',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p1, 'price_uzs', 31500000, 'discount_pct', 5,
                                                         'seller', 'S3T Rep 2'))), 'pos t4');
  d1 := (res->>'draft_id')::bigint;
  assert d1 is not null and res = jsonb_build_object('draft_id', d1), 'suspend result ' || res::text;
  assert (select mode = 'live' and client_id = 'DLD-9001' and not walk_in and seller = 'S3T Source'
                 and created_by = 'pos t4' from pos_drafts where draft_id = d1), 'draft row (mode from settings)';
  assert (select mode = 'live' and line_no = 1 and price_uzs = 31500000 and discount_pct = 5 and seller = 'S3T Source 2'
            from pos_draft_lines where draft_id = d1), 'draft line mode equals the draft mode';
  res := pos_drafts_list('live');
  assert jsonb_array_length(res) = 1 and (res->0->>'draft_id')::bigint = d1, 'drafts list has it ' || res::text;
  assert res->0->>'created_by' = 'pos t4' and res->0->>'client_id' = 'DLD-9001' and (res->0->>'walk_in')::boolean = false
         and res->0->>'seller' = 'S3T Rep' and res->0->>'created_at' is not null, 'draft header ' || res::text;
  assert jsonb_array_length(res->0->'lines') = 1 and res->0->'lines'->0 = jsonb_build_object(
           'piece_id', p1, 'serial', 'ZZ.00.30001', 'brand', 'S3T Brand', 'model_name', 'Zz Ring',
           'price_uzs', 31500000, 'discount_pct', 5, 'net_uzs', null, 'image', null, 'seller', 'S3T Rep 2'), 'draft line ' || res::text;
  assert res::text not like '%S3T Source%', 'no Colibri names in the list';
  assert pos_drafts_list('training') = '[]'::jsonb, 'training list empty';

  -- another sale cannot be posted while a live sale is suspended
  sale := jsonb_build_object('walk_in', true, 'seller', 'S3T Rep',
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p2, 'price_uzs', 20000000, 'discount_pct', 0)),
            'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 20000000)));
  perform pg_temp.t4_refused(format('select pos_post_sale(%L::jsonb, %L)', sale, 'pos t4'), 'another sale is suspended');

  -- posting the suspended sale itself goes through and removes the draft
  res := pos_post_sale(jsonb_build_object('draft_id', d1, 'client_id', 'DLD-9001', 'walk_in', false, 'seller', 'S3T Rep',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p1, 'price_uzs', 31500000, 'discount_pct', 5)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 29925000))), 'pos t4');
  assert res->>'ticket_no' = 'D-000001', 'posted from the draft ' || res::text;
  assert not exists (select 1 from pos_drafts where draft_id = d1), 'draft gone';
  assert pos_drafts_list('live') = '[]'::jsonb, 'list empty after post';
  -- a suspended sale keeps a line's exact total, and its photo comes with the list
  update cat_models set image_key = 'ZZ-M4/all/1-zz-400.webp' where model_id = 'ZZ-M4';
  res := pos_suspend(jsonb_build_object('walk_in', true, 'seller', 'S3T Rep',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p5, 'price_uzs', 5000000, 'discount_pct', 5.1034, 'net_uzs', 4744832))), 'pos t4');
  assert (select l->>'net_uzs' = '4744832' and l->>'image' = 'ZZ-M4/all/1-zz-400.webp'
            from jsonb_array_elements(pos_drafts_list('live')) d, jsonb_array_elements(d->'lines') l
           where (d->>'draft_id')::bigint = (res->>'draft_id')::bigint), 'draft keeps the line total and has the photo';
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true, 'seller', 'S3T Rep',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p4, 'price_uzs', 12000000, 'discount_pct', 5, 'net_uzs', 11000000))), 'pos t4'),
         'a line total does not match');
  perform pos_cancel_draft((res->>'draft_id')::bigint, 'pos t4');

  ---------------- suspend refusals
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true,
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p1, 'price_uzs', 1000))), 'pos t4'),
         'piece ZZ.00.30001 is not in stock');
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', '{"walk_in": true, "lines": []}', 'pos t4'), 'no lines');
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', '{"walk_in": true}', 'pos t4'), 'no lines');
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true,
            'lines', jsonb_build_array(jsonb_build_object('price_uzs', 1000))), 'pos t4'), 'no lines: a line has no piece');
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true,
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p3), jsonb_build_object('piece_id', p3))), 'pos t4'),
         'piece listed twice');
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true,
            'lines', jsonb_build_array(jsonb_build_object('piece_id', gen_random_uuid()))), 'pos t4'), 'piece not found');
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true,
            'seller', 'S3T Source', 'lines', jsonb_build_array(jsonb_build_object('piece_id', p3))), 'pos t4'),
         'choose a seller');
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true,
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p3, 'seller', 'Nobody'))), 'pos t4'), 'choose a seller');
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true,
            'client_id', 'DLD-9001', 'lines', jsonb_build_array(jsonb_build_object('piece_id', p3))), 'pos t4'),
         'choose a client or walk-in');
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object(
            'client_id', 'DLD-9999', 'lines', jsonb_build_array(jsonb_build_object('piece_id', p3))), 'pos t4'),
         'choose a client or walk-in');
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true,
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p3, 'price_uzs', 0))), 'pos t4'), 'price must be positive');
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true,
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p3, 'price_uzs', 10.5))), 'pos t4'), 'price must be positive');
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true,
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p3, 'discount_pct', 100))), 'pos t4'),
         'discount must be 0 to 100');
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true,
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p3, 'discount_pct', -1))), 'pos t4'),
         'discount must be 0 to 100');
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true,
            'draft_id', 999999999, 'lines', jsonb_build_array(jsonb_build_object('piece_id', p3))), 'pos t4'),
         'suspended sale 999999999 not found');

  ---------------- hold
  d2 := (pos_suspend(jsonb_build_object('walk_in', true, 'seller', 'S3T Rep',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p3, 'price_uzs', 9990000))), 'pos t4')->>'draft_id')::bigint;
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true,
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p2), jsonb_build_object('piece_id', p3))), 'pos t4'),
         'piece ZZ.00.30003 is in suspended sale ' || d2);
  assert (select count(*) from pos_drafts where mode = 'live') = 1, 'refused suspend left no draft';
  -- one till: a second new suspended sale in the same mode is refused (after the holds, above)
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true,
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p2))), 'pos t4'), 'another sale is suspended');
  assert (select count(*) from pos_drafts where mode = 'live') = 1, 'second suspend left no draft';

  -- replacing a draft's lines: its own piece is not held against it; an empty price is kept as empty
  res := pos_suspend(jsonb_build_object('draft_id', d2, 'walk_in', true,
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p5),
                                      jsonb_build_object('piece_id', p3, 'price_uzs', 9000000, 'discount_pct', 2.5))), 'pos t4');
  assert (res->>'draft_id')::bigint = d2, 'same draft';
  assert (select count(*) from pos_drafts where mode = 'live') = 1, 'still one live draft';
  assert (select array_agg(o.serial || '/' || coalesce(l.price_uzs::text, '-') || '/' || trim_scale(l.discount_pct) || '/' || l.mode
                           order by l.line_no)
            from pos_draft_lines l join ops_pieces o using (piece_id) where l.draft_id = d2)
         = array['ZZ.00.30005/-/0/live', 'ZZ.00.30003/9000000/2.5/live'], 'lines replaced';
  assert (select seller is null and walk_in and updated_at is not null from pos_drafts where draft_id = d2), 'header replaced';
  res := pos_drafts_list('live');
  assert res->0->'lines'->0->'price_uzs' = 'null'::jsonb and res->0->>'seller' is null, 'empty price listed ' || res::text;
  assert (select (e->>'sellable')::boolean = false and e->'held' = jsonb_build_object('draft_id', d2)
            from jsonb_array_elements(pos_search_pieces('ZZ.00.30005', 'live')) e), 'search shows the hold';

  ---------------- cancel
  v_log0 := (select count(*) from pos_settings_log);
  perform pos_cancel_draft(d2, 'pos t4');
  assert not exists (select 1 from pos_drafts where draft_id = d2), 'cancelled';
  assert not exists (select 1 from pos_draft_lines where draft_id = d2), 'lines cascade';
  assert (select count(*) from pos_settings_log) = v_log0 + 1, 'one log row';
  assert (select field = 'draft_cancelled' and new_value = d2::text and actor = 'pos t4'
            from pos_settings_log order by id desc limit 1), 'log row fields';
  d3 := (pos_suspend(jsonb_build_object('walk_in', true,
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p3, 'price_uzs', 9990000))), 'pos t4')->>'draft_id')::bigint;
  assert d3 is not null, 'piece freed by cancel';
  perform pos_cancel_draft(d3, 'pos t4');
  perform pg_temp.t4_refused(format('select pos_cancel_draft(%s, %L)', d3, 'pos t4'), 'suspended sale ' || d3 || ' not found');

  ---------------- void live
  insert into crm_transactions(client_id, sold_at, brand, item, qty, gross_uzs, discount_pct, net_uzs, advisor)
    values ('DLD-9001', date '2025-03-10', 'S3T Brand', 'Zz earlier', 1, 5000000, 0, 5000000, 'S3T Source');
  perform crm_recompute_purchases(array['DLD-9001']);
  select lifetime_spend_uzs, purchase_occasions, items_bought into v_spend0, v_occ0, v_items0
    from crm_clients where client_id = 'DLD-9001';
  assert v_spend0 = 34925000, 'spend before ' || v_spend0;
  select * into m0 from ops_ticket_monthly where month = v_month;
  res := pos_post_sale(jsonb_build_object('client_id', 'DLD-9001', 'walk_in', false, 'seller', 'S3T Rep',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p4, 'price_uzs', 12000000, 'discount_pct', 0)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'card', 'card_type', 'humo', 'amount', 12000000))), 'pos t4');
  v_tid := (res->>'ticket_id')::uuid;
  assert res->>'ticket_no' = 'D-000002', 'live post ' || res::text;
  select line_id into v_line from ops_ticket_lines where ticket_id = v_tid;
  assert (select lifetime_spend_uzs from crm_clients where client_id = 'DLD-9001') = v_spend0 + 12000000, 'spend after post';
  assert (select count(*) from crm_transactions where ticket_line_id = v_line) = 1, 'crm row after post';
  select * into m1 from ops_ticket_monthly where month = v_month;
  assert m1.net = m0.net + 12000000 and m1.tickets = m0.tickets + 1, 'month counts the post';
  v_ev0 := (select count(*) from ops_piece_events where piece_id = p4);

  res := pos_void_ticket(v_tid, 'S3T wrong piece', 'pos t4 voider');
  assert res = jsonb_build_object('ticket_no', 'D-000002', 'pieces_returned', 1), 'void result ' || res::text;
  select * into tk from ops_tickets where ticket_id = v_tid;
  assert tk.status = 'void' and tk.void_reason = 'S3T wrong piece' and tk.voided_by = 'pos t4 voider'
         and tk.voided_at is not null, 'ticket void fields';
  assert exists (select 1 from ops_ticket_lines where line_id = v_line)
         and exists (select 1 from ops_ticket_payments where ticket_id = v_tid), 'lines and payments kept';
  assert (select state = 'in_stock' and sold_line_id is null from ops_pieces where piece_id = p4), 'piece back in stock';
  assert (select count(*) from ops_piece_events where piece_id = p4) = v_ev0 + 1, 'one event';
  select * into ev from ops_piece_events where piece_id = p4 order by event_id desc limit 1;
  assert ev.reason = 'void: S3T wrong piece' and ev.from_state = 'sold' and ev.to_state = 'in_stock'
         and ev.ref_kind = 'ticket' and ev.ref_id = 'D-000002' and ev.actor = 'pos t4 voider', 'void event ' || row_to_json(ev)::text;
  assert not exists (select 1 from crm_transactions where ticket_line_id = v_line), 'crm row removed';
  assert (select lifetime_spend_uzs = v_spend0 and purchase_occasions = v_occ0 and items_bought = v_items0
            from crm_clients where client_id = 'DLD-9001'), 'client figures back';
  assert (select count(*) from crm_transactions where client_id = 'DLD-9001') = 2, 'other purchases untouched';
  -- observed and pinned: a void ticket is left out of ops_ticket_monthly entirely (neither counted nor summed)
  select * into m1 from ops_ticket_monthly where month = v_month;
  assert m1.net = m0.net and m1.tickets = m0.tickets and m1.sale_lines = m0.sale_lines
         and m1.card = m0.card and m1.unrecorded = m0.unrecorded, 'month back to before the post ' || row_to_json(m1)::text;
  -- the returned piece can be sold again
  res := pos_post_sale(jsonb_build_object('walk_in', true, 'seller', 'S3T Rep',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p4, 'price_uzs', 12000000, 'discount_pct', 0)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 12000000))), 'pos t4');
  assert (select state = 'sold' and sold_line_id = (select line_id from ops_ticket_lines where ticket_id = (res->>'ticket_id')::uuid)
            from ops_pieces where piece_id = p4), 'resold after void';

  ---------------- void guards
  insert into ops_tickets(store_id, source, ticket_no, sold_at) values (1, 'colibri', 'S3T-901', current_date)
    returning ticket_id into v_col;
  perform pg_temp.t4_refused(format('select pos_void_ticket(%L, %L, %L)', v_col, 'S3T reason', 'pos t4'),
         'only sales from this tool can be voided');
  assert (select status from ops_tickets where ticket_id = v_col) = 'posted', 'colibri untouched';
  perform pg_temp.t4_refused(format('select pos_void_ticket(%L, %L, %L)', v_tid, 'S3T again', 'pos t4'), 'already void');
  assert (select void_reason from ops_tickets where ticket_id = v_tid) = 'S3T wrong piece', 'first reason kept';
  select ticket_id into v_tid from ops_tickets where ticket_no = 'D-000001';
  perform pg_temp.t4_refused(format('select pos_void_ticket(%L, %L, %L)', v_tid, '  ', 'pos t4'), 'give a reason');
  perform pg_temp.t4_refused(format('select pos_void_ticket(%L, null, %L)', v_tid, 'pos t4'), 'give a reason');
  assert (select status from ops_tickets where ticket_id = v_tid) = 'posted', 'blank reason changed nothing';
  perform pg_temp.t4_refused(format('select pos_void_ticket(%L, %L, %L)', gen_random_uuid(), 'S3T reason', 'pos t4'), 'ticket');

  ---------------- clear training
  -- a live draft holding ZZ.00.30003 survives; a training draft may hold the same piece
  d_live := (pos_suspend(jsonb_build_object('walk_in', true,
              'lines', jsonb_build_array(jsonb_build_object('piece_id', p3))), 'pos t4')->>'draft_id')::bigint;
  perform pos_set_mode('training', 'pos t4');
  v_live0 := (select count(*) from ops_tickets where source <> 'training');
  res := pos_post_sale(jsonb_build_object('walk_in', true, 'seller', 'S3T Rep',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p5, 'price_uzs', 5000000)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 5000000))), 'pos t4');
  assert res->>'ticket_no' = 'T-000001', 'training 1';
  res := pos_post_sale(jsonb_build_object('walk_in', true, 'seller', 'S3T Rep',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p2, 'price_uzs', 20000000)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 20000000))), 'pos t4');
  d_tr := (pos_suspend(jsonb_build_object('walk_in', true,
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p3))), 'pos t4')->>'draft_id')::bigint;
  assert (select mode from pos_drafts where draft_id = d_tr) = 'training'
         and (select mode from pos_draft_lines where draft_id = d_tr) = 'training', 'training draft and line';
  assert jsonb_array_length(pos_drafts_list('training')) = 1 and jsonb_array_length(pos_drafts_list('live')) = 1, 'lists by mode';
  v_log0 := (select count(*) from pos_settings_log);
  res := pos_clear_training('pos t4');
  assert res = '{"tickets": 2, "drafts": 1}'::jsonb, 'clear result ' || res::text;
  assert not exists (select 1 from ops_tickets where source = 'training'), 'no training ticket';
  assert not exists (select 1 from pos_drafts where mode = 'training'), 'no training draft';
  assert not exists (select 1 from pos_draft_lines where mode = 'training'), 'no training draft line';
  assert (select count(*) from ops_tickets where source <> 'training') = v_live0, 'live tickets untouched';
  assert exists (select 1 from pos_drafts where draft_id = d_live), 'live draft untouched';
  assert (select count(*) from pos_settings_log) = v_log0 + 1
         and (select field = 'training_cleared' and actor = 'pos t4' from pos_settings_log order by id desc limit 1), 'one log row';
  assert pos_clear_training('pos t4') = '{"tickets": 0, "drafts": 0}'::jsonb, 'clear again: nothing';

  ---------------- void training: status only
  res := pos_post_sale(jsonb_build_object('walk_in', true, 'seller', 'S3T Rep',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p5, 'price_uzs', 5000000)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 5000000))), 'pos t4');
  v_tr := (res->>'ticket_id')::uuid;
  v_ev0 := (select count(*) from ops_piece_events where piece_id = p5);
  res := pos_void_ticket(v_tr, 'S3T practice', 'pos t4');
  assert res = jsonb_build_object('ticket_no', 'T-000003', 'pieces_returned', 0), 'training void ' || res::text;
  assert (select status = 'void' and void_reason = 'S3T practice' and voided_by = 'pos t4' and voided_at is not null
            from ops_tickets where ticket_id = v_tr), 'training status';
  assert (select state from ops_pieces where piece_id = p5) = 'in_stock', 'piece unchanged';
  assert (select count(*) from ops_piece_events where piece_id = p5) = v_ev0, 'no event';

  ---------------- a training draft does not block a live suspend
  d_tr := (pos_suspend(jsonb_build_object('walk_in', true,
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p2))), 'pos t4')->>'draft_id')::bigint;
  perform pg_temp.t4_refused(format('select pos_suspend(%L::jsonb, %L)', jsonb_build_object('walk_in', true,
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p5))), 'pos t4'), 'another sale is suspended');
  perform pos_set_mode('live', 'pos t4');
  perform pos_cancel_draft(d_live, 'pos t4');
  d3 := (pos_suspend(jsonb_build_object('walk_in', true,
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p2))), 'pos t4')->>'draft_id')::bigint;
  assert (select mode from pos_drafts where draft_id = d3) = 'live'
         and exists (select 1 from pos_drafts where draft_id = d_tr and mode = 'training'), 'live suspend beside a training draft';
  -- updating the existing draft through draft_id still works while it is the one suspended sale
  res := pos_suspend(jsonb_build_object('draft_id', d3, 'walk_in', true,
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p2, 'price_uzs', 20000000),
                                      jsonb_build_object('piece_id', p5))), 'pos t4');
  assert (res->>'draft_id')::bigint = d3 and (select count(*) from pos_draft_lines where draft_id = d3) = 2, 'draft updated';

  ---------------- privileges
  assert (select bool_and(p.prosecdef and p.proconfig @> array['search_path=public, pg_temp']
                          and not has_function_privilege('anon', p.oid, 'execute')
                          and not has_function_privilege('authenticated', p.oid, 'execute'))
            from pg_proc p where p.pronamespace = 'public'::regnamespace
             and p.proname in ('pos_suspend', 'pos_drafts_list', 'pos_cancel_draft', 'pos_void_ticket', 'pos_clear_training')),
         'definer, search_path, no API execute';
  assert (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
           and proname in ('pos_suspend', 'pos_drafts_list', 'pos_cancel_draft', 'pos_void_ticket', 'pos_clear_training')) = 5,
         'five functions';
end $$;

select 'pos_t4 ok' as result;
rollback;
