-- Arrival date in the Stock list, the photo in Sales search, and a line's exact total. Invented fixtures. Rolled back.
begin;
\ir fixtures/s2_seed.sql
do $$
declare j jsonb; p1 uuid; p2 uuid; rid bigint; ok boolean;
begin
  if not exists (select 1 from ops_pieces) then perform ops_initial_fill('Alex'); end if;
  select piece_id into p1 from ops_pieces where serial = 'ZS-S001';
  select piece_id into p2 from ops_pieces where serial = 'ZS-S002';
  insert into ops_receipts(supplier, invoice_no, arrival_date) values ('Zr Supplier', 'ZR-INV-1', date '2026-03-05') returning receipt_id into rid;
  update ops_pieces set receipt_id = rid where piece_id = p1;
  update cat_models set latest_arrival_year = 2024, image_key = 'ZS-M1/all/1-zr-400.webp' where model_id = 'ZS-M1';

  j := stk_piece_list('{"q":"ZS-S00","sort":"since.desc"}'::jsonb);
  assert (select e->>'arrived' from jsonb_array_elements(j->'rows') e where e->>'serial' = 'ZS-S001') = '2026-03-05', format('arrival from the document: %s', j->'rows');
  assert (select (e->>'arrived') is null and (e->>'arrived_year')::int = 2024 from jsonb_array_elements(j->'rows') e where e->>'serial' = 'ZS-S002'), 'no document: the design''s year, as an estimate';
  assert j->'rows'->0->>'serial' = 'ZS-S001', format('newest arrival first: %s', (select jsonb_agg(e->>'serial') from jsonb_array_elements(j->'rows') e));
  assert stk_export('{"q":"ZS-S001"}'::jsonb)->0->>'arrived' = '2026-03-05', 'the export has it too';

  assert (pos_search_pieces('ZS-S001', 'live')->0->>'image') = 'ZS-M1/all/1-zr-400.webp', 'search carries the photo';

  -- a line's exact total
  assert pos_line_net(19186000, 5.1034, null) = round(19186000 * (1 - 5.1034 / 100)), 'without a total: price less discount';
  assert pos_line_net(19186000, 5.1034, 18206860) = 18206860, 'an exact total that agrees with the discount is taken';
  begin perform pos_line_net(19186000, 5.1034, 18000000); ok := false; exception when sqlstate 'P0001' then ok := sqlerrm = 'a line total does not match its price and discount'; end;
  assert ok, 'a total that does not agree is refused';
  begin perform pos_line_net(1000, 0, 1001); ok := false; exception when sqlstate 'P0001' then ok := true; end;
  assert ok, 'never above the price';
  begin perform pos_line_net(1000, 10, 900.5); ok := false; exception when sqlstate 'P0001' then ok := true; end;
  assert ok, 'whole so''m only';
  assert not has_function_privilege('anon', 'public.pos_line_net(numeric,numeric,numeric)', 'execute')
     and not has_function_privilege('anon', 'public.stk_piece_arrived(uuid)', 'execute'), 'closed to the page';
end $$;
select 'stk_t7 ok' as result;
rollback;
