-- Stock table tools: several brands at once, sorting by a column, and the values of a column with their counts
-- under the other filters (for the column checklists). Real pieces and training pieces. Rolled back.
begin;
do $$
declare r jsonb; v jsonb; a text[]; f text;
begin
  insert into ops_pieces(store_id, brand, serial, state, state_since) values
    (1, 'T6 Alpha', 'T6-A1', 'in_stock',   '2026-11-01 10:00+00'),
    (1, 'T6 Alpha', 'T6-A2', 'reserved',   '2026-11-03 10:00+00'),
    (1, 'T6 Beta',  'T6-B1', 'in_stock',   '2026-11-02 10:00+00'),
    (1, 'T6 Beta',  'T6-B2', 'damaged',    '2026-11-05 10:00+00'),
    (1, 'T6 Gamma', 'T6-G1', 'booked_out', '2026-11-04 10:00+00');
  -- the date column is the arrival: each piece gets an arrival document dated as its state date
  with r as (insert into ops_receipts(supplier, invoice_no, arrival_date)
               select 'T6 Supplier', serial, state_since::date from ops_pieces where serial like 'T6-%' returning receipt_id, invoice_no)
  update ops_pieces o set receipt_id = r.receipt_id from r where o.serial = r.invoice_no;

  -- several brands at once
  r := stk_piece_list('{"q":"T6-","brands":["T6 Alpha","T6 Gamma"]}');
  assert (r->>'count')::int = 3, 'two brands: ' || (r->>'count');
  assert (select sum((x->>'pieces')::int) from jsonb_array_elements(r->'totals') x) = 3, 'totals follow the brands';
  assert (stk_piece_list('{"q":"T6-","brands":["T6 Alpha","T6 Gamma"],"states":["in_stock"]}')->>'count')::int = 1, 'brands and states';
  assert (stk_piece_list('{"q":"T6-","brands":[]}')->>'count')::int = 5, 'an empty list of brands is no filter';
  assert jsonb_array_length(stk_export('{"q":"T6-","brands":["T6 Beta"]}')) = 2, 'export follows the brands';

  -- sorting; the default order is unchanged (brand, reference, serial)
  select array_agg(x->>'serial' order by o) into a from jsonb_array_elements(stk_piece_list('{"q":"T6-"}')->'rows') with ordinality t(x, o);
  assert a = array['T6-A1','T6-A2','T6-B1','T6-B2','T6-G1'], 'default order: ' || a::text;
  select array_agg(x->>'serial' order by o) into a from jsonb_array_elements(stk_piece_list('{"q":"T6-","sort":"serial.desc"}')->'rows') with ordinality t(x, o);
  assert a = array['T6-G1','T6-B2','T6-B1','T6-A2','T6-A1'], 'serial desc: ' || a::text;
  select array_agg(x->>'serial' order by o) into a from jsonb_array_elements(stk_piece_list('{"q":"T6-","sort":"since.desc"}')->'rows') with ordinality t(x, o);
  assert a = array['T6-B2','T6-G1','T6-A2','T6-B1','T6-A1'], 'since desc: ' || a::text;
  select array_agg(x->>'serial' order by o) into a from jsonb_array_elements(stk_piece_list('{"q":"T6-","sort":"since.asc"}')->'rows') with ordinality t(x, o);
  assert a = array['T6-A1','T6-B1','T6-A2','T6-G1','T6-B2'], 'since asc: ' || a::text;
  -- states sort in the order the page shows them, not by their keys
  select array_agg(x->>'state' order by o) into a from jsonb_array_elements(stk_piece_list('{"q":"T6-","sort":"state.asc"}')->'rows') with ordinality t(x, o);
  assert a = array['in_stock','in_stock','reserved','booked_out','damaged'], 'state asc: ' || a::text;
  select array_agg(x->>'brand' order by o) into a from jsonb_array_elements(stk_piece_list('{"q":"T6-","sort":"brand.desc"}')->'rows') with ordinality t(x, o);
  assert a = array['T6 Gamma','T6 Beta','T6 Beta','T6 Alpha','T6 Alpha'], 'brand desc: ' || a::text;
  -- unpriced pieces come last whichever way the price is sorted; an unknown sort is the default order
  assert (stk_piece_list('{"q":"T6-","sort":"price.asc"}')->>'count')::int = 5 and (stk_piece_list('{"q":"T6-","sort":"price.desc"}')->>'count')::int = 5, 'price sort runs';
  select array_agg(x->>'serial' order by o) into a from jsonb_array_elements(stk_piece_list('{"q":"T6-","sort":"nonsense.up"}')->'rows') with ordinality t(x, o);
  assert a = array['T6-A1','T6-A2','T6-B1','T6-B2','T6-G1'], 'unknown sort: ' || a::text;
  select array_agg(x->>'serial' order by o) into a from jsonb_array_elements(stk_export('{"q":"T6-","sort":"serial.desc"}')) with ordinality t(x, o);
  assert a[1] = 'T6-G1' and a[5] = 'T6-A1', 'export follows the sort';

  -- the values of a column with counts: under the other filters, never under its own
  v := stk_facet_values('{"q":"T6-","brands":["T6 Alpha"],"states":["in_stock"]}', 'brand');
  assert v = '[{"value":"T6 Alpha","count":1},{"value":"T6 Beta","count":1}]'::jsonb, 'brand values: ' || v::text;
  v := stk_facet_values('{"q":"T6-","brand":"T6 Gamma"}', 'brand');
  assert jsonb_array_length(v) = 3, 'the single-brand filter is its own filter too: ' || v::text;
  v := stk_facet_values('{"q":"T6-","brands":["T6 Alpha","T6 Beta"],"states":["damaged"]}', 'state');
  assert v = '[{"value":"in_stock","count":2},{"value":"reserved","count":1},{"value":"damaged","count":1}]'::jsonb, 'state values: ' || v::text;
  begin perform stk_facet_values('{}', 'serial'); assert false, 'serial is not a checklist column'; exception when raise_exception then null; end;

  -- training: the same, plus stores
  r := stk_train_list('{"brands":["Training Watchmaker"],"stores":["TRN-B"]}');
  assert (r->>'count')::int = 2, 'training brands and stores: ' || (r->>'count');
  assert (stk_train_list('{"stores":["TRN-A","TRN-B"]}')->>'count')::int = 12 and (stk_train_list('{"store":"TRN-B"}')->>'count')::int = 4, 'training stores';
  select array_agg(x->>'serial' order by o) into a from jsonb_array_elements(stk_train_list('{"sort":"price.desc"}')->'rows') with ordinality t(x, o);
  assert a[1] = 'TRN-0008' and a[12] = 'TRN-0012', 'training price desc: ' || a::text;
  select array_agg(x->>'store_code' order by o) into a from jsonb_array_elements(stk_train_list('{"sort":"store.desc"}')->'rows') with ordinality t(x, o);
  assert a[1] = 'TRN-B' and a[4] = 'TRN-B' and a[5] = 'TRN-A', 'training store desc: ' || a::text;
  select array_agg(x->>'serial' order by o) into a from jsonb_array_elements(stk_train_list('{}')->'rows') with ordinality t(x, o);
  assert a[1] = 'TRN-0005' and a[12] = 'TRN-0012', 'training default order unchanged: ' || a::text;
  v := stk_train_facet_values('{"stores":["TRN-B"],"brands":["Training Jeweller"]}', 'store');
  assert v = '[{"value":"TRN-A","label":"Training store A","count":5},{"value":"TRN-B","label":"Training store B","count":2}]'::jsonb, 'training store values: ' || v::text;
  v := stk_train_facet_values('{"stores":["TRN-B"]}', 'brand');
  assert v = '[{"value":"Training Jeweller","count":2},{"value":"Training Watchmaker","count":2}]'::jsonb, 'training brand values: ' || v::text;
  v := stk_train_facet_values('{"states":["reserved"]}', 'state');
  assert v = '[{"value":"in_stock","count":12}]'::jsonb, 'training state values: ' || v::text;
  begin perform stk_train_facet_values('{}', 'price'); assert false, 'price is not a checklist column'; exception when raise_exception then null; end;

  foreach f in array array['stk_rows(jsonb,text)', 'stk_facet_values(jsonb,text)', 'stk_train_rows(jsonb,text)', 'stk_train_facet_values(jsonb,text)',
      'stk_sort_text(text,text,text,text,text)', 'stk_sort_num(text,text,numeric,timestamptz)'] loop
    assert not has_function_privilege('anon', 'public.' || f, 'execute') and not has_function_privilege('authenticated', 'public.' || f, 'execute'), f || ' is open';
  end loop;
  raise notice 'stk_t6 ok';
end $$;
rollback;
