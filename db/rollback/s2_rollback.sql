-- Sprint 2 rollback: puts the database back as it was before Sprint 2 (11 Nov 2026).
-- DO NOT RUN unless Sprint 2 must be undone. It deletes the piece register, its history, tickets and
-- review items. Take a backup first (pg_dump, see S1 report §7). Runs as one transaction.
--
-- Order: the old catalogue load first (so the next load does not call the sync), then the links into the
-- CRM, then functions, then tables.

begin;

-- 1. cat_load exactly as it was before migration s2_cat_load_v2 (copied from production 11 Nov 2026)
CREATE OR REPLACE FUNCTION public.cat_load(p jsonb, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '120s'
AS $function$
declare run_id bigint; c jsonb;
begin
  perform set_config('cat.skip_v2', 'on', true);  -- one v2 rebuild at load end, not inside the mid-load overlay
  insert into cat_import_runs(source_file, source_built, notes)
    values (p_source, p->>'built', 'full load') returning id into run_id;
  delete from cat_links where true; delete from cat_attributes where true; delete from cat_pieces where true;
  delete from cat_expected_keys where true; delete from cat_variants where true;
  -- models still shipping (cat_incoming) are kept, with their photos, until Colibri has them
  delete from cat_models where model_id not in (select e->>'model_id' from jsonb_array_elements(p->'models') e)
    and model_id not in (select model_id from cat_incoming);
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
      from jsonb_array_elements(p->'variants') e) s;
  insert into cat_pieces(serial, variant_id, size, price_uzs, import_run)
    select x.serial, x.variant_id, x.size, x.price_uzs, run_id
    from jsonb_to_recordset(p->'pieces') as x(serial text, variant_id text, size text, price_uzs bigint);
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
  c := jsonb_build_object(
    'models', (select count(*) from cat_models), 'variants', (select count(*) from cat_variants),
    'pieces', (select count(*) from cat_pieces), 'attributes', (select count(*) from cat_attributes),
    'links', (select count(*) from cat_links), 'expected', (select count(*) from cat_expected_keys),
    'overlay', (select count(*) from cat_overlay),
    'in_transit', (select coalesce(sum(qty_transit),0) from cat_variants));
  update cat_import_runs set counts = c where id = run_id;
  return c || jsonb_build_object('run', run_id);
end $function$;

-- 2. CRM purchases: drop the ticket link, restore the old cascade (s2_protect_sales)
drop index if exists public.crm_transactions_ticket_line;
alter table public.crm_transactions drop column if exists ticket_line_id;
alter table public.crm_transactions drop constraint crm_transactions_client_id_fkey;
alter table public.crm_transactions add constraint crm_transactions_client_id_fkey
  foreign key (client_id) references public.crm_clients(client_id) on delete cascade;

-- 3. functions (s2_ops_functions, s2_ops_sync, s2_protect_sales)
drop function if exists public.ops_apply_ticket_line(uuid, text);
drop function if exists public.ops_sync_pieces(bigint);
drop function if exists public.ops_initial_fill(text);
drop function if exists public.ops_resolve_review(bigint, text, text, text);
drop function if exists public.ops_set_state(uuid, text, text, text, text, date);
drop function if exists public.ops_move_state(uuid, text, text, text, text, date, text, text, text);
drop function if exists public.ops_has_right(text, text);

-- 4. tables (s2_ops_tables) and the manage-stock right
alter table public.ops_pieces drop constraint if exists ops_pieces_sold_line_fkey;
drop table if exists public.ops_review;
drop table if exists public.ops_piece_events;
drop function if exists public.ops_piece_events_immutable();
drop table if exists public.ops_ticket_payments;
drop table if exists public.ops_ticket_lines;
drop table if exists public.ops_pieces;
drop table if exists public.ops_tickets;
drop table if exists public.ops_stores;
alter table public.board_users drop column if exists can_manage_stock;

commit;
