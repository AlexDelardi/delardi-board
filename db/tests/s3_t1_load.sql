-- Sprint 3, Task 3: ticket loader and piece rule (spec §4.2–4.3). Synthetic data only. Rolled back.
begin;
do $$
declare
  run bigint; p1 uuid; p2 uuid; p3 uuid; p4 uuid; r jsonb; l jsonb; ln jsonb; t1 jsonb; t2 jsonb;
  pay_card jsonb; v_line uuid; v_tid uuid; n_lines int; n_pay int; n_tickets int; past timestamptz;
begin
  -- fixtures
  insert into ops_stores(store_id, code, name)
  select 1, 'S3T-STORE', 'S3T store' where not exists (select 1 from ops_stores where store_id = 1);
  insert into cat_import_runs(source_file, run_at) values ('S3T-run.xlsx', now() - interval '5 days')
  returning id into run;
  insert into ops_pieces(store_id, brand, serial, state, last_seen_run)
  values (1, 'Bulgari', 'S3T-SER-1', 'in_stock', run) returning piece_id into p1;
  insert into ops_pieces(store_id, brand, serial, state, last_seen_run)
  values (1, 'Bulgari', 'S3T-SER-2', 'in_stock', run) returning piece_id into p2;
  insert into ops_pieces(store_id, brand, serial, state, last_seen_run)
  values (1, 'Bulgari', 'S3T-SER-3', 'in_transit', null) returning piece_id into p3;
  insert into ops_pieces(store_id, brand, serial, state, last_seen_run)
  values (1, 'Bulgari', 'S3T-SER-4', 'in_stock', run) returning piece_id into p4;
  insert into crm_sales_reps(source_name, label) values ('S3T Rep', 'S3T Rep label');
  insert into crm_rep_aliases(alias, source_name) values ('S3T Продавец', 'S3T Rep');

  -- a sale line template; cases override the keys they need
  l := jsonb_build_object('line_no', 1, 'kind', 'sale', 'article', 'S3T-ART-1', 'colour', 'RED',
         'item_name', 'S3T ring', 'size', null, 'qty', 1, 'price_list', 1000000, 'price_current', 1000000,
         'discount_pct', null, 'discount_amt', null, 'net', 1000000, 'brand_raw', 'Bulgari',
         'serial_raw', null, 'sk', 'A', 'vip', null);
  pay_card := jsonb_build_object('method', 'card', 'amount', 1500000, 'raw', 'кар');
  t1 := jsonb_build_object('ticket_no', 'S3T-1', 'sold_at', (current_date - 10)::text, 'seller_raw', ' s3t Продавец ',
          'client_raw', 'S3T Client One', 'note', 'S3T note', 'source_file', 'S3T-sales.xlsx',
          'lines', jsonb_build_array(l, l || jsonb_build_object('line_no', 2, 'net', 500000, 'colour', null,
                                                                 'sk', null, 'vip', 5)),
          'payments', jsonb_build_array(pay_card));
  t2 := jsonb_build_object('ticket_no', 'S3T-2', 'sold_at', (current_date - 9)::text, 'seller_raw', 'S3T Nobody',
          'client_raw', 'S3T Client Two', 'note', null, 'source_file', 'S3T-sales.xlsx',
          'lines', jsonb_build_array(l || jsonb_build_object('kind', 'refund', 'net', 200000)),
          'payments', '[]'::jsonb);

  -- new load
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t1, t2)), 'test');
  assert (r->>'tickets_new')::int = 2, 'new: tickets_new ' || r::text;
  assert (r->>'lines')::int = 3, 'new: lines ' || r::text;
  assert (r->>'payments')::int = 1, 'new: payments ' || r::text;
  assert (select seller from ops_tickets where ticket_no = 'S3T-1' and source = 'colibri' and store_id = 1) = 'S3T Rep',
         'new: alias seller mapped';
  assert (select seller from ops_tickets where ticket_no = 'S3T-2') is null, 'new: unknown seller left null';
  assert (r->'sellers_unmapped') ? 'S3T Nobody', 'new: unknown seller listed ' || r::text;
  assert not (r->'sellers_unmapped') ? ' s3t Продавец ', 'new: mapped seller not listed';
  assert (select client_raw from ops_tickets where ticket_no = 'S3T-1') = 'S3T Client One', 'new: client_raw';
  assert (select source_file from ops_tickets where ticket_no = 'S3T-1') = 'S3T-sales.xlsx', 'new: source_file';
  select ticket_id into v_tid from ops_tickets where ticket_no = 'S3T-1';
  assert (select brand_raw from ops_ticket_lines where ticket_id = v_tid and line_no = 1) = 'Bulgari', 'new: brand_raw';
  assert (select colour from ops_ticket_lines where ticket_id = v_tid and line_no = 1) = 'RED', 'new: colour';
  assert (select extra->>'sk' from ops_ticket_lines where ticket_id = v_tid and line_no = 1) = 'A', 'new: extra sk';
  assert (select (extra->>'vip')::numeric from ops_ticket_lines where ticket_id = v_tid and line_no = 2) = 5, 'new: extra vip';
  assert (select kind from ops_ticket_lines l join ops_tickets t using (ticket_id) where t.ticket_no = 'S3T-2') = 'refund',
         'new: refund kind';
  assert (select count(*) from ops_ticket_payments where ticket_id = v_tid and method = 'card' and amount = 1500000) = 1,
         'new: card payment';

  -- load twice: nothing changes
  past := now() - interval '1 day';
  update ops_tickets set updated_at = past where ticket_no in ('S3T-1', 'S3T-2');
  select count(*) into n_lines from ops_ticket_lines l join ops_tickets t using (ticket_id) where t.ticket_no like 'S3T-%';
  select count(*) into n_pay from ops_ticket_payments p join ops_tickets t using (ticket_id) where t.ticket_no like 'S3T-%';
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t1, t2)), 'test');
  assert (r->>'tickets_same')::int = 2, 'twice: tickets_same ' || r::text;
  assert (r->>'tickets_new')::int = 0 and (r->>'tickets_changed')::int = 0, 'twice: no new/changed ' || r::text;
  assert (select count(*) from ops_ticket_lines l join ops_tickets t using (ticket_id) where t.ticket_no like 'S3T-%') = n_lines,
         'twice: line count';
  assert (select count(*) from ops_ticket_payments p join ops_tickets t using (ticket_id) where t.ticket_no like 'S3T-%') = n_pay,
         'twice: payment count';
  assert (select bool_and(updated_at = past) from ops_tickets where ticket_no in ('S3T-1', 'S3T-2')), 'twice: updated_at unchanged';

  -- changed ticket: line 1 net, seller (raw is already a rep source_name), a third line, payment now visa
  t1 := t1 || jsonb_build_object('seller_raw', 'S3T Rep',
          'lines', jsonb_build_array(l || jsonb_build_object('net', 900000),
                                     l || jsonb_build_object('line_no', 2, 'net', 500000, 'colour', null, 'sk', null, 'vip', 5),
                                     l || jsonb_build_object('line_no', 3, 'net', 100000, 'article', 'S3T-ART-3')),
          'payments', jsonb_build_array(jsonb_build_object('method', 'visa', 'amount', 1500000, 'raw', 'vis')));
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t1, t2)), 'test');
  assert (r->>'tickets_changed')::int = 1, 'changed: tickets_changed ' || r::text;
  assert (r->>'tickets_same')::int = 1, 'changed: S3T-2 same ' || r::text;
  assert r->'changed' = '["S3T-1"]'::jsonb, 'changed: list ' || r::text;
  assert (select net from ops_ticket_lines where ticket_id = v_tid and line_no = 1) = 900000, 'changed: net updated';
  assert (select seller from ops_tickets where ticket_id = v_tid) = 'S3T Rep', 'changed: seller';
  assert (select seller_raw from ops_tickets where ticket_id = v_tid) = 'S3T Rep', 'changed: seller_raw';
  assert (select updated_at from ops_tickets where ticket_id = v_tid) > past, 'changed: updated_at moved';
  assert (select count(*) from ops_ticket_lines where ticket_id = v_tid) = 3, 'changed: 3 lines';
  assert (select count(*) from ops_ticket_payments where ticket_id = v_tid) = 1, 'changed: exactly one payment';
  assert (select method from ops_ticket_payments where ticket_id = v_tid) = 'visa', 'changed: payment is visa';

  -- a stored line without a piece that is absent from the payload is deleted
  t1 := jsonb_set(t1, '{lines}', (t1->'lines') - 2);
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t1)), 'test');
  assert (select count(*) from ops_ticket_lines where ticket_id = v_tid) = 2, 'absent unsold line deleted';

  -- sale after last sighting (brand spelling and spaces differ)
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(jsonb_build_object(
         'ticket_no', 'S3T-3', 'sold_at', current_date::text, 'seller_raw', 'S3T Rep', 'client_raw', null, 'note', null,
         'source_file', 'S3T-sales.xlsx', 'payments', '[]'::jsonb,
         'lines', jsonb_build_array(l || jsonb_build_object('brand_raw', 'BVLGARI', 'serial_raw', ' s3t-ser-1 '))))), 'test');
  select l.line_id into v_line from ops_ticket_lines l join ops_tickets t using (ticket_id) where t.ticket_no = 'S3T-3';
  assert (r->>'pieces_sold')::int = 1, 'after sighting: pieces_sold ' || r::text;
  assert (select state from ops_pieces where piece_id = p1) = 'sold', 'after sighting: piece sold';
  assert (select sold_line_id from ops_pieces where piece_id = p1) = v_line, 'after sighting: sold_line_id';
  assert (select piece_id from ops_ticket_lines where line_id = v_line) = p1, 'after sighting: line piece_id';
  assert (select count(*) from ops_piece_events where piece_id = p1 and reason = 'sold') = 1, 'after sighting: one sold event';

  -- sale before last sighting
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(jsonb_build_object(
         'ticket_no', 'S3T-4', 'sold_at', (current_date - 30)::text, 'seller_raw', 'S3T Rep', 'client_raw', null, 'note', null,
         'source_file', 'S3T-sales.xlsx', 'payments', '[]'::jsonb,
         'lines', jsonb_build_array(l || jsonb_build_object('serial_raw', 'S3T-SER-2'))))), 'test');
  assert (r->>'pieces_sold')::int = 0, 'before sighting: pieces_sold ' || r::text;
  assert (select state from ops_pieces where piece_id = p2) = 'in_stock', 'before sighting: piece in stock';
  assert (select l.piece_id from ops_ticket_lines l join ops_tickets t using (ticket_id) where t.ticket_no = 'S3T-4') is null,
         'before sighting: line has no piece';
  assert not exists (select 1 from ops_review where piece_id = p2), 'before sighting: no review';

  -- in-transit piece never sighted
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(jsonb_build_object(
         'ticket_no', 'S3T-5', 'sold_at', current_date::text, 'seller_raw', 'S3T Rep', 'client_raw', null, 'note', null,
         'source_file', 'S3T-sales.xlsx', 'payments', '[]'::jsonb,
         'lines', jsonb_build_array(l || jsonb_build_object('serial_raw', 'S3T-SER-3'))))), 'test');
  assert (select state from ops_pieces where piece_id = p3) = 'in_transit', 'in transit: untouched';
  assert (select l.piece_id from ops_ticket_lines l join ops_tickets t using (ticket_id) where t.ticket_no = 'S3T-5') is null,
         'in transit: line has no piece';
  assert not exists (select 1 from ops_piece_events where piece_id = p3), 'in transit: no event';

  -- serial changed on a selling line: line kept, piece stays sold, one conflict review, not repeated
  for i in 1..2 loop
    r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(jsonb_build_object(
           'ticket_no', 'S3T-3', 'sold_at', current_date::text, 'seller_raw', 'S3T Rep', 'client_raw', null, 'note', null,
           'source_file', 'S3T-sales.xlsx', 'payments', '[]'::jsonb,
           'lines', jsonb_build_array(l || jsonb_build_object('brand_raw', 'BVLGARI', 'serial_raw', 'S3T-SER-9'))))), 'test');
    assert (select state from ops_pieces where piece_id = p1) = 'sold', 'serial changed: piece stays sold';
    assert (select sold_line_id from ops_pieces where piece_id = p1) = v_line, 'serial changed: sold_line_id kept';
    assert (select serial_raw from ops_ticket_lines where line_id = v_line) = ' s3t-ser-1 ', 'serial changed: old serial kept';
    assert (select piece_id from ops_ticket_lines where line_id = v_line) = p1, 'serial changed: line keeps piece';
    assert (select count(*) from ops_review where piece_id = p1 and kind = 'ticket_conflict') = 1,
           'serial changed: exactly one conflict review (round ' || i || ')';
    assert (select status from ops_review where piece_id = p1 and kind = 'ticket_conflict') = 'open', 'serial changed: review open';
  end loop;

  -- a selling line that disappears from the payload is kept and raises a conflict
  ln := l || jsonb_build_object('serial_raw', 'S3T-SER-4');
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(jsonb_build_object(
         'ticket_no', 'S3T-6', 'sold_at', current_date::text, 'seller_raw', 'S3T Rep', 'client_raw', null, 'note', null,
         'source_file', 'S3T-sales.xlsx', 'payments', '[]'::jsonb, 'lines', jsonb_build_array(ln)))), 'test');
  assert (select state from ops_pieces where piece_id = p4) = 'sold', 'vanished line: piece sold first';
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(jsonb_build_object(
         'ticket_no', 'S3T-6', 'sold_at', current_date::text, 'seller_raw', 'S3T Rep', 'client_raw', null, 'note', null,
         'source_file', 'S3T-sales.xlsx', 'payments', '[]'::jsonb,
         'lines', jsonb_build_array(l || jsonb_build_object('line_no', 2))))), 'test');
  select ticket_id into v_tid from ops_tickets where ticket_no = 'S3T-6';
  assert (select count(*) from ops_ticket_lines where ticket_id = v_tid) = 2, 'vanished line: kept, new line added';
  assert (select piece_id from ops_ticket_lines where ticket_id = v_tid and line_no = 1) = p4, 'vanished line: keeps piece';
  assert (select state from ops_pieces where piece_id = p4) = 'sold', 'vanished line: piece stays sold';
  assert (select count(*) from ops_review where piece_id = p4 and kind = 'ticket_conflict' and status = 'open') = 1,
         'vanished line: conflict review';

  -- mixed sellers: the ticket takes line 1's seller and is listed
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(jsonb_build_object(
         'ticket_no', 'S3T-7', 'sold_at', current_date::text, 'seller_raw', 'S3T Продавец', 'client_raw', null, 'note', null,
         'source_file', 'S3T-sales.xlsx', 'payments', '[]'::jsonb,
         'lines', jsonb_build_array(l || jsonb_build_object('seller_raw', 'S3T Продавец'),
                                    l || jsonb_build_object('line_no', 2, 'seller_raw', 'S3T Other'))))), 'test');
  assert (select seller from ops_tickets where ticket_no = 'S3T-7') = 'S3T Rep', 'mixed: seller from line 1';
  assert (r->'mixed_sellers') ? 'S3T-7', 'mixed: listed ' || r::text;

  select count(*) into n_tickets from ops_tickets where ticket_no like 'S3T-%' and store_id = 1 and source = 'colibri';
  assert n_tickets = 7, 'all tickets stored in store 1 / colibri';
end $$;
select 's3_t1 ok' as result;
rollback;
