-- Sprint 2, Task 2: initial fill, manage-stock right, manual states, review resolution. Rolled back.
begin;
do $$
declare r jsonb; p uuid; c text; rv bigint; n_ev int;
  expect_stock int := (select count(*) from cat_pieces);
  expect_transit int := (select count(*) from cat_incoming i
                          where not exists (select 1 from cat_pieces s where upper(btrim(s.serial)) = upper(btrim(i.serial))));
begin
  -- initial fill
  r := ops_initial_fill('Alex');
  assert (r->>'in_stock')::int = expect_stock, format('in_stock %s <> %s', r->>'in_stock', expect_stock);
  assert (r->>'in_transit')::int = expect_transit, format('in_transit %s <> %s', r->>'in_transit', expect_transit);
  assert (select count(*) from ops_piece_events where reason = 'initial_load') = expect_stock + expect_transit, 'one event per piece';
  assert (select count(*) from ops_pieces where brand is null or brand = '') = 0, 'every piece has a brand';
  begin perform ops_initial_fill('Alex'); raise exception 'second fill allowed';
  exception when others then if sqlerrm not like '%initial fill already done%' then raise; end if; end;

  select piece_id into p from ops_pieces where state = 'in_stock' order by serial limit 1;
  select client_id into c from crm_clients where record_state <> 'deleted' order by client_id limit 1;

  -- rights: someone without the right, an unknown name, an inactive holder
  begin perform ops_set_state(p, 'reserved', 'Karina'); raise exception 'no-right user allowed';
  exception when others then if sqlerrm not like '%lacks manage stock%' then raise; end if; end;
  begin perform ops_set_state(p, 'reserved', 'Nobody'); raise exception 'unknown user allowed';
  exception when others then if sqlerrm not like '%lacks manage stock%' then raise; end if; end;
  update board_users set active = false where name = 'Alex';
  begin perform ops_set_state(p, 'reserved', 'Alex'); raise exception 'inactive user allowed';
  exception when others then if sqlerrm not like '%lacks manage stock%' then raise; end if; end;
  update board_users set active = true where name = 'Alex';

  -- reserve, then release
  n_ev := (select count(*) from ops_piece_events where piece_id = p);
  perform ops_set_state(p, 'reserved', 'Alex', 'test', c, current_date + 3);
  assert (select state from ops_pieces where piece_id = p) = 'reserved', 'reserved';
  assert (select hold_client_id from ops_pieces where piece_id = p) = c, 'hold client set';
  assert (select hold_until from ops_pieces where piece_id = p) = current_date + 3, 'hold until set';
  assert (select count(*) from ops_piece_events where piece_id = p) = n_ev + 1, 'one event';
  assert (select reason from ops_piece_events where piece_id = p order by event_id desc limit 1) = 'reserved', 'reason reserved';
  begin perform ops_set_state(p, 'booked_out', 'Alex'); raise exception 'reserved -> booked_out allowed';
  exception when others then if sqlerrm not like '%is not allowed%' then raise; end if; end;
  begin perform ops_set_state(p, 'sold', 'Alex'); raise exception 'manual sold allowed';
  exception when others then if sqlerrm not like '%is not allowed%' then raise; end if; end;
  perform ops_set_state(p, 'in_stock', 'Alex');
  assert (select hold_client_id is null and hold_until is null from ops_pieces where piece_id = p), 'hold cleared';
  assert (select reason from ops_piece_events where piece_id = p order by event_id desc limit 1) = 'released', 'reason released';

  -- booked out and back, damaged and back
  perform ops_set_state(p, 'booked_out', 'Alex', 'shoot', null, current_date + 7);
  perform ops_set_state(p, 'in_stock', 'Alex');
  assert (select reason from ops_piece_events where piece_id = p order by event_id desc limit 1) = 'returned_from_loan', 'reason returned_from_loan';
  perform ops_set_state(p, 'damaged', 'Alex');
  perform ops_set_state(p, 'in_stock', 'Alex');
  assert (select reason from ops_piece_events where piece_id = p order by event_id desc limit 1) = 'repaired', 'reason repaired';

  -- review resolution
  insert into ops_review(piece_id, kind) values (p, 'missing_from_export') returning review_id into rv;
  begin perform ops_resolve_review(rv, 'damaged', 'Karina'); raise exception 'no-right resolve allowed';
  exception when others then if sqlerrm not like '%lacks manage stock%' then raise; end if; end;
  begin perform ops_resolve_review(rv, 'sold', 'Alex'); raise exception 'resolve as sold on unsold piece allowed';
  exception when others then if sqlerrm not like '%is not allowed%' then raise; end if; end;
  perform ops_resolve_review(rv, 'damaged', 'Alex', 'scratched');
  assert (select state from ops_pieces where piece_id = p) = 'damaged', 'review applied state';
  assert (select status = 'resolved' and resolution = 'damaged' and resolved_by = 'Alex' from ops_review where review_id = rv), 'review closed';
  assert (select reason from ops_piece_events where piece_id = p order by event_id desc limit 1) = 'review_resolved', 'reason review_resolved';
end $$;
select 's2_t2 ok' as result;
rollback;
