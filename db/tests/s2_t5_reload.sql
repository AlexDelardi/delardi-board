-- Sprint 2, Task 5: catalogue reload keeps variant ids, reports, photos and pieces; syncs stock. Rolled back.
begin;
do $$
declare payload jsonb; payload2 jsonb; r jsonb; rep bigint; n_ev int;
  v_rep text; v_gone text; v_clone text; clone_attrs int; n_photos int;
begin
  if not exists (select 1 from ops_pieces) then perform ops_initial_fill('Alex'); end if;  -- live register is filled since 11 Nov
  create temp table t5_pieces on commit drop as select piece_id from ops_pieces;
  create temp table t5_variants on commit drop as select variant_id from cat_variants;
  n_photos := (select count(*) from cat_photos);
  n_ev := (select count(*) from ops_piece_events);

  -- a report pinned to a historical variant (no pieces, nothing in transit, no overlay)
  select v.variant_id into v_rep from cat_variants v
   where not exists (select 1 from cat_pieces p where p.variant_id = v.variant_id)
     and not exists (select 1 from cat_incoming i where i.variant_id = v.variant_id)
     and not exists (select 1 from cat_overlay o where o.variant_id = v.variant_id)
   order by v.variant_id limit 1;
  insert into cat_reports(model_id, variant_id, message, reported_by)
  select model_id, variant_id, 's2 test report', 'test' from cat_variants where variant_id = v_rep
  returning id into rep;

  payload := jsonb_build_object(
    'built', 's2 test',
    'models', (select jsonb_agg(to_jsonb(m)) from cat_models m),
    'variants', (select jsonb_agg(to_jsonb(v)) from cat_variants v),
    'pieces', (select jsonb_agg(jsonb_build_object('serial', serial, 'variant_id', variant_id, 'size', size, 'price_uzs', price_uzs)) from cat_pieces),
    'attributes', (select jsonb_agg(jsonb_build_object('variant_id', variant_id, 'key', key, 'value', value, 'value_num', value_num, 'flag', flag)) from cat_attributes),
    'links', coalesce((select jsonb_agg(to_jsonb(l)) from cat_links l), '[]'),
    'expected', (select jsonb_agg(to_jsonb(e)) from cat_expected_keys e));

  -- T1: a reload of the same data keeps everything
  r := cat_load(payload, 's2 test');
  assert (select count(*) from ops_pieces) = (select count(*) from t5_pieces)
     and not exists (select piece_id from t5_pieces except select piece_id from ops_pieces), 'same pieces';
  assert not exists (select variant_id from t5_variants except select variant_id from cat_variants)
     and not exists (select variant_id from cat_variants except select variant_id from t5_variants), 'same variant ids';
  assert (select count(*) from cat_photos) = n_photos, 'same photo count';
  assert (select variant_id from cat_reports where id = rep) = v_rep, 'report keeps its variant';
  assert (select count(*) from ops_piece_events) = n_ev, format('no new events: %s', r->'ops');
  assert (select count(*) from ops_review) = 0, 'no reviews';
  assert r ? 'ops' and (r->>'models_removed')::int = 0 and (r->>'photos_unlinked')::int = 0, format('result keys %s', r);

  -- T2: second load, with three variants left out of the payload:
  --   v_rep   (has a report)            → kept, marked out of stock
  --   v_gone  (nothing points at it)    → removed
  --   v_clone (in transit only, cloned) → kept with its attributes
  select v.variant_id into v_gone from cat_variants v
   where v.variant_id <> v_rep
     and not exists (select 1 from cat_pieces p where p.variant_id = v.variant_id)
     and not exists (select 1 from cat_incoming i where i.variant_id = v.variant_id)
     and not exists (select 1 from cat_overlay o where o.variant_id = v.variant_id)
     and not exists (select 1 from cat_reports x where x.variant_id = v.variant_id)
   order by v.variant_id desc limit 1;
  select v.variant_id into v_clone from cat_variants v
   where exists (select 1 from cat_incoming i where i.variant_id = v.variant_id)
     and not exists (select 1 from cat_pieces p where p.variant_id = v.variant_id)
     and exists (select 1 from cat_attributes a where a.variant_id = v.variant_id)
   order by v.variant_id limit 1;
  assert v_gone is not null and v_clone is not null, 'test needs a removable and a clone variant';
  clone_attrs := (select count(*) from cat_attributes where variant_id = v_clone);
  update cat_variants set in_stock = true where variant_id = v_rep;   -- stale flag the load must clear

  payload2 := payload
    || jsonb_build_object('variants', (select jsonb_agg(e) from jsonb_array_elements(payload->'variants') e
                                        where e->>'variant_id' not in (v_rep, v_gone, v_clone)))
    || jsonb_build_object('attributes', (select jsonb_agg(e) from jsonb_array_elements(payload->'attributes') e
                                          where e->>'variant_id' not in (v_rep, v_gone, v_clone)));
  -- helpers' scratch tables live until commit; a real load is one transaction, the test runs two
  drop table if exists _ov_new, _cat_facet_stage_v2;
  r := cat_load(payload2, 's2 test 2');
  assert (r->'ops'->>'arrived')::int = 0 and (r->'ops'->>'in_transit')::int = 0
     and (r->'ops'->>'review_raised')::int = 0 and (r->'ops'->>'review_closed')::int = 0
     and (r->'ops'->>'refreshed')::int > 0, format('second load ops %s', r->'ops');
  assert exists (select 1 from cat_variants where variant_id = v_rep and not in_stock and qty_stock = 0), 'reported variant kept, out of stock';
  assert (select variant_id from cat_reports where id = rep) = v_rep, 'report still linked';
  assert not exists (select 1 from cat_variants where variant_id = v_gone), 'unused variant removed';
  assert (select count(*) from cat_attributes where variant_id = v_clone) = clone_attrs, 'clone keeps its attributes';
  assert (select count(*) from cat_photos) = n_photos, 'photos unchanged';
end $$;
select 's2_t5 ok' as result;
rollback;
