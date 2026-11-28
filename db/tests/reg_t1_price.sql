-- One register, step 1: the retail price lives on the piece. Invented fixtures. Rolled back.
begin;
\ir fixtures/s2_seed.sql
do $$
declare payload jsonb; r jsonb; pid uuid;
begin
  if not exists (select 1 from ops_pieces) then perform ops_initial_fill('Alex'); end if;
  assert (select (state, price_uzs is null) = ('in_transit', true) from ops_pieces where serial = 'ZS-T001'), 'a piece on its way has no price';
  -- what the migration's backfill does, for pieces the seed added after it ran
  perform reg_backfill_prices();
  assert not exists (
    select 1 from ops_pieces o
     where o.state in ('in_stock','reserved','booked_out','damaged')
       and o.price_uzs is distinct from (select c.price_uzs from cat_pieces c join cat_variants v using (variant_id) join cat_models m using (model_id)
                                          where m.brand = o.brand and upper(btrim(c.serial)) = upper(btrim(o.serial)) order by c.id desc limit 1)),
    'every piece on the floor carries the catalogue price';
  assert (select price_uzs from ops_pieces where serial = 'ZS-S003') = 1100, 'seed price copied';

  payload := jsonb_build_object(
    'built', 'reg test',
    'models', (select jsonb_agg(to_jsonb(m)) from cat_models m),
    'variants', (select jsonb_agg(to_jsonb(v)) from cat_variants v),
    'pieces', (select jsonb_agg(jsonb_build_object('serial', serial, 'variant_id', variant_id, 'size', size, 'price_uzs', price_uzs)) from cat_pieces)
              || jsonb_build_array(jsonb_build_object('serial', 'ZR-S900', 'variant_id', 'ZS-M2-WG', 'size', null, 'price_uzs', 5000000),
                                   jsonb_build_object('serial', 'ZS-T001', 'variant_id', 'ZS-M2-WG', 'size', null, 'price_uzs', 2100)),   -- was in transit
    'attributes', (select jsonb_agg(jsonb_build_object('variant_id', variant_id, 'key', key, 'value', value, 'value_num', value_num, 'flag', flag)) from cat_attributes),
    'links', '[]'::jsonb,
    'expected', (select jsonb_agg(to_jsonb(e)) from cat_expected_keys e));
  r := cat_load(payload, 'reg test');
  select piece_id into pid from ops_pieces where serial = 'ZR-S900';
  assert pid is not null and (select price_uzs from ops_pieces where piece_id = pid) = 5000000, 'a new piece takes its first price from the load';
  assert (select count(*) from ops_piece_changes where piece_id = pid and field = 'price' and source = 'colibri_first_load'
            and old_value is null and new_value = '5000000' and actor = 'catalogue load') = 1, 'first price recorded once';
  assert (select (state, price_uzs) = ('in_stock', 2100) from ops_pieces where serial = 'ZS-T001'), 'a piece that was on its way arrives with its first price';
  assert (select count(*) from ops_piece_changes c join ops_pieces o using (piece_id) where o.serial = 'ZS-T001' and c.source = 'colibri_first_load' and c.new_value = '2100') = 1, 'and it is recorded';
  assert (select count(*) from ops_piece_changes) = 2, 'held pieces got no history line';

  assert not has_table_privilege('anon', 'public.ops_piece_changes', 'select')
     and not has_table_privilege('authenticated', 'public.ops_piece_changes', 'select'), 'history closed to the page';
  assert not has_function_privilege('anon', 'public.reg_backfill_prices()', 'execute'), 'backfill closed to the page';
end $$;
select 'reg_t1 ok' as result;
rollback;
