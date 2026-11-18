-- Stock enrichment, slice 4: Training mode (made-up pieces in two made-up stores) and transfers. Rolled back.
begin;
do $$
declare r jsonb; d jsonb; x jsonb; v_a uuid; v_b uuid; n_real int; n_ev int; f text;
begin
  select count(*) into n_real from ops_pieces;
  select count(*) into n_ev from ops_piece_events;

  -- the seeded set: two stores, twelve pieces, all in stock, none of them a real piece
  assert (select count(*) from stk_train_stores) = 2, 'two training stores';
  r := stk_train_list('{}'::jsonb);
  assert (r->>'count')::int = 12 and jsonb_array_length(r->'rows') = 12, 'twelve pieces: ' || (r->>'count');
  assert r->'totals' = jsonb_build_array(jsonb_build_object('state', 'in_stock', 'pieces', 12,
           'value', (select sum(price_uzs) from stk_train_pieces), 'unpriced', 0)), 'totals: ' || (r->'totals')::text;
  x := r->'rows'->0;
  assert x ? 'piece_id' and x ? 'serial' and x ? 'barcode' and x ? 'brand' and x ? 'article' and x ? 'model_name' and x ? 'category'
     and x ? 'state' and x ? 'state_since' and x ? 'price_uzs' and x->>'store' is not null and x ? 'to_store', 'row shape: ' || x::text;
  assert not exists (select 1 from stk_train_pieces t join ops_pieces o on upper(o.serial) = upper(t.serial)), 'no training serial is a real serial';
  assert (stk_train_list('{"store":"TRN-B"}'::jsonb)->>'count')::int = 4 and (stk_train_list('{"store":"TRN-A"}'::jsonb)->>'count')::int = 8, 'store filter';
  assert (stk_train_list('{"q":"trn-0003"}'::jsonb)->>'count')::int = 1, 'search by serial';
  r := stk_train_facets();
  assert jsonb_array_length(r->'brands') >= 2 and jsonb_array_length(r->'categories') >= 2
     and r->'stores' = '[{"code":"TRN-A","name":"Training store A"},{"code":"TRN-B","name":"Training store B"}]'::jsonb, 'facets: ' || r::text;

  select piece_id into v_a from stk_train_pieces where serial = 'TRN-0001';
  select piece_id into v_b from stk_train_pieces where serial = 'TRN-0002';
  d := stk_train_piece(v_a);
  assert d->'piece'->>'serial' = 'TRN-0001' and d->'piece'->>'store' = 'Training store A' and d->'piece'->>'store_code' = 'TRN-A'
     and jsonb_array_length(d->'events') = 1 and d->'reviews' = '[]'::jsonb and d->'sales' = '[]'::jsonb and d ? 'model', 'detail: ' || d::text;
  assert stk_train_piece(gen_random_uuid()) is null, 'unknown piece is null';

  -- rights: a viewer changes nothing
  insert into board_users(name, passcode_hash, can_view_stock) values ('T5 Viewer', 'not-a-real-hash-t5', true);
  begin perform stk_train_set_state(v_a, 'reserved', 'T5 Viewer'); assert false, 'viewer may reserve'; exception when raise_exception then null; end;
  begin perform stk_train_send(v_a, 'TRN-B', 'T5 Viewer', null); assert false, 'viewer may send'; exception when raise_exception then null; end;
  begin perform stk_train_reset('T5 Viewer'); assert false, 'viewer may reset'; exception when raise_exception then null; end;

  -- the four state changes, as on real pieces
  perform stk_train_set_state(v_a, 'reserved', 'Alex', 'Hold for Monday', 'DLD-TEST', '2026-12-01');
  d := stk_train_piece(v_a);
  assert d->'piece'->>'state' = 'reserved' and d->'piece'->>'hold_client_id' = 'DLD-TEST' and d->'piece'->>'hold_until' = '2026-12-01'
     and d->'piece'->>'state_note' = 'Hold for Monday' and d->'events'->0->>'reason' = 'reserved' and d->'events'->0->>'actor' = 'Alex', 'reserved: ' || d::text;
  begin perform stk_train_set_state(v_a, 'damaged', 'Alex', 'x'); assert false, 'reserved → damaged allowed'; exception when raise_exception then null; end;
  begin perform stk_train_send(v_a, 'TRN-B', 'Alex', null); assert false, 'a reserved piece was sent'; exception when raise_exception then null; end;
  perform stk_train_set_state(v_a, 'in_stock', 'Alex');
  d := stk_train_piece(v_a);
  assert d->'piece'->>'state' = 'in_stock' and d->'piece'->>'hold_client_id' is null and d->'piece'->>'state_note' is null
     and d->'events'->0->>'reason' = 'released', 'released: ' || d::text;
  perform stk_train_set_state(v_b, 'damaged', 'Alex', 'Clasp bent');
  assert stk_train_piece(v_b)->'events'->0->>'reason' = 'damaged', 'damaged';
  perform stk_train_set_state(v_b, 'in_stock', 'Alex');

  -- transfer: send → in transfer → receive in the other store
  begin perform stk_train_send(v_a, 'TRN-A', 'Alex', null); assert false, 'sent to its own store'; exception when raise_exception then null; end;
  begin perform stk_train_send(v_a, 'TRN-Z', 'Alex', null); assert false, 'sent to an unknown store'; exception when raise_exception then null; end;
  begin perform stk_train_receive(v_a, 'Alex', null); assert false, 'received a piece that was not sent'; exception when raise_exception then null; end;
  perform stk_train_send(v_a, 'trn-b', 'Alex', 'For the weekend event');
  d := stk_train_piece(v_a);
  assert d->'piece'->>'state' = 'in_transfer' and d->'piece'->>'store' = 'Training store A' and d->'piece'->>'to_store' = 'Training store B'
     and d->'piece'->>'state_note' = 'For the weekend event', 'sent: ' || (d->'piece')::text;
  x := d->'events'->0;
  assert x->>'reason' = 'transfer_sent' and x->>'from_state' = 'in_stock' and x->>'to_state' = 'in_transfer'
     and x->>'from_store' = 'Training store A' and x->>'to_store' = 'Training store B' and x->>'note' = 'For the weekend event', 'sent event: ' || x::text;
  begin perform stk_train_set_state(v_a, 'reserved', 'Alex'); assert false, 'reserved while in transfer'; exception when raise_exception then null; end;
  begin perform stk_train_send(v_a, 'TRN-B', 'Alex', null); assert false, 'sent twice'; exception when raise_exception then null; end;
  -- it still counts in the store it left until it is received
  assert (stk_train_list('{"store":"TRN-A"}'::jsonb)->>'count')::int = 8 and (stk_train_list('{"states":["in_transfer"]}'::jsonb)->>'count')::int = 1, 'in transfer is listed under the sending store';
  perform stk_train_receive(v_a, 'Alex', null);
  d := stk_train_piece(v_a);
  assert d->'piece'->>'state' = 'in_stock' and d->'piece'->>'store' = 'Training store B' and d->'piece'->>'to_store' is null
     and d->'piece'->>'state_note' is null and d->'events'->0->>'reason' = 'transfer_received', 'received: ' || (d->'piece')::text;
  assert (stk_train_list('{"store":"TRN-B"}'::jsonb)->>'count')::int = 5, 'the piece moved store';

  -- a transfer can be called back before it is received
  perform stk_train_send(v_b, 'TRN-B', 'Alex', null);
  perform stk_train_cancel(v_b, 'Alex', 'Sent by mistake');
  d := stk_train_piece(v_b);
  assert d->'piece'->>'state' = 'in_stock' and d->'piece'->>'store' = 'Training store A' and d->'piece'->>'to_store' is null
     and d->'events'->0->>'reason' = 'transfer_cancelled' and d->'events'->0->>'note' = 'Sent by mistake', 'cancelled: ' || d::text;
  begin perform stk_train_cancel(v_b, 'Alex', null); assert false, 'cancelled a piece that is not in transfer'; exception when raise_exception then null; end;

  -- Supabase refuses a DELETE without WHERE to the API roles (safeupdate): the reset must not use one
  assert (select prosrc from pg_proc where proname = 'stk_train_seed') !~* 'delete from stk_train_pieces\s*;', 'the reset deletes without a WHERE clause';
  -- reset: the set as it started, same piece references
  r := stk_train_reset('Alex');
  assert (r->>'pieces')::int = 12, 'reset answer: ' || r::text;
  d := stk_train_piece(v_a);
  assert d->'piece'->>'state' = 'in_stock' and d->'piece'->>'store' = 'Training store A' and jsonb_array_length(d->'events') = 1, 'reset restored the piece';
  assert (select count(*) from stk_train_events) = 12, 'history cleared';

  -- nothing real was touched, and no training piece is in a real list
  assert (select count(*) from ops_pieces) = n_real and (select count(*) from ops_piece_events) = n_ev, 'real stock untouched';
  assert (stk_piece_list('{"q":"TRN-000"}'::jsonb)->>'count')::int = 0, 'no training piece in the real list';

  -- closed to the API roles
  foreach f in array array['stk_train_seed()', 'stk_train_reset(text)', 'stk_train_list(jsonb)', 'stk_train_facets()', 'stk_train_piece(uuid)',
      'stk_train_set_state(uuid,text,text,text,text,date)', 'stk_train_send(uuid,text,text,text)', 'stk_train_receive(uuid,text,text)', 'stk_train_cancel(uuid,text,text)'] loop
    assert not has_function_privilege('anon', 'public.' || f, 'execute') and not has_function_privilege('authenticated', 'public.' || f, 'execute'), f || ' is open';
  end loop;
  foreach f in array array['stk_train_stores', 'stk_train_pieces', 'stk_train_events'] loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || f)::regclass), f || ' has no RLS';
    assert not has_table_privilege('anon', 'public.' || f, 'select') and not has_table_privilege('authenticated', 'public.' || f, 'select'), f || ' is readable';
  end loop;
  raise notice 'stk_t5 ok';
end $$;
rollback;
