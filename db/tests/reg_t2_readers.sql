-- One register, step 2: Sales, Stock and Performance read the price from the piece. Invented fixtures. Rolled back.
begin;
\ir fixtures/s2_seed.sql
do $$
declare pid uuid; j jsonb; n int;
begin
  if not exists (select 1 from ops_pieces) then perform ops_initial_fill('Alex'); end if;
  assert (select price_uzs from ops_pieces where serial = 'ZS-S004') = 2000, 'a first fill of an empty register carries the price';
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) ilike '%cat_pieces%'
     and p.proname not in ('cat_load', 'ops_sync_pieces', 'reg_backfill_prices',
                           'ops_initial_fill',   -- fills an empty register from the load's record, once
                           'cat_apply_incoming', 'cat_merge_sizes', 'cat_rebuild_facets', 'cat_rebuild_facets_v2', 'cat_rebuild_search');
  assert n = 0, format('%s other functions still read cat_pieces', n);

  select piece_id into pid from ops_pieces where serial = 'ZS-S001';
  update ops_pieces set price_uzs = 7770000 where piece_id = pid;
  assert (select price_uzs from cat_pieces where serial = 'ZS-S001') = 1000, 'the load record differs';
  j := stk_piece_list('{"q":"ZS-S001"}'::jsonb);
  assert (select (e->>'price_uzs')::numeric from jsonb_array_elements(j->'rows') e where e->>'serial' = 'ZS-S001') = 7770000,
         format('stock list price from the piece: %s', j);
  j := pos_search_pieces('ZS-S001', 'live');
  assert j::text like '%7770000%', format('sales search price from the piece: %s', j);
  j := stk_piece_cost(pid);
  assert j::text like '%7770000%', format('cost view shelf price from the piece: %s', j);
end $$;
select 'reg_t2 ok' as result;
rollback;
