-- Sprint 2, Task 3: stock sync after a catalogue load. Rolled back.
begin;
do $$
declare r jsonb; run bigint; s text; p uuid; t_serial text; t_variant text; t_piece uuid; n_ev int; s2 text; rv bigint;
begin
  perform ops_initial_fill('Alex');
  select max(id) into run from cat_import_runs;

  -- idempotent: a sync right after the fill, and again, changes nothing but refresh
  r := ops_sync_pieces(run);
  n_ev := (select count(*) from ops_piece_events);
  r := ops_sync_pieces(run);
  assert (r->>'arrived')::int = 0 and (r->>'in_transit')::int = 0 and (r->>'review_raised')::int = 0
     and (r->>'review_closed')::int = 0, format('idempotent counts %s', r);
  assert (r->>'refreshed')::int = (select count(*) from ops_pieces where state <> 'sold'), format('refreshed %s', r);
  assert (select count(*) from ops_piece_events) = n_ev, 'no new events on re-sync';
  assert (select count(*) from ops_review) = 0, 'no reviews on re-sync';

  -- missing: raised once, state unchanged, no duplicate
  select serial into s from cat_pieces order by serial limit 1;
  select piece_id into p from ops_pieces where upper(btrim(serial)) = upper(btrim(s)) and state <> 'sold';
  create temp table t3_saved on commit drop as select * from cat_pieces where serial = s;
  delete from cat_pieces where serial = s;
  r := ops_sync_pieces(run);
  assert (r->>'review_raised')::int = 1, format('missing raised %s', r);
  assert (select state from ops_pieces where piece_id = p) = 'in_stock', 'missing keeps state';
  r := ops_sync_pieces(run);
  assert (r->>'review_raised')::int = 0, format('no duplicate review %s', r);
  assert (select count(*) from ops_review where piece_id = p and status = 'open') = 1, 'one open review';
  assert (select raised_run from ops_review where piece_id = p) = run, 'raised_run set';

  -- back: auto-closed
  insert into cat_pieces select * from t3_saved;
  r := ops_sync_pieces(run);
  assert (r->>'review_closed')::int = 1, format('back closed %s', r);
  assert (select status from ops_review where piece_id = p) = 'auto_closed', 'review auto_closed';

  -- trailing space and lower case: same piece
  update cat_pieces set serial = lower(serial) || ' ' where serial = s;
  r := ops_sync_pieces(run);
  assert (r->>'arrived')::int = 0 and (r->>'review_raised')::int = 0 and (r->>'in_transit')::int = 0,
         format('trailing space %s', r);
  assert (select count(*) from ops_pieces where upper(btrim(serial)) = upper(btrim(s))) = 1, 'still one piece';

  -- manual state survives reload
  perform ops_set_state(p, 'booked_out', 'Alex');
  r := ops_sync_pieces(run);
  assert (select state from ops_pieces where piece_id = p) = 'booked_out', 'booked_out survives sync';
  perform ops_set_state(p, 'in_stock', 'Alex');

  -- stock beats transit: a serial in both lists stays one in-stock piece
  select serial into s2 from cat_pieces where serial <> lower(s) || ' ' order by serial desc limit 1;
  insert into cat_incoming(serial, variant_id, model_id, source)
  select c.serial, c.variant_id, v.model_id, 's2 test' from cat_pieces c join cat_variants v using (variant_id) where c.serial = s2;
  r := ops_sync_pieces(run);
  assert (select count(*) from ops_pieces where upper(btrim(serial)) = upper(btrim(s2))) = 1, 'one piece for dual serial';
  assert (select state from ops_pieces where upper(btrim(serial)) = upper(btrim(s2))) = 'in_stock', 'dual serial in stock';
  assert (r->>'in_transit')::int = 0, format('dual serial not new transit %s', r);

  -- arrival: an in-transit piece shows up in stock
  select piece_id, serial, variant_id into t_piece, t_serial, t_variant
    from ops_pieces where state = 'in_transit' and variant_id is not null order by serial limit 1;
  insert into cat_pieces(serial, variant_id, import_run) values (t_serial, t_variant, run);
  r := ops_sync_pieces(run);
  assert (r->>'arrived')::int = 1, format('arrival %s', r);
  assert (select state from ops_pieces where piece_id = t_piece) = 'in_stock', 'arrived in stock';
  assert (select reason from ops_piece_events where piece_id = t_piece order by event_id desc limit 1) = 'arrived', 'arrived event';
  assert (select count(*) from ops_pieces where upper(btrim(serial)) = upper(btrim(t_serial))) = 1, 'arrival keeps one piece';

  -- overdue in transit (Alex, 11 Nov): shipped > 60 days ago → review once
  select piece_id, serial into t_piece, t_serial from ops_pieces where state = 'in_transit' order by serial limit 1;
  update cat_incoming set shipped_on = current_date - 61 where upper(btrim(serial)) = upper(btrim(t_serial));
  r := ops_sync_pieces(run);
  assert (r->>'review_raised')::int = 1, format('overdue raised %s', r);
  assert (select shipped_on from ops_pieces where piece_id = t_piece) = current_date - 61, 'shipped_on copied';
  r := ops_sync_pieces(run);
  assert (r->>'review_raised')::int = 0, format('overdue no duplicate %s', r);
  select review_id into rv from ops_review where piece_id = t_piece and kind = 'overdue_in_transit' and status = 'open';
  assert rv is not null, 'overdue review open';
  begin perform ops_resolve_review(rv, 'damaged', 'Alex'); raise exception 'damaged on transit allowed';
  exception when others then if sqlerrm not like '%is not allowed%' then raise; end if; end;
  -- still coming: piece stays in transit, not re-flagged within 60 days of the answer
  perform ops_resolve_review(rv, 'still_in_transit', 'Alex');
  assert (select state from ops_pieces where piece_id = t_piece) = 'in_transit', 'still in transit';
  r := ops_sync_pieces(run);
  assert (r->>'review_raised')::int = 0, format('snoozed %s', r);

  -- dropped from the incoming list without arriving → review straight away
  select piece_id, serial into t_piece, t_serial from ops_pieces
   where state = 'in_transit' and variant_id in (select variant_id from cat_variants) order by serial desc limit 1;
  delete from cat_incoming where upper(btrim(serial)) = upper(btrim(t_serial));
  r := ops_sync_pieces(run);
  assert (r->>'review_raised')::int = 1, format('dropped raised %s', r);
  select review_id into rv from ops_review where piece_id = t_piece and kind = 'dropped_from_incoming' and status = 'open';
  assert rv is not null, 'dropped review open';
  r := ops_sync_pieces(run);
  assert (r->>'review_raised')::int = 0, format('dropped no duplicate %s', r);
  -- not delivered: final state, never typed in by hand
  begin perform ops_set_state(t_piece, 'not_received', 'Alex'); raise exception 'manual not_received allowed';
  exception when others then if sqlerrm not like '%is not allowed%' then raise; end if; end;
  perform ops_resolve_review(rv, 'not_delivered', 'Alex', 'short shipment');
  assert (select state from ops_pieces where piece_id = t_piece) = 'not_received', 'not_received';
  assert (select to_state from ops_piece_events where piece_id = t_piece order by event_id desc limit 1) = 'not_received', 'not_received event';
  r := ops_sync_pieces(run);
  assert (r->>'review_raised')::int = 0, format('not_received not flagged %s', r);

  -- the same serial turns up later: new piece, flagged as reused
  insert into cat_pieces(serial, variant_id, import_run)
  select t_serial, variant_id, run from ops_pieces where piece_id = t_piece;
  r := ops_sync_pieces(run);
  assert (select count(*) from ops_pieces where upper(btrim(serial)) = upper(btrim(t_serial))) = 2, 'second piece for reused serial';
  assert (select count(*) from ops_review r2 join ops_pieces o using (piece_id)
           where upper(btrim(o.serial)) = upper(btrim(t_serial)) and r2.kind = 'serial_reused') = 1, 'serial_reused review';
end $$;
select 's2_t3 ok' as result;
rollback;
