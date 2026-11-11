-- Sprint 2, Task 4: sales history protected, tickets applied to pieces. Rolled back.
begin;
do $$
declare run bigint; c text; p uuid; t1 uuid; t2 uuid; l1 uuid; l2 uuid; n_ev int; s text; other_variant text;
begin
  perform ops_initial_fill('Alex');
  select max(id) into run from cat_import_runs;

  -- T6: a client with purchases cannot be hard-deleted (pick one with no other linked rows, so only
  --     the sales link can block it)
  select t.client_id into c from crm_transactions t
   where not exists (select 1 from crm_contacts x where x.client_id = t.client_id)
     and not exists (select 1 from crm_personal x where x.client_id = t.client_id)
     and not exists (select 1 from crm_important_dates x where x.client_id = t.client_id)
     and not exists (select 1 from crm_missed_demand x where x.client_id = t.client_id)
     and not exists (select 1 from crm_telegram_chats x where x.client_id = t.client_id)
     and not exists (select 1 from crm_clients x where x.merged_into = t.client_id)
   limit 1;
  assert c is not null, 'test needs a client with purchases and nothing else linked';
  begin
    delete from crm_clients where client_id = c;
    raise exception 'client with purchases was deleted';
  exception when foreign_key_violation then null;
  end;
  assert exists (select 1 from information_schema.columns
                  where table_name = 'crm_transactions' and column_name = 'ticket_line_id'), 'ticket_line_id column';

  -- T5: a sale line marks the piece sold, once
  select piece_id, serial into p, s from ops_pieces where state = 'in_stock' order by serial limit 1;
  insert into ops_tickets(store_id, source, ticket_no, sold_at) values (1, 'colibri', 'TEST-1', current_date)
  returning ticket_id into t1;
  insert into ops_ticket_lines(ticket_id, line_no, kind, piece_id, serial_raw) values (t1, 1, 'sale', p, s)
  returning line_id into l1;
  insert into ops_review(piece_id, kind) values (p, 'missing_from_export');
  perform ops_apply_ticket_line(l1, 'system');
  assert (select state from ops_pieces where piece_id = p) = 'sold', 'sold';
  assert (select sold_line_id from ops_pieces where piece_id = p) = l1, 'sold_line_id';
  assert (select count(*) from ops_piece_events where piece_id = p and reason = 'sold') = 1, 'one sold event';
  assert (select ref_kind from ops_piece_events where piece_id = p and reason = 'sold') = 'ticket_line', 'ref ticket_line';
  assert (select count(*) from ops_review where piece_id = p and status = 'open') = 0, 'reviews auto-closed on sale';
  n_ev := (select count(*) from ops_piece_events where piece_id = p);
  perform ops_apply_ticket_line(l1, 'system');
  assert (select count(*) from ops_piece_events where piece_id = p) = n_ev, 'second apply adds nothing';

  -- duplicate ticket number per store and source
  begin
    insert into ops_tickets(store_id, source, ticket_no, sold_at) values (1, 'colibri', 'TEST-1', current_date);
    raise exception 'duplicate ticket accepted';
  exception when unique_violation then null;
  end;
  insert into ops_tickets(store_id, source, ticket_no, sold_at) values (1, 'delardi', 'TEST-1', current_date)
  returning ticket_id into t2;

  -- refund on the second ticket puts the piece back in stock
  insert into ops_ticket_lines(ticket_id, line_no, kind, piece_id, serial_raw) values (t2, 1, 'refund', p, s)
  returning line_id into l2;
  perform ops_apply_ticket_line(l2, 'system');
  assert (select state from ops_pieces where piece_id = p) = 'in_stock', 'refunded to stock';
  assert (select sold_line_id from ops_pieces where piece_id = p) is null, 'sold_line_id cleared';
  assert (select reason from ops_piece_events where piece_id = p order by event_id desc limit 1) = 'refunded', 'refunded event';
  n_ev := (select count(*) from ops_piece_events where piece_id = p);
  perform ops_apply_ticket_line(l2, 'system');
  assert (select count(*) from ops_piece_events where piece_id = p) = n_ev, 'second refund apply adds nothing';

  -- serial reused after sale: sell a second piece, then the export shows its serial on another variant
  select piece_id, serial into p, s from ops_pieces where state = 'in_stock' order by serial desc limit 1;
  insert into ops_ticket_lines(ticket_id, line_no, kind, piece_id, serial_raw) values (t1, 2, 'sale', p, s)
  returning line_id into l1;
  perform ops_apply_ticket_line(l1, 'system');
  select v2.variant_id into other_variant
    from ops_pieces o
    join cat_variants v1 on v1.variant_id = o.variant_id
    join cat_models m1 on m1.model_id = v1.model_id
    join cat_models m2 on m2.brand = m1.brand
    join cat_variants v2 on v2.model_id = m2.model_id and v2.variant_id <> o.variant_id
   where o.piece_id = p limit 1;
  assert other_variant is not null, 'test needs a second variant of the same brand';
  update cat_pieces set variant_id = other_variant where upper(btrim(serial)) = upper(btrim(s));
  perform ops_sync_pieces(run);
  assert (select state from ops_pieces where piece_id = p) = 'sold', 'sold piece stays sold';
  assert (select count(*) from ops_pieces where upper(btrim(serial)) = upper(btrim(s)) and state = 'in_stock') = 1, 'new in-stock piece';
  assert (select count(*) from ops_review r join ops_pieces o using (piece_id)
           where upper(btrim(o.serial)) = upper(btrim(s)) and r.kind = 'serial_reused' and r.status = 'open') = 1,
         'serial_reused review';

  -- conflicts are flagged, not failed: a second sale of the sold piece, and a refund while the serial is live again
  insert into ops_ticket_lines(ticket_id, line_no, kind, piece_id, serial_raw) values (t2, 2, 'sale', p, s)
  returning line_id into l2;
  perform ops_apply_ticket_line(l2, 'system');
  assert (select sold_line_id from ops_pieces where piece_id = p) = l1, 'first sale stands';
  assert (select count(*) from ops_review where piece_id = p and kind = 'ticket_conflict' and status = 'open') = 1, 'sale conflict flagged';
  update ops_review set status = 'resolved' where piece_id = p and kind = 'ticket_conflict';
  insert into ops_ticket_lines(ticket_id, line_no, kind, piece_id, serial_raw) values (t2, 3, 'refund', p, s)
  returning line_id into l2;
  perform ops_apply_ticket_line(l2, 'system');
  assert (select state from ops_pieces where piece_id = p) = 'sold', 'refund blocked by live twin';
  assert (select count(*) from ops_review where piece_id = p and kind = 'ticket_conflict' and status = 'open') = 1, 'refund conflict flagged';
end $$;
select 's2_t4 ok' as result;
rollback;
