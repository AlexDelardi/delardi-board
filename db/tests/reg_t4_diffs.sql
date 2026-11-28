-- One register, step 4: a Colibri load no longer rewrites pieces we hold; differences wait for review.
-- Invented fixtures. Rolled back.
begin;
\ir fixtures/s2_seed.sql
create function pg_temp.reg_payload(p_pieces jsonb, p_skip_variant text default null) returns jsonb language sql as $$
  select jsonb_build_object(
    'built', 'reg test',
    'models', (select jsonb_agg(to_jsonb(m)) from cat_models m),
    'variants', (select jsonb_agg(to_jsonb(v)) from cat_variants v where v.variant_id is distinct from p_skip_variant),
    'pieces', p_pieces,
    'attributes', (select coalesce(jsonb_agg(jsonb_build_object('variant_id', variant_id, 'key', key, 'value', value, 'value_num', value_num, 'flag', flag)), '[]') from cat_attributes where variant_id is distinct from p_skip_variant),
    'links', '[]'::jsonb,
    'expected', (select jsonb_agg(to_jsonb(e)) from cat_expected_keys e));
$$;
do $$
declare p1 uuid; p2 uuid; p3 uuid; base jsonb; changed jsonb; r jsonb; d_price bigint; d_size bigint; d_design bigint; n int; ok boolean;
begin
  if not exists (select 1 from ops_pieces) then perform ops_initial_fill('Alex'); end if;
  select piece_id into p1 from ops_pieces where serial = 'ZS-S001';
  select piece_id into p2 from ops_pieces where serial = 'ZS-S002';
  select piece_id into p3 from ops_pieces where serial = 'ZS-S003';
  insert into board_users(name, signin_hash, active) values ('Zed Viewer', 'zr-no-login', true);   -- no manage-stock right
  base := (select jsonb_agg(jsonb_build_object('serial', serial, 'variant_id', variant_id, 'size', size, 'price_uzs', price_uzs)) from cat_pieces);
  -- Colibri now says: S001 costs 1500, is size 56 and is the yellow-gold one; S002 has a barcode
  changed := (select jsonb_agg(case e->>'serial'
                 when 'ZS-S001' then e || '{"price_uzs":1500,"size":"56","variant_id":"ZS-M1-YG"}'::jsonb
                 when 'ZS-S002' then e || '{"barcode":"ZR-BC1"}'::jsonb else e end) from jsonb_array_elements(base) e);

  r := cat_load(pg_temp.reg_payload(changed), 'reg test 1');
  assert (select (price_uzs, size, variant_id, model_id, article) = (1000, '54', 'ZS-M1-WG', 'ZS-M1', 'ZS-M1') from ops_pieces where piece_id = p1),
         'a held piece is not rewritten by the load';
  assert (select array_agg(field order by field) from ops_colibri_diffs where piece_id = p1 and status = 'open') = array['design','price','size'],
         format('three differences wait: %s', (select jsonb_agg(to_jsonb(d)) from ops_colibri_diffs d));
  assert (select (ours, colibri) = ('1000', '1500') from ops_colibri_diffs where piece_id = p1 and field = 'price'), 'price line shows both values';
  assert (select colibri_data = '{"article":"ZS-M1","model_id":"ZS-M1","variant_id":"ZS-M1-YG"}'::jsonb from ops_colibri_diffs where piece_id = p1 and field = 'design'), 'design line carries what to apply';
  assert (select qty_stock from cat_variants where variant_id = 'ZS-M1-WG') = 2 and (select qty_stock from cat_variants where variant_id = 'ZS-M1-YG') = 1,
         'the catalogue keeps counting the piece where we hold it';
  assert (select barcode from ops_pieces where piece_id = p2) = 'ZR-BC1' and not exists (select 1 from ops_colibri_diffs where piece_id = p2), 'an empty barcode is filled without review';
  assert (r->'ops'->>'differences')::int = 3, format('load reports new differences: %s', r->'ops');

  -- the same load again raises nothing
  drop table if exists _ov_new, _cat_facet_stage_v2;
  r := cat_load(pg_temp.reg_payload(changed), 'reg test 2');
  assert (select count(*) from ops_colibri_diffs) = 3 and (r->'ops'->>'differences')::int = 0, 'no line twice';

  -- the list
  r := stk_diff_list('{}'::jsonb);
  assert (r->>'total')::int = 3 and jsonb_array_length(r->'rows') = 3 and r->'open_by_field' = '{"design":1,"price":1,"size":1}'::jsonb
     and r->'brands' = '["Zeta Seed"]'::jsonb, format('list: %s', r);
  assert (stk_diff_list('{"field":"price"}'::jsonb)->>'total')::int = 1 and (stk_diff_list('{"brand":"No Such"}'::jsonb)->>'total')::int = 0, 'list filters';
  assert (r->'rows'->0) ?& array['diff_id','piece_id','brand','serial','article','field','ours','colibri','raised_at'], 'row shape';
  select diff_id into d_price from ops_colibri_diffs where piece_id = p1 and field = 'price';
  select diff_id into d_size from ops_colibri_diffs where piece_id = p1 and field = 'size';
  select diff_id into d_design from ops_colibri_diffs where piece_id = p1 and field = 'design';

  -- rights
  begin
    perform stk_diff_decide(jsonb_build_object('take', false, 'ids', jsonb_build_array(d_price)), 'Zed Viewer');
    ok := false;
  exception when sqlstate 'P0001' then ok := sqlerrm = 'Your account cannot change stock.'; end;
  assert ok, 'deciding needs the manage right';
  begin
    perform stk_diff_decide('{"take":false}'::jsonb, 'Alex'); ok := false;
  exception when sqlstate 'P0001' then ok := sqlerrm = 'Say which differences to decide.'; end;
  assert ok, 'ids or filters, one of them';

  -- keep ours: remembered for this Colibri value
  r := stk_diff_decide(jsonb_build_object('take', false, 'ids', jsonb_build_array(d_price)), 'Alex');
  assert r = '{"kept":1,"taken":0,"skipped":0}'::jsonb, format('kept: %s', r);
  assert (select (status, decided_by) = ('kept', 'Alex') from ops_colibri_diffs where diff_id = d_price) and (select price_uzs from ops_pieces where piece_id = p1) = 1000, 'kept: nothing changes';
  drop table if exists _ov_new, _cat_facet_stage_v2;
  perform cat_load(pg_temp.reg_payload(changed), 'reg test 3');
  assert not exists (select 1 from ops_colibri_diffs where piece_id = p1 and field = 'price' and status = 'open'), 'the rejected value is not raised again';
  -- a new Colibri value is a new line
  drop table if exists _ov_new, _cat_facet_stage_v2;
  perform cat_load(pg_temp.reg_payload((select jsonb_agg(case when e->>'serial' = 'ZS-S001' then e || '{"price_uzs":1700}'::jsonb else e end) from jsonb_array_elements(changed) e)), 'reg test 4');
  assert (select colibri from ops_colibri_diffs where piece_id = p1 and field = 'price' and status = 'open') = '1700', 'another value raises a new line';
  -- that one turned down too; then Colibri goes back to the first value: every rejected value is remembered
  perform stk_diff_decide(jsonb_build_object('take', false, 'ids', (select jsonb_agg(diff_id) from ops_colibri_diffs where piece_id = p1 and field = 'price' and status = 'open')), 'Alex');
  drop table if exists _ov_new, _cat_facet_stage_v2;
  perform cat_load(pg_temp.reg_payload(changed), 'reg test 4b');
  assert not exists (select 1 from ops_colibri_diffs where piece_id = p1 and field = 'price' and status = 'open'), 'a value turned down earlier is not raised again either';
  drop table if exists _ov_new, _cat_facet_stage_v2;
  perform cat_load(pg_temp.reg_payload((select jsonb_agg(case when e->>'serial' = 'ZS-S001' then e || '{"price_uzs":1750}'::jsonb else e end) from jsonb_array_elements(changed) e)), 'reg test 4c');

  -- take Colibri's size
  r := stk_diff_decide(jsonb_build_object('take', true, 'ids', jsonb_build_array(d_size)), 'Alex');
  assert r = '{"kept":0,"taken":1,"skipped":0}'::jsonb and (select size from ops_pieces where piece_id = p1) = '56', format('taken: %s', r);
  assert (select count(*) from ops_piece_changes where piece_id = p1 and field = 'size' and old_value = '54' and new_value = '56'
            and source = 'colibri_review' and actor = 'Alex') = 1, 'the change is in the piece''s history';
  assert (select size_keys from cat_models where model_id = 'ZS-M1') @> array['56'], 'and reaches the catalogue';
  -- take Colibri's design: article, design and colour move together
  perform stk_diff_decide(jsonb_build_object('take', true, 'ids', jsonb_build_array(d_design)), 'Alex');
  assert (select variant_id from ops_pieces where piece_id = p1) = 'ZS-M1-YG' and (select qty_stock from cat_variants where variant_id = 'ZS-M1-YG') = 2, 'design taken, catalogue follows';

  -- Colibri comes round to our value: the open line closes by itself
  drop table if exists _ov_new, _cat_facet_stage_v2;
  perform cat_load(pg_temp.reg_payload((select jsonb_agg(case when e->>'serial' = 'ZS-S001' then e || '{"price_uzs":1000}'::jsonb else e end) from jsonb_array_elements(changed) e)), 'reg test 5');
  assert not exists (select 1 from ops_colibri_diffs where piece_id = p1 and status = 'open'), 'agreement closes the line';
  assert (select status from ops_colibri_diffs where piece_id = p1 and field = 'price' and colibri = '1750') = 'superseded', 'closed as superseded';

  -- bulk by filter; a piece sold meanwhile is skipped and its line closed
  drop table if exists _ov_new, _cat_facet_stage_v2;
  perform cat_load(pg_temp.reg_payload((select jsonb_agg(case e->>'serial' when 'ZS-S001' then e || '{"price_uzs":1800}'::jsonb
                                                              when 'ZS-S002' then e || '{"price_uzs":1900}'::jsonb
                                                              when 'ZS-S003' then e || '{"price_uzs":1950}'::jsonb else e end) from jsonb_array_elements(changed) e)), 'reg test 6');
  assert (stk_diff_list('{"field":"price"}'::jsonb)->>'total')::int = 3, 'three price lines open';
  update ops_pieces set state = 'sold' where piece_id = p3;
  r := stk_diff_decide('{"take":true,"filters":{"field":"price"}}'::jsonb, 'Alex');
  assert r = '{"kept":0,"taken":2,"skipped":1}'::jsonb, format('bulk: %s', r);
  assert (select price_uzs from ops_pieces where piece_id = p2) = 1900 and (select price_uzs from ops_pieces where piece_id = p3) = 1100, 'sold piece untouched';
  assert (select status from ops_colibri_diffs where piece_id = p3 and field = 'price' order by diff_id desc limit 1) = 'superseded', 'its line is closed';
  assert (stk_diff_list('{}'::jsonb)->>'total')::int = 0, 'nothing left open';
  update ops_pieces set state = 'in_stock' where piece_id = p3;

  -- a piece on its way arrives: its first price comes with it, with no line to review
  drop table if exists _ov_new, _cat_facet_stage_v2;
  perform cat_load(pg_temp.reg_payload(base || '[{"serial":"ZS-T001","variant_id":"ZS-M2-WG","size":null,"price_uzs":2100}]'::jsonb), 'reg test 6b');
  assert (select (state, price_uzs) = ('in_stock', 2100) from ops_pieces where serial = 'ZS-T001'), 'arrived with its first price';
  assert (select count(*) from ops_piece_changes c join ops_pieces o using (piece_id) where o.serial = 'ZS-T001' and c.source = 'colibri_first_load' and c.new_value = '2100') = 1
     and not exists (select 1 from ops_colibri_diffs d join ops_pieces o using (piece_id) where o.serial = 'ZS-T001'), 'recorded, nothing to review';
  update ops_colibri_diffs set status = 'superseded' where status = 'open';

  -- a colour Colibri drops while we still hold a piece under it stays in the catalogue
  drop table if exists _ov_new, _cat_facet_stage_v2;
  perform cat_load(pg_temp.reg_payload((select jsonb_agg(case when e->>'variant_id' = 'ZS-M1-YG' then e || '{"variant_id":"ZS-M1-WG"}'::jsonb else e end) from jsonb_array_elements(base) e), 'ZS-M1-YG'), 'reg test 7');
  assert exists (select 1 from cat_variants where variant_id = 'ZS-M1-YG') and (select qty_stock from cat_variants where variant_id = 'ZS-M1-YG') = 2
     and (select in_stock from cat_variants where variant_id = 'ZS-M1-YG'), 'a held piece keeps its colour in the catalogue';

  assert position('from ops_pieces where piece_id = any(v_pieces) order by piece_id for update' in pg_get_functiondef('public.stk_diff_decide(jsonb,text)'::regprocedure)) between 1
       and position('for update of x' in pg_get_functiondef('public.stk_diff_decide(jsonb,text)'::regprocedure)), 'a decision locks the pieces before their lines, as a load does';
  assert position('lock table ops_pieces in exclusive mode' in pg_get_functiondef('public.cat_load(jsonb,text)'::regprocedure)) > 0, 'the load still takes the register first';

  assert not has_table_privilege('anon', 'public.ops_colibri_diffs', 'select') and not has_table_privilege('authenticated', 'public.ops_colibri_diffs', 'select')
     and not has_function_privilege('anon', 'public.stk_diff_list(jsonb)', 'execute')
     and not has_function_privilege('authenticated', 'public.stk_diff_decide(jsonb,text)', 'execute'), 'closed to the page';
end $$;
select 'reg_t4 ok' as result;
rollback;
