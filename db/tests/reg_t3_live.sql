-- One register, step 3: catalogue counts, prices and sizes come live from the piece register. Invented fixtures. Rolled back.
begin;
\ir fixtures/s2_seed.sql
do $$
declare p1 uuid; p3 uuid; p4 uuid; payload jsonb; r jsonb; n int;
begin
  if not exists (select 1 from ops_pieces) then perform ops_initial_fill('Alex'); end if;
  select piece_id into p1 from ops_pieces where serial = 'ZS-S001';
  select piece_id into p3 from ops_pieces where serial = 'ZS-S003';
  select piece_id into p4 from ops_pieces where serial = 'ZS-S004';

  perform cat_refresh_stock();
  assert not exists (select 1 from cat_variants v where v.qty_stock <>
           (select count(*) from ops_pieces o where o.variant_id = v.variant_id and o.state = 'in_stock')), 'variant counts are the register''s';
  assert (select qty_stock from cat_models where model_id = 'ZS-M1') = 3 and (select in_stock from cat_models where model_id = 'ZS-M1'), 'design count';
  assert (select qty_transit from cat_variants where variant_id = 'ZS-M2-WG') = 2
     and (select qty_transit from cat_models where model_id = 'ZS-M4') = 1, 'in transit from the register';
  assert (select price_min_uzs from cat_models where model_id = 'ZS-M1') = 1000
     and (select price_max_uzs from cat_models where model_id = 'ZS-M1') = 1100, 'price range from pieces in stock';
  assert (select size_keys from cat_models where model_id = 'ZS-M1') = array['53','54','55'], 'sizes from pieces in stock';

  -- a reservation shows at once: the only yellow-gold piece is held
  perform cat_refresh_if_dirty();
  perform ops_set_state(p3, 'reserved', 'Alex', 'held for a client');
  assert (select qty_stock from cat_variants where variant_id = 'ZS-M1-YG') = 0
     and not (select in_stock from cat_variants where variant_id = 'ZS-M1-YG'), 'reserved piece is not offered';
  assert (select qty_stock from cat_models where model_id = 'ZS-M1') = 2 and (select in_stock from cat_models where model_id = 'ZS-M1'), 'design still in stock';
  assert (select price_max_uzs from cat_models where model_id = 'ZS-M1') = 1000, 'its price left the range';
  assert (select size_keys from cat_models where model_id = 'ZS-M1') = array['54','55'], 'its size is no longer offered';
  assert (select dirty from cat_facet_revision), 'filters marked for a rebuild';
  assert cat_refresh_if_dirty(), 'rebuilt';
  assert not (select dirty from cat_facet_revision), 'clean after the rebuild';
  assert not cat_refresh_if_dirty(), 'nothing to rebuild twice';
  assert (select search_text from cat_models where model_id = 'ZS-M1') like '%zs-s003%', 'search still finds a held piece''s design by its serial';
  assert exists (select 1 from cat_piece_sizes where serial = 'ZS-S001' and source_kind = 'boutique')
     and exists (select 1 from cat_piece_sizes where serial = 'ZS-T001' and source_kind = 'transit'), 'filter cache built from the register';
  assert not exists (select 1 from cat_piece_sizes where serial = 'ZS-S003'), 'filter cache has no held piece';
  assert exists (select 1 from cat_filter_candidates_v2 where serial = 'zs-s001' and origin = 'boutique')
     and not exists (select 1 from cat_filter_candidates_v2 where serial = 'zs-s003'), 'filter candidates follow';

  -- a load that still lists the held piece as stock does not bring it back
  payload := jsonb_build_object(
    'built', 'reg test',
    'models', (select jsonb_agg(to_jsonb(m) || case when m.model_id = 'ZS-M1' then '{"qty_stock":3,"in_stock":true,"price_max_uzs":1100}'::jsonb else '{}' end) from cat_models m),
    'variants', (select jsonb_agg(to_jsonb(v) || case when v.variant_id = 'ZS-M1-YG' then '{"qty_stock":1,"in_stock":true}'::jsonb else '{}' end) from cat_variants v),
    'pieces', (select jsonb_agg(jsonb_build_object('serial', serial, 'variant_id', variant_id, 'size', size, 'price_uzs', price_uzs)) from cat_pieces),
    'attributes', (select jsonb_agg(jsonb_build_object('variant_id', variant_id, 'key', key, 'value', value, 'value_num', value_num, 'flag', flag)) from cat_attributes),
    'links', '[]'::jsonb,
    'expected', (select jsonb_agg(to_jsonb(e)) from cat_expected_keys e));
  drop table if exists _ov_new, _cat_facet_stage_v2;
  r := cat_load(payload, 'reg test');
  assert (select qty_stock from cat_variants where variant_id = 'ZS-M1-YG') = 0
     and (select qty_stock from cat_models where model_id = 'ZS-M1') = 2
     and (select price_max_uzs from cat_models where model_id = 'ZS-M1') = 1000, format('the load''s own counts do not survive: %s', r);
  assert not (select dirty from cat_facet_revision), 'a load leaves the filters rebuilt';
  assert (r->>'in_transit')::int = 3, 'load result counts transit from the register';

  -- released: back at once
  perform ops_set_state(p3, 'in_stock', 'Alex');
  assert (select qty_stock from cat_variants where variant_id = 'ZS-M1-YG') = 1 and (select in_stock from cat_variants where variant_id = 'ZS-M1-YG'), 'released piece is offered again';

  -- sold: gone at once, and the design is out of stock when it was the last
  update ops_pieces set state = 'sold', state_since = now() where piece_id = p4;
  assert (select qty_stock from cat_models where model_id = 'ZS-M2') = 0 and not (select in_stock from cat_models where model_id = 'ZS-M2'), 'sold piece leaves the catalogue';
  assert (select price_min_uzs from cat_models where model_id = 'ZS-M2') = 2000, 'a design with nothing in stock keeps its last price';

  -- a new price shows at once
  update ops_pieces set price_uzs = 1 where piece_id = p1;
  assert (select price_min_uzs from cat_models where model_id = 'ZS-M1') = 1, 'price change reaches the catalogue';

  -- an update that changes nothing the catalogue shows marks nothing
  perform cat_refresh_if_dirty();
  update ops_pieces set state_note = 'note only' where piece_id = p1;
  assert not (select dirty from cat_facet_revision), 'a note is not a catalogue change';

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) ~* '\mcat_pieces\M'
     and p.proname not in ('cat_load', 'ops_sync_pieces', 'reg_backfill_prices', 'ops_initial_fill',
                           'cat_merge_sizes', 'cat_apply_incoming');   -- the load and its own helpers work on the load record
  assert n = 0, format('%s functions outside the load still read cat_pieces', n);

  assert position('pg_advisory_xact_lock' in pg_get_functiondef('public.cat_refresh_stock(text[])'::regprocedure))
       < position('update cat_variants' in pg_get_functiondef('public.cat_refresh_stock(text[])'::regprocedure)), 'refreshes run one at a time, the lock before the counting';

  assert position('lock table ops_pieces in exclusive mode' in pg_get_functiondef('public.cat_load(jsonb,text)'::regprocedure)) between 1
       and position('insert into cat_import_runs' in pg_get_functiondef('public.cat_load(jsonb,text)'::regprocedure)), 'a load takes the register before it writes anything';

  assert position('pg_advisory_xact_lock(hashtext(''cat_refresh_stock''))' in pg_get_functiondef('public.cat_load(jsonb,text)'::regprocedure))
           > position('lock table ops_pieces in exclusive mode' in pg_get_functiondef('public.cat_load(jsonb,text)'::regprocedure))
     and position('pg_try_advisory_xact_lock(hashtext(''cat_refresh_stock''))' in pg_get_functiondef('public.cat_refresh_if_dirty()'::regprocedure))
           < position('update cat_facet_revision' in pg_get_functiondef('public.cat_refresh_if_dirty()'::regprocedure)),
         'load, rebuild and piece changes share one lock, taken before any catalogue row';

  assert not has_table_privilege('anon', 'public.cat_live_pieces', 'select') and not has_table_privilege('authenticated', 'public.cat_live_pieces', 'select')
     and not has_table_privilege('anon', 'public.cat_live_incoming', 'select'), 'views closed to the page';
  assert not has_function_privilege('anon', 'public.cat_refresh_stock(text[])', 'execute')
     and not has_function_privilege('anon', 'public.cat_refresh_if_dirty()', 'execute'), 'functions closed to the page';
end $$;
select 'reg_t3 ok' as result;
rollback;
