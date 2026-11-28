-- One register, step 3: the Catalogue shows what the piece register (ops_pieces) holds, at once.
--   * Counts, in-stock flags, in-transit counts, price range and sizes of every design are derived from ops_pieces:
--     available = state 'in_stock' only (a reserved, booked-out or damaged piece is not offered), in transit = 'in_transit'.
--   * Statement triggers on ops_pieces refresh the designs a change touches (cheap, a few rows) and mark the filter
--     caches for a rebuild. The rebuild takes seconds on the full catalogue, so it does not run inside a sale or a
--     state change: cat_refresh_if_dirty() runs it before the next Catalogue read (catalogue-api calls it).
--   * The filter and search rebuilds read the register through two views instead of cat_pieces / cat_incoming.
--   * cat_load: holds the piece register for itself while it runs (reads go on), so it cannot deadlock with a sale;
--     the register takes in the load first, then counts are refreshed from the register and the caches rebuilt.
-- cat_pieces stays as the record of what the last Colibri load said. Only the load and its own helpers
-- (cat_merge_sizes, cat_apply_incoming, ops_sync_pieces) read it.

alter table public.cat_facet_revision add column dirty boolean not null default false;
insert into public.cat_facet_revision(singleton) values (true) on conflict do nothing;

create view public.cat_live_pieces with (security_invoker = true) as
  select o.piece_id::text as id, o.serial, o.variant_id, o.size, o.price_uzs, o.barcode
    from public.ops_pieces o where o.state = 'in_stock' and o.variant_id is not null;
create view public.cat_live_incoming with (security_invoker = true) as
  select o.serial, o.variant_id, o.model_id, o.size, o.shipped_on,
         (select i.shipment from public.cat_incoming i where upper(btrim(i.serial)) = upper(btrim(o.serial)) limit 1) as shipment
    from public.ops_pieces o where o.state = 'in_transit' and o.variant_id is not null;
revoke all on table public.cat_live_pieces, public.cat_live_incoming from public, anon, authenticated;

-- Counts, flags, price range and sizes of the given designs (all when null), from the register.
create function public.cat_refresh_stock(p_models text[] default null) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  -- One refresh at a time: two sales of the same colour committed side by side would each count the other's piece
  -- as still in stock. Waiting here means the counts below are read after the other change is committed.
  perform pg_advisory_xact_lock(hashtext('cat_refresh_stock'));
  update cat_variants v set qty_stock = c.s, in_stock = c.s > 0, qty_transit = c.t
    from (select t.variant_id,
                 (count(*) filter (where o.state = 'in_stock'))::int s,
                 (count(*) filter (where o.state = 'in_transit'))::int t
            from cat_variants t left join ops_pieces o on o.variant_id = t.variant_id
           where p_models is null or t.model_id = any(p_models)
           group by t.variant_id) c
   where v.variant_id = c.variant_id
     and (v.qty_stock, v.in_stock, v.qty_transit) is distinct from (c.s, c.s > 0, c.t);

  update cat_models m
     set qty_stock = x.s, in_stock = x.s > 0, qty_transit = x.t,
         price_min_uzs = coalesce(x.pmin, m.price_min_uzs), price_max_uzs = coalesce(x.pmax, m.price_max_uzs),   -- nothing in stock: the last known price stays
         size_keys = x.sizes
    from (select m2.model_id,
                 coalesce((select sum(v.qty_stock) from cat_variants v where v.model_id = m2.model_id), 0)::int s,
                 coalesce((select sum(v.qty_transit) from cat_variants v where v.model_id = m2.model_id), 0)::int t,
                 l.pmin, l.pmax, coalesce(l.sizes, '{}') sizes
            from cat_models m2
            left join lateral (
              select min(p.price_uzs) pmin, max(p.price_uzs) pmax,
                     array_agg(distinct btrim(p.size) order by btrim(p.size)) filter (where p.size is not null and btrim(p.size) <> '') sizes
                from cat_live_pieces p join cat_variants v using (variant_id) where v.model_id = m2.model_id) l on true
           where p_models is null or m2.model_id = any(p_models)) x
   where m.model_id = x.model_id
     and (m.qty_stock, m.in_stock, m.qty_transit, m.price_min_uzs, m.price_max_uzs, m.size_keys)
         is distinct from (x.s, x.s > 0, x.t, coalesce(x.pmin, m.price_min_uzs), coalesce(x.pmax, m.price_max_uzs), x.sizes);
  get diagnostics n = row_count;
  update cat_facet_revision set dirty = true where singleton and not dirty;
  return n;
end $$;
revoke execute on function public.cat_refresh_stock(text[]) from public, anon, authenticated;

