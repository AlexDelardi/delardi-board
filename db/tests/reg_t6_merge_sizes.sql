-- One register: when the catalogue folds a size-coded reference into another design, the pieces we hold under it
-- follow (that fold is our own tidying, not something Colibri says about the piece). Invented fixtures. Rolled back.
begin;
\ir fixtures/s2_seed.sql
do $$
declare m jsonb; v jsonb; pid uuid; r jsonb;
  function_note constant text := 'ZR-RING052 and ZR-RING054 are one design in two sizes';
begin
  if not exists (select 1 from ops_pieces) then perform ops_initial_fill('Alex'); end if;
  insert into cat_size_coded_brands(brand) values ('Zeta Seed') on conflict do nothing;
  m := (select to_jsonb(x) from cat_models x where model_id = 'ZS-M2');
  v := (select to_jsonb(x) from cat_variants x where variant_id = 'ZS-M2-WG');

  -- load 1: one size-coded reference, one piece
  r := cat_load(jsonb_build_object('built', 'reg t6',
    'models', (select jsonb_agg(to_jsonb(x)) from cat_models x) || jsonb_build_array(m || '{"model_id":"ZR-RING052","article":"ZR-RING052","in_stock":true,"qty_stock":1}'::jsonb),
    'variants', (select jsonb_agg(to_jsonb(x)) from cat_variants x) || jsonb_build_array(v || '{"variant_id":"ZR-RING052-WG","model_id":"ZR-RING052","in_stock":true,"qty_stock":1,"arrival_years":[2026]}'::jsonb),
    'pieces', (select jsonb_agg(jsonb_build_object('serial', serial, 'variant_id', variant_id, 'size', size, 'price_uzs', price_uzs)) from cat_pieces)
              || '[{"serial":"ZR-K1","variant_id":"ZR-RING052-WG","size":null,"price_uzs":3000}]'::jsonb,
    'attributes', '[]'::jsonb, 'links', '[]'::jsonb, 'expected', (select jsonb_agg(to_jsonb(e)) from cat_expected_keys e)), 'reg t6 a');
  select piece_id into pid from ops_pieces where serial = 'ZR-K1';
  assert (select (model_id, variant_id) = ('ZR-RING052', 'ZR-RING052-WG') from ops_pieces where piece_id = pid), 'held under the first reference';

  -- load 2: a second size appears and becomes the established design (the first is no longer in stock in Colibri's eyes)
  drop table if exists _ov_new, _cat_facet_stage_v2;
  r := cat_load(jsonb_build_object('built', 'reg t6',
    'models', (select jsonb_agg(case when x.model_id = 'ZR-RING052' then to_jsonb(x) || '{"in_stock":false,"qty_stock":0}'::jsonb else to_jsonb(x) end) from cat_models x)
              || jsonb_build_array(m || '{"model_id":"ZR-RING054","article":"ZR-RING054","in_stock":true,"qty_stock":1}'::jsonb),
    'variants', (select jsonb_agg(to_jsonb(x)) from cat_variants x) || jsonb_build_array(v || '{"variant_id":"ZR-RING054-WG","model_id":"ZR-RING054","in_stock":true,"qty_stock":1,"arrival_years":[2026]}'::jsonb),
    'pieces', (select jsonb_agg(jsonb_build_object('serial', serial, 'variant_id', variant_id, 'size', size, 'price_uzs', price_uzs)) from cat_pieces)
              || '[{"serial":"ZR-K2","variant_id":"ZR-RING054-WG","size":null,"price_uzs":3000}]'::jsonb,
    'attributes', '[]'::jsonb, 'links', '[]'::jsonb, 'expected', (select jsonb_agg(to_jsonb(e)) from cat_expected_keys e)), 'reg t6 b');
  assert not exists (select 1 from cat_models where model_id = 'ZR-RING052') and exists (select 1 from cat_models where model_id = 'ZR-RING054'), 'the two references are one design now';
  assert (select (model_id, variant_id) = ('ZR-RING054', 'ZR-RING054-WG') from ops_pieces where piece_id = pid),
         format('the held piece follows the fold: %s', (select to_jsonb(o) from ops_pieces o where piece_id = pid));
  assert (select size from ops_pieces where piece_id = pid) = cat_size_from_ref('ZR-RING052'), 'and keeps the size its old reference carried';
  assert (select qty_stock from cat_variants where variant_id = 'ZR-RING054-WG') = 2 and (select qty_stock from cat_models where model_id = 'ZR-RING054') = 2, 'both pieces are offered under the one design';
  assert not exists (select 1 from ops_colibri_diffs where piece_id = pid and field = 'design'), 'with nothing to review: the fold is ours';
  assert not exists (select 1 from ops_pieces o where o.state = 'in_stock' and o.variant_id is not null and not exists (select 1 from cat_variants c where c.variant_id = o.variant_id)), 'no piece points at a colour that is gone';
end $$;
select 'reg_t6 ok' as result;
rollback;
