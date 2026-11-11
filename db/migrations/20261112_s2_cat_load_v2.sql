-- Sprint 2, migration 3: catalogue load keeps colour variants (and what points at them) and syncs pieces.
-- Spec: docs/specs/2026-11-11-s2-foundation-design.md §7, §9 (T1, T2). Plan Task 5.
--
-- Changes against the previous cat_load (kept verbatim in db/rollback/s2_rollback.sql):
--   * variants are upserted, not deleted and re-inserted — error reports, brand-catalogue edits and
--     in-transit clones keep their variant;
--   * a variant missing from the payload is removed only when nothing points at it (pieces, incoming,
--     reports, overlay); one that is kept is marked out of stock;
--   * attributes are replaced only for variants in the payload (clones keep theirs);
--   * the load report adds models_removed, photos_unlinked (counted before models go) and ops (stock sync).
-- Everything else is unchanged.

create or replace function public.cat_load(p jsonb, p_source text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
 set statement_timeout to '120s'
as $function$
declare run_id bigint; c jsonb; v_models_removed int; v_photos_unlinked int; v_variants_removed int;
  v_variants_kept int; v_ops jsonb;
begin
  perform set_config('cat.skip_v2', 'on', true);  -- one v2 rebuild at load end, not inside the mid-load overlay
  insert into cat_import_runs(source_file, source_built, notes)
    values (p_source, p->>'built', 'full load') returning id into run_id;

  create temp table _load_variant_ids on commit drop as
    select distinct e->>'variant_id' variant_id from jsonb_array_elements(p->'variants') e;

  delete from cat_links where true;
  delete from cat_attributes a where a.variant_id in (select variant_id from _load_variant_ids);
  delete from cat_pieces where true;
  delete from cat_expected_keys where true;

  -- models still shipping (cat_incoming) are kept, with their photos, until Colibri has them
  create temp table _load_models_gone on commit drop as
    select model_id from cat_models
     where model_id not in (select e->>'model_id' from jsonb_array_elements(p->'models') e)
       and model_id not in (select model_id from cat_incoming);
  v_models_removed := (select count(*) from _load_models_gone);
  v_photos_unlinked := (select count(*) from cat_photos where model_id in (select model_id from _load_models_gone));
  delete from cat_models where model_id in (select model_id from _load_models_gone);

  insert into cat_models
    select (r).* from (select jsonb_populate_record(null::cat_models,
      e || jsonb_build_object('import_run', run_id, 'updated_at', now(), 'search_text', '')) r
      from jsonb_array_elements(p->'models') e) s
  on conflict (model_id) do update set
    article = excluded.article, brand = excluded.brand, brand_raw = excluded.brand_raw, category = excluded.category,
    retail_category = excluded.retail_category, subcategory = excluded.subcategory, collection = excluded.collection,
    model_name = excluded.model_name, gender = excluded.gender, material = excluded.material,
    name_en = excluded.name_en, name_ru = excluded.name_ru, in_stock = excluded.in_stock,
    qty_stock = excluded.qty_stock, price_min_uzs = excluded.price_min_uzs, price_max_uzs = excluded.price_max_uzs,
    latest_arrival_year = excluded.latest_arrival_year, arrival_years = excluded.arrival_years,
    variant_count = excluded.variant_count, completeness = excluded.completeness,
    missing_crucial = excluded.missing_crucial, has_unconfirmed = excluded.has_unconfirmed,
    import_run = excluded.import_run, updated_at = excluded.updated_at;

  insert into cat_variants
    select (r).* from (select jsonb_populate_record(null::cat_variants,
      e || jsonb_build_object('import_run', run_id, 'updated_at', now())) r
      from jsonb_array_elements(p->'variants') e) s
  on conflict (variant_id) do update set
    model_id = excluded.model_id, colour_code = excluded.colour_code, colour_name_en = excluded.colour_name_en,
    colour_name_ru = excluded.colour_name_ru, material = excluded.material, in_stock = excluded.in_stock,
    qty_stock = excluded.qty_stock, qty_in = excluded.qty_in, qty_sold = excluded.qty_sold,
    price_uzs = excluded.price_uzs, arrival_years = excluded.arrival_years,
    description_ru = excluded.description_ru, description_en = excluded.description_en,
    found_online = excluded.found_online, confidence = excluded.confidence, sources = excluded.sources,
    conflicts = excluded.conflicts, notes = excluded.notes, sort_order = excluded.sort_order,
    import_run = excluded.import_run, updated_at = excluded.updated_at, qty_transit = excluded.qty_transit;

  insert into cat_pieces(serial, variant_id, size, price_uzs, import_run)
    select x.serial, x.variant_id, x.size, x.price_uzs, run_id
    from jsonb_to_recordset(p->'pieces') as x(serial text, variant_id text, size text, price_uzs bigint);

  -- variants Colibri no longer sends: removed if nothing points at them, else kept and out of stock
  delete from cat_variants v
   where v.variant_id not in (select variant_id from _load_variant_ids)
     and not exists (select 1 from cat_pieces x where x.variant_id = v.variant_id)
     and not exists (select 1 from cat_incoming x where x.variant_id = v.variant_id)
     and not exists (select 1 from cat_reports x where x.variant_id = v.variant_id)
     and not exists (select 1 from cat_overlay x where x.variant_id = v.variant_id);
  get diagnostics v_variants_removed = row_count;
  update cat_variants v set in_stock = false, qty_stock = 0
   where v.variant_id not in (select variant_id from _load_variant_ids)
     and not exists (select 1 from cat_incoming x where x.variant_id = v.variant_id)
     and (v.in_stock or v.qty_stock <> 0);
  v_variants_kept := (select count(*) from cat_variants where variant_id not in (select variant_id from _load_variant_ids));

  insert into cat_attributes(variant_id, key, value, value_num, flag, import_run)
    select x.variant_id, x.key, x.value, x.value_num, x.flag, run_id
    from jsonb_to_recordset(p->'attributes') as x(variant_id text, key text, value text, value_num numeric, flag text);
  insert into cat_links select * from jsonb_populate_recordset(null::cat_links, p->'links');
  insert into cat_expected_keys select * from jsonb_populate_recordset(null::cat_expected_keys, p->'expected');
  perform cat_merge_sizes();       -- one model per design: size-coded references fold into it
  perform cat_apply_incoming();    -- pieces shipped but not in Colibri yet: "in transit"
  perform cat_apply_overlay();     -- brand-catalogue values (brand wins) survive every reload
  perform cat_rebuild_search();
  perform cat_rebuild_facets();
  perform cat_rebuild_facets_v2_safe();   -- keep the v2 filter cache in step with this load
  perform cat_link_transactions();   -- CRM purchase lines follow the new catalogue
  v_ops := ops_sync_pieces(run_id);  -- piece register follows the new catalogue (S2 §7)
  c := jsonb_build_object(
    'models', (select count(*) from cat_models), 'variants', (select count(*) from cat_variants),
    'pieces', (select count(*) from cat_pieces), 'attributes', (select count(*) from cat_attributes),
    'links', (select count(*) from cat_links), 'expected', (select count(*) from cat_expected_keys),
    'overlay', (select count(*) from cat_overlay),
    'in_transit', (select coalesce(sum(qty_transit),0) from cat_variants),
    'models_removed', v_models_removed, 'photos_unlinked', v_photos_unlinked,
    'variants_removed', v_variants_removed, 'variants_kept_not_in_load', v_variants_kept,
    'ops', v_ops);
  update cat_import_runs set counts = c where id = run_id;
  drop table _load_variant_ids;
  drop table _load_models_gone;
  return c || jsonb_build_object('run', run_id);
end $function$;