-- Rebuilds search and the filter caches when a piece change left them behind. True when it rebuilt.
create function public.cat_refresh_if_dirty() returns boolean
language plpgsql security definer set search_path = public, pg_temp set statement_timeout to '120s' as $$
begin
  if not coalesce((select dirty from cat_facet_revision where singleton), false) then return false; end if;
  if not pg_try_advisory_xact_lock(hashtext('cat_refresh_if_dirty')) then return false; end if;   -- another read is rebuilding
  update cat_facet_revision set dirty = false where singleton;
  perform cat_rebuild_search();
  perform cat_rebuild_facets();
  perform cat_rebuild_facets_v2_safe();
  return true;
end $$;
revoke execute on function public.cat_refresh_if_dirty() from public, anon, authenticated;

create function public.cat_stock_changed_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare ids text[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct v.model_id) into ids from new_rows n join cat_variants v on v.variant_id = n.variant_id;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct v.model_id) into ids from old_rows o join cat_variants v on v.variant_id = o.variant_id;
  else
    select array_agg(distinct v.model_id) into ids
      from old_rows o join new_rows n using (piece_id)
      join cat_variants v on v.variant_id in (o.variant_id, n.variant_id)
     where (o.state, o.variant_id, o.size, o.price_uzs, o.serial) is distinct from (n.state, n.variant_id, n.size, n.price_uzs, n.serial);
  end if;
  if ids is not null then perform cat_refresh_stock(ids); end if;
  return null;
end $$;
revoke execute on function public.cat_stock_changed_trg() from public, anon, authenticated;

create trigger ops_pieces_cat_stock_ins after insert on public.ops_pieces
  referencing new table as new_rows for each statement execute function public.cat_stock_changed_trg();
create trigger ops_pieces_cat_stock_upd after update on public.ops_pieces
  referencing old table as old_rows new table as new_rows for each statement execute function public.cat_stock_changed_trg();
create trigger ops_pieces_cat_stock_del after delete on public.ops_pieces
  referencing old table as old_rows for each statement execute function public.cat_stock_changed_trg();

-- The rebuilds read the register.
do $do$
declare d text; n text;
begin
  -- search: a design is found by the serial of any piece on the floor, held or not
  d := pg_get_functiondef('public.cat_rebuild_search()'::regprocedure);
  n := replace(d, 'from cat_pieces p join cat_variants v using (variant_id) where v.model_id = m.model_id',
                  'from ops_pieces p join cat_variants v using (variant_id) where v.model_id = m.model_id and p.state in (''in_stock'', ''reserved'', ''booked_out'', ''damaged'')');
  if n = d or n ~* '\mcat_pieces\M' then raise exception 'reg_3: cat_rebuild_search not patched as expected'; end if;
  execute n;

  d := pg_get_functiondef('public.cat_rebuild_facets()'::regprocedure);
  n := regexp_replace(d, '\mcat_pieces\M', 'cat_live_pieces', 'g');
  if n = d then raise exception 'reg_3: cat_rebuild_facets not patched as expected'; end if;
  execute n;

  d := pg_get_functiondef('public.cat_rebuild_facets_v2()'::regprocedure);
  n := regexp_replace(regexp_replace(d, '\mpublic\.cat_pieces\M', 'public.cat_live_pieces', 'g'), '\mpublic\.cat_incoming\M', 'public.cat_live_incoming', 'g');
  if n = d or n ~* '\mcat_pieces\M' or n ~* '\mcat_incoming\M' then raise exception 'reg_3: cat_rebuild_facets_v2 not patched as expected'; end if;
  execute n;
end $do$;

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
  -- A load and a sale must not wait on each other: the load takes the piece register first and for itself
  -- (reads go on), so anything changing a piece either finishes before the load starts or waits for it to end.
  lock table ops_pieces in exclusive mode;
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

  insert into cat_pieces(serial, variant_id, size, price_uzs, import_run, barcode)
    select x.serial, x.variant_id, x.size, x.price_uzs, run_id, nullif(btrim(x.barcode), '')
    from jsonb_to_recordset(p->'pieces') as x(serial text, variant_id text, size text, price_uzs bigint, barcode text);

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
  perform cat_link_transactions();   -- CRM purchase lines follow the new catalogue
  v_ops := ops_sync_pieces(run_id);  -- the piece register takes in what this load brings
  perform cat_refresh_stock();       -- counts, prices and sizes are the register's, never the load's own
  perform cat_rebuild_search();
  perform cat_rebuild_facets();
  perform cat_rebuild_facets_v2_safe();   -- keep the v2 filter cache in step with this load
  update cat_facet_revision set dirty = false where singleton;
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

-- Switch-over: the stored counts become the register's.
select public.cat_refresh_stock();
