-- S3 polish, Task 3: loader reports cleared CRM links, remaps and ambiguous pieces; a selling ticket moved to an earlier
-- date raises a review; a kept sold line reloads quietly while any conflict review is open on its piece; the refund and
-- sale→refund guards. Synthetic data only. Rolled back.
begin;
do $$
declare
  run bigint; p3 uuid; p4 uuid; p5a uuid; p5b uuid; p6 uuid; p7 uuid; r jsonb; l jsonb; t jsonb;
  v_tid uuid; v_line uuid; v_crm bigint; pay_ids bigint[];
begin
  -- fixtures
  insert into ops_stores(store_id, code, name)
  select 1, 'S3T-STORE', 'S3T store' where not exists (select 1 from ops_stores where store_id = 1);
  insert into cat_import_runs(source_file, run_at) values ('S3T-run.xlsx', now() - interval '5 days')
  returning id into run;
  insert into ops_pieces(store_id, brand, serial, state, last_seen_run)
  values (1, 'S3T Brand', 'ZZ.00.55553', 'in_stock', run) returning piece_id into p3;
  insert into ops_pieces(store_id, brand, serial, state, last_seen_run)
  values (1, 'S3T Brand', 'ZZ.00.55554', 'in_stock', run) returning piece_id into p4;
  -- two live pieces with the same brand key and serial: allowed by the unique index only through different raw brands
  insert into ops_pieces(store_id, brand, serial, state, last_seen_run)
  values (1, 'S3T Brand', 'ZZ.00.55555', 'in_stock', run) returning piece_id into p5a;
  insert into ops_pieces(store_id, brand, serial, state, last_seen_run)
  values (1, 'S3T-BRAND', 'zz.00.55555', 'in_stock', run) returning piece_id into p5b;
  insert into ops_pieces(store_id, brand, serial, state, last_seen_run)
  values (1, 'S3T Brand', 'ZZ.00.55556', 'in_stock', run) returning piece_id into p6;
  insert into ops_pieces(store_id, brand, serial, state, last_seen_run)
  values (1, 'S3T Brand', 'ZZ.00.55557', 'in_stock', run) returning piece_id into p7;
  insert into crm_sales_reps(source_name, label) values ('S3T Rep', 'S3T Rep label');
  insert into crm_clients(client_id, record_type) values ('S3T-C1', 'client');

  -- a sale line template and a ticket template; cases override the keys they need
  l := jsonb_build_object('line_no', 1, 'kind', 'sale', 'article', 'S3T-ART-1', 'colour', null,
         'item_name', 'S3T ring', 'size', null, 'qty', 1, 'price_list', 1000000, 'price_current', 1000000,
         'discount_pct', null, 'discount_amt', null, 'net', 1000000, 'brand_raw', 'S3T Brand',
         'serial_raw', null, 'sk', null, 'vip', null);
  t := jsonb_build_object('sold_at', '2030-03-10', 'seller_raw', 'S3T Rep', 'client_raw', null, 'note', null,
         'source_file', 'S3T-sales.xlsx', 'payments', '[]'::jsonb);

  -- crm links cleared: an unsold line that vanishes is deleted, and its CRM link is counted
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t || jsonb_build_object(
         'ticket_no', 'S3T-P1', 'lines', jsonb_build_array(l, l || jsonb_build_object('line_no', 2))))), 'test');
  assert (r->>'crm_links_cleared')::int = 0, 'crm links: none on a new load ' || r::text;
  select l2.line_id into v_line from ops_ticket_lines l2 join ops_tickets t2 using (ticket_id)
   where t2.ticket_no = 'S3T-P1' and l2.line_no = 2;
  insert into crm_transactions(client_id, sold_at, article, net_uzs) values ('S3T-C1', '2030-03-10', 'S3T-ART-1', 1000000)
  returning id into v_crm;
  update crm_transactions set ticket_line_id = v_line where id = v_crm;
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t || jsonb_build_object(
         'ticket_no', 'S3T-P1', 'lines', jsonb_build_array(l)))), 'test');
  assert (r->>'tickets_changed')::int = 1, 'crm links: reload is a change ' || r::text;
  assert (r->>'crm_links_cleared')::int = 1, 'crm links: one link cleared ' || r::text;
  assert (select ticket_line_id from crm_transactions where id = v_crm) is null, 'crm links: CRM row unlinked';
  assert not exists (select 1 from ops_ticket_lines where line_id = v_line), 'crm links: line deleted';

  -- remap: a same-content reload picks up a seller alias added since the first load
  t := t || jsonb_build_object('ticket_no', 'S3T-P2', 'seller_raw', 'S3T Новый',
         'payments', jsonb_build_array(jsonb_build_object('method', 'card', 'amount', 1000000, 'raw', 'кар')),
         'lines', jsonb_build_array(l));
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t)), 'test');
  assert (r->>'remapped')::int = 0, 'remap: a new ticket is not remapped ' || r::text;
  assert (select seller from ops_tickets where ticket_no = 'S3T-P2') is null, 'remap: no alias yet, seller null';
  select array_agg(payment_id order by payment_id) into pay_ids
    from ops_ticket_payments p join ops_tickets t2 using (ticket_id) where t2.ticket_no = 'S3T-P2';
  insert into crm_rep_aliases(alias, source_name) values ('S3T Новый', 'S3T Rep');
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t)), 'test');
  assert (r->>'tickets_same')::int = 1 and (r->>'tickets_changed')::int = 0, 'remap: still same ' || r::text;
  assert (r->>'remapped')::int = 1, 'remap: remapped 1 ' || r::text;
  assert (select seller from ops_tickets where ticket_no = 'S3T-P2') = 'S3T Rep', 'remap: seller now mapped';
  assert (select array_agg(payment_id order by payment_id)
            from ops_ticket_payments p join ops_tickets t2 using (ticket_id) where t2.ticket_no = 'S3T-P2') = pay_ids,
         'remap: payments untouched';

  -- reload is quiet: nothing left to remap
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t)), 'test');
  assert (r->>'tickets_same')::int = 1, 'quiet: same ' || r::text;
  assert (r->>'remapped')::int = 0, 'quiet: remapped 0 ' || r::text;
  assert r->'changed' = '[]'::jsonb, 'quiet: changed empty ' || r::text;

  -- date moved earlier on a ticket that sold a piece: review, date still updated, piece stays sold
  t := t || jsonb_build_object('ticket_no', 'S3T-P3', 'seller_raw', 'S3T Rep', 'payments', '[]'::jsonb,
         'lines', jsonb_build_array(l || jsonb_build_object('serial_raw', 'ZZ.00.55553')));
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t)), 'test');
  assert (select state from ops_pieces where piece_id = p3) = 'sold', 'date moved: piece sold first ' || r::text;
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t || jsonb_build_object('sold_at', '2030-03-01'))),
         'test');
  assert (r->>'tickets_changed')::int = 1, 'date moved: change ' || r::text;
  assert (select count(*) from ops_review where piece_id = p3 and kind = 'ticket_conflict' and status = 'open') = 1,
         'date moved: one open conflict review';
  assert (select note from ops_review where piece_id = p3 and kind = 'ticket_conflict' and status = 'open')
         like '%date moved from 2030-03-10 to 2030-03-01%', 'date moved: note';
  assert (select sold_at from ops_tickets where ticket_no = 'S3T-P3') = date '2030-03-01', 'date moved: date updated';
  assert (select state from ops_pieces where piece_id = p3) = 'sold', 'date moved: piece stays sold';

  -- a date moved later raises nothing
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t || jsonb_build_object('sold_at', '2030-03-05'))),
         'test');
  assert (select count(*) from ops_review where piece_id = p3) = 1, 'date later: no further review';

  -- kept sold line while another conflict review is open on its piece: the guard blocks its own review, and the
  -- reload after the change counts as same
  t := t || jsonb_build_object('ticket_no', 'S3T-P4', 'sold_at', '2030-03-10',
         'lines', jsonb_build_array(l || jsonb_build_object('serial_raw', 'ZZ.00.55554')));
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t)), 'test');
  assert (select state from ops_pieces where piece_id = p4) = 'sold', 'other review: piece sold first ' || r::text;
  insert into ops_review(piece_id, kind, note) values (p4, 'ticket_conflict', 'S3T other');
  -- the change also adds a line: a serial change alone on a line kept under an open review already reloads as same
  t := t || jsonb_build_object('lines', jsonb_build_array(l || jsonb_build_object('serial_raw', 'ZZ.00.99999'),
                                                          l || jsonb_build_object('line_no', 2)));
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t)), 'test');
  assert (r->>'tickets_changed')::int = 1, 'other review: first reload is a change ' || r::text;
  assert (select count(*) from ops_review where piece_id = p4) = 1, 'other review: no second review (guard)';
  assert (select serial_raw from ops_ticket_lines l2 join ops_tickets t2 using (ticket_id)
           where t2.ticket_no = 'S3T-P4' and l2.line_no = 1) = 'ZZ.00.55554', 'other review: sold line kept';
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t)), 'test');
  assert (r->>'tickets_same')::int = 1, 'other review: reload same ' || r::text;
  assert r->'changed' = '[]'::jsonb, 'other review: changed empty ' || r::text;

  -- ambiguous: two candidate pieces, nothing sold, ticket listed once
  t := t || jsonb_build_object('ticket_no', 'S3T-P5',
         'lines', jsonb_build_array(l || jsonb_build_object('serial_raw', 'ZZ.00.55555'),
                                    l || jsonb_build_object('line_no', 2, 'serial_raw', 'zz.00.55555')));
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t)), 'test');
  assert r->'pieces_ambiguous' = '["S3T-P5"]'::jsonb, 'ambiguous: listed once ' || r::text;
  assert (r->>'pieces_sold')::int = 0, 'ambiguous: nothing sold ' || r::text;
  assert (select state from ops_pieces where piece_id = p5a) = 'in_stock'
         and (select state from ops_pieces where piece_id = p5b) = 'in_stock', 'ambiguous: both pieces in stock';
  assert (select count(*) from ops_ticket_lines l2 join ops_tickets t2 using (ticket_id)
           where t2.ticket_no = 'S3T-P5' and l2.piece_id is null) = 2, 'ambiguous: lines have no piece';

  -- refund guard (item 13): a refund line never takes a piece
  t := t || jsonb_build_object('ticket_no', 'S3T-P6',
         'lines', jsonb_build_array(l || jsonb_build_object('kind', 'refund', 'serial_raw', 'ZZ.00.55556')));
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t)), 'test');
  assert (select state from ops_pieces where piece_id = p6) = 'in_stock', 'refund: piece stays in stock ' || r::text;
  assert (select l2.piece_id from ops_ticket_lines l2 join ops_tickets t2 using (ticket_id) where t2.ticket_no = 'S3T-P6')
         is null, 'refund: line has no piece';
  assert not exists (select 1 from ops_review where piece_id = p6), 'refund: no review';

  -- kind flip (item 14): a selling line that turns into a refund is kept as a sale and raises a review
  t := t || jsonb_build_object('ticket_no', 'S3T-P7',
         'lines', jsonb_build_array(l || jsonb_build_object('serial_raw', 'ZZ.00.55557')));
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t)), 'test');
  assert (select state from ops_pieces where piece_id = p7) = 'sold', 'kind flip: piece sold first ' || r::text;
  t := t || jsonb_build_object('lines', jsonb_build_array(l || jsonb_build_object('kind', 'refund', 'serial_raw', 'ZZ.00.55557')));
  r := ops_load_tickets(jsonb_build_object('tickets', jsonb_build_array(t)), 'test');
  assert (select state from ops_pieces where piece_id = p7) = 'sold', 'kind flip: piece stays sold';
  assert (select count(*) from ops_review where piece_id = p7 and kind = 'ticket_conflict' and status = 'open'
            and note like '%(refund)') = 1, 'kind flip: open conflict review ending (refund)';
  assert (select l2.kind from ops_ticket_lines l2 join ops_tickets t2 using (ticket_id)
           where t2.ticket_no = 'S3T-P7' and l2.line_no = 1) = 'sale', 'kind flip: stored line stays a sale';
end $$;
select 's3_t5 ok' as result;
rollback;
