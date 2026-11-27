-- One register, step 4: a Colibri load no longer rewrites pieces we hold.
--   ops_sync_pieces  from 20261127_reg_1_price.sql: step 2 only marks a held piece as seen, fills an empty barcode
--                    and the shipping date. Where Colibri says something else about price, size, barcode or design
--                    (article + design + colour, which move together), a line is raised in ops_colibri_diffs.
--                    A piece that arrives (in transit -> in stock) takes its first price from the load.
--   cat_load         from 20261127_reg_3_catalogue_live.sql: a design or colour Colibri no longer sends is kept
--                    while we hold a piece of it.
--   stk_diff_list / stk_diff_decide: the review. "Keep ours" is remembered for that Colibri value; "take" changes
--                    the piece and writes its history (ops_piece_changes, source colibri_review).

create table public.ops_colibri_diffs (
  diff_id      bigserial primary key,
  piece_id     uuid not null references public.ops_pieces(piece_id) on delete cascade,
  field        text not null check (field in ('price', 'size', 'barcode', 'design')),
  ours         text,
  colibri      text,
  colibri_data jsonb,            -- design: {article, model_id, variant_id}
  raised_run   bigint,
  raised_at    timestamptz not null default now(),
  status       text not null default 'open' check (status in ('open', 'kept', 'taken', 'superseded')),
  decided_by   text,
  decided_at   timestamptz
);
create unique index ops_colibri_diffs_open on public.ops_colibri_diffs(piece_id, field) where status = 'open';
create index ops_colibri_diffs_piece on public.ops_colibri_diffs(piece_id, field, diff_id desc);
alter table public.ops_colibri_diffs enable row level security;
revoke all on table public.ops_colibri_diffs from public, anon, authenticated;
revoke all on sequence public.ops_colibri_diffs_diff_id_seq from public, anon, authenticated;

-- Open differences, 100 a page: {brand?, field?, page?}.
create function public.stk_diff_list(p jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with open_all as (
    select d.diff_id, d.piece_id, o.brand, o.serial, o.article, d.field, d.ours, d.colibri, d.raised_at
      from ops_colibri_diffs d join ops_pieces o on o.piece_id = d.piece_id
     where d.status = 'open'),
  f as (
    select * from open_all a
     where (nullif(btrim(p->>'brand'), '') is null or a.brand = btrim(p->>'brand'))
       and (nullif(btrim(p->>'field'), '') is null or a.field = btrim(p->>'field'))),
  pg as (select greatest(coalesce(nullif(p->>'page', '')::int, 1), 1) n)
  select jsonb_build_object(
    'total', (select count(*) from f),
    'open_all', (select count(*) from open_all),
    'open_by_field', coalesce((select jsonb_object_agg(x.field, x.n) from (select field, count(*) n from open_all group by field) x), '{}'::jsonb),
    'brands', coalesce((select jsonb_agg(b order by b) from (select distinct brand b from open_all) x), '[]'::jsonb),
    'page', (select n from pg), 'per_page', 100,
    'rows', coalesce((select jsonb_agg(to_jsonb(r)) from (
               select * from f order by brand, serial, field, diff_id limit 100 offset ((select n from pg) - 1) * 100) r), '[]'::jsonb));
$$;
revoke execute on function public.stk_diff_list(jsonb) from public, anon, authenticated;

-- Decides differences: {take: boolean, ids: [...]} or {take, filters: {brand?, field?}} (everything open the filters show).
create function public.stk_diff_decide(p jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d record; o ops_pieces%rowtype; v_take boolean; v_kept int := 0; v_taken int := 0; v_skipped int := 0;
  has_ids boolean := coalesce(jsonb_typeof(p->'ids') = 'array', false); has_f boolean := coalesce(jsonb_typeof(p->'filters') = 'object', false);
begin
  if not ops_has_right(p_actor, 'manage_stock') then raise exception 'Your account cannot change stock.'; end if;
  if jsonb_typeof(p->'take') is distinct from 'boolean' or has_ids = has_f or (has_ids and jsonb_array_length(p->'ids') = 0) then
    raise exception 'Say which differences to decide.';
  end if;
  v_take := (p->>'take')::boolean;
  for d in
    select x.* from ops_colibri_diffs x join ops_pieces pc on pc.piece_id = x.piece_id
     where x.status = 'open'
       and (not has_ids or x.diff_id in (select (e #>> '{}')::bigint from jsonb_array_elements(p->'ids') e))
       and (not has_f or ((nullif(btrim(p->'filters'->>'brand'), '') is null or pc.brand = btrim(p->'filters'->>'brand'))
                      and (nullif(btrim(p->'filters'->>'field'), '') is null or x.field = btrim(p->'filters'->>'field'))))
     order by x.diff_id
     for update of x
  loop
    select * into o from ops_pieces where piece_id = d.piece_id for update;
    if not v_take then
      update ops_colibri_diffs set status = 'kept', decided_by = p_actor, decided_at = now() where diff_id = d.diff_id;
      v_kept := v_kept + 1;
      continue;
    end if;
    -- a piece that left since the line was raised, or a colour no longer in the catalogue: nothing to change
    if o.state in ('sold', 'not_received')
       or (d.field = 'design' and not exists (select 1 from cat_variants v where v.variant_id = d.colibri_data->>'variant_id')) then
      update ops_colibri_diffs set status = 'superseded', decided_by = p_actor, decided_at = now() where diff_id = d.diff_id;
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if d.field = 'price' then
      insert into ops_piece_changes(piece_id, field, old_value, new_value, source, actor) values (o.piece_id, 'price', o.price_uzs::text, d.colibri, 'colibri_review', p_actor);
      update ops_pieces set price_uzs = d.colibri::bigint, updated_at = now() where piece_id = o.piece_id;
    elsif d.field = 'size' then
      insert into ops_piece_changes(piece_id, field, old_value, new_value, source, actor) values (o.piece_id, 'size', o.size, d.colibri, 'colibri_review', p_actor);
      update ops_pieces set size = d.colibri, updated_at = now() where piece_id = o.piece_id;
    elsif d.field = 'barcode' then
      insert into ops_piece_changes(piece_id, field, old_value, new_value, source, actor) values (o.piece_id, 'barcode', o.barcode, d.colibri, 'colibri_review', p_actor);
      update ops_pieces set barcode = d.colibri, updated_at = now() where piece_id = o.piece_id;
    else
      insert into ops_piece_changes(piece_id, field, old_value, new_value, source, actor) values (o.piece_id, 'design', o.variant_id, d.colibri, 'colibri_review', p_actor);
      update ops_pieces set article = coalesce(d.colibri_data->>'article', article), model_id = d.colibri_data->>'model_id',
                            variant_id = d.colibri_data->>'variant_id', updated_at = now() where piece_id = o.piece_id;
    end if;
    update ops_colibri_diffs set status = 'taken', decided_by = p_actor, decided_at = now() where diff_id = d.diff_id;
    v_taken := v_taken + 1;
  end loop;
  return jsonb_build_object('kept', v_kept, 'taken', v_taken, 'skipped', v_skipped);
end $$;
revoke execute on function public.stk_diff_decide(jsonb, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ops_sync_pieces(p_run bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_arrived int := 0; v_transit int := 0; v_refreshed int := 0; v_raised int := 0; v_closed int := 0; n int;
  v_ours int := 0; v_diffs int := 0;
begin
  -- this load: stock first, then incoming serials that are not in stock
  create temp table ops_sync_load on commit drop as
  select distinct on (l.brand, l.k) l.*
    from (
      select m.brand, upper(btrim(p.serial)) k, btrim(p.serial) serial, m.article, m.model_id,
             p.variant_id, p.size, null::date shipped_on, 'in_stock' src, 1 pri, p.barcode, p.price_uzs
        from cat_pieces p
        join cat_variants v on v.variant_id = p.variant_id
        join cat_models   m on m.model_id   = v.model_id
      union all
      select m.brand, upper(btrim(i.serial)), btrim(i.serial), coalesce(i.article, m.article), m.model_id,
             i.variant_id, i.size, i.shipped_on, 'in_transit', 2, null::text, null::bigint
        from cat_incoming i
        left join cat_variants v on v.variant_id = i.variant_id
        join cat_models m on m.model_id = coalesce(i.model_id, v.model_id)
       where not exists (select 1 from cat_pieces s where upper(btrim(s.serial)) = upper(btrim(i.serial)))
    ) l
   order by l.brand, l.k, l.pri;

  -- 1. in transit, now in stock → arrived
  with moved as (
    -- a piece that was on its way had no price yet: its first price comes with its arrival
    update ops_pieces o set state = 'in_stock', state_since = now(), updated_at = now(),
                            price_uzs = coalesce(o.price_uzs, l.price_uzs)
      from ops_sync_load l
     where o.state = 'in_transit' and l.src = 'in_stock'
       and o.brand = l.brand and upper(btrim(o.serial)) = l.k
    returning o.piece_id, o.price_uzs, (select x.price_uzs is null from ops_pieces x where x.piece_id = o.piece_id) was_unpriced)
  , pr as (
    insert into ops_piece_changes(piece_id, field, old_value, new_value, source, actor)
    select piece_id, 'price', null, price_uzs::text, 'colibri_first_load', 'catalogue load' from moved where was_unpriced and price_uzs is not null
    returning piece_id)
  insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor)
  select piece_id, 'in_transit', 'in_stock', 'arrived', 'cat_run', p_run::text, 'catalogue load' from moved;
  get diagnostics v_arrived = row_count;

  -- 2. every live piece in this load is marked as seen. Nothing we hold is rewritten: the load only fills an
  --    empty barcode and the shipping date. What Colibri says differently waits in ops_colibri_diffs for a person.
  update ops_pieces o
     set shipped_on = coalesce(l.shipped_on, o.shipped_on), barcode = coalesce(o.barcode, l.barcode),
         last_seen_run = p_run, last_seen_at = now()
    from ops_sync_load l
   where o.state not in ('sold', 'not_received') and o.brand = l.brand and upper(btrim(o.serial)) = l.k;
  get diagnostics v_refreshed = row_count;

  create temp table ops_sync_cmp on commit drop as
  select o.piece_id, f.field, f.ours, f.colibri, f.data
    from ops_pieces o
    join ops_sync_load l on o.brand = l.brand and upper(btrim(o.serial)) = l.k
    cross join lateral (values
      ('price',   o.price_uzs::text,                l.price_uzs::text,              null::jsonb),
      ('size',    nullif(btrim(o.size), ''),        nullif(btrim(l.size), ''),      null::jsonb),
      ('barcode', nullif(btrim(o.barcode), ''),     nullif(btrim(l.barcode), ''),   null::jsonb),
      ('design',  o.variant_id,                     l.variant_id,
                  jsonb_build_object('article', l.article, 'model_id', l.model_id, 'variant_id', l.variant_id))
    ) f(field, ours, colibri, data)
   where o.state not in ('sold', 'not_received');
  -- an open line Colibri no longer backs (it agrees with us now, or says something else) is closed
  update ops_colibri_diffs d set status = 'superseded', decided_at = now()
    from ops_sync_cmp c
   where d.piece_id = c.piece_id and d.field = c.field and d.status = 'open'
     and (c.colibri is null or c.colibri is not distinct from c.ours or d.colibri is distinct from c.colibri);
  -- an open line still standing shows our value as it is today
  update ops_colibri_diffs d set ours = c.ours
    from ops_sync_cmp c
   where d.piece_id = c.piece_id and d.field = c.field and d.status = 'open' and d.ours is distinct from c.ours;
  -- a new line, unless the same Colibri value was already turned down ("keep ours") for this piece and field
  insert into ops_colibri_diffs(piece_id, field, ours, colibri, colibri_data, raised_run)
  select c.piece_id, c.field, c.ours, c.colibri, c.data, p_run
    from ops_sync_cmp c
   where c.colibri is not null and c.colibri is distinct from c.ours
     and not exists (select 1 from ops_colibri_diffs d where d.piece_id = c.piece_id and d.field = c.field and d.status = 'open')
     and not coalesce((select d.status = 'kept' and d.colibri = c.colibri
                         from ops_colibri_diffs d
                        where d.piece_id = c.piece_id and d.field = c.field and d.status in ('kept', 'taken')
                        order by d.diff_id desc limit 1), false);
  get diagnostics v_diffs = row_count;
  drop table ops_sync_cmp;

  -- 3. auto-close reviews that no longer apply
  update ops_review r
     set status = 'auto_closed', resolved_at = now(), resolved_by = 'catalogue load'
    from ops_pieces o
   where r.piece_id = o.piece_id and r.status = 'open'
     and o.state not in ('sold', 'not_received')
     and ((r.kind in ('missing_from_export', 'dropped_from_incoming')
           and exists (select 1 from ops_sync_load l where l.brand = o.brand and l.k = upper(btrim(o.serial))))
       or (r.kind = 'overdue_in_transit' and o.state <> 'in_transit'));
  get diagnostics v_closed = row_count;

  -- 4. new pieces (no live piece with this brand + serial)
  -- a loaded serial whose piece the Delardi sales tool sold (and no live piece holds it): not created, not re-opened
  create temp table ops_sync_ours on commit drop as
  select distinct on (l.brand, l.k) l.brand, l.k, l.serial, o.piece_id, t.ticket_no
    from ops_sync_load l
    join ops_pieces o on o.state = 'sold' and o.brand = l.brand and upper(btrim(o.serial)) = l.k
    join ops_ticket_lines tl on tl.line_id = o.sold_line_id
    join ops_tickets t on t.ticket_id = tl.ticket_id and t.source = 'delardi'
   where not exists (select 1 from ops_pieces x
                      where x.state not in ('sold', 'not_received') and x.brand = l.brand and upper(btrim(x.serial)) = l.k)
   order by l.brand, l.k, o.state_since desc nulls last;
  v_ours := (select count(*) from ops_sync_ours);
  insert into ops_review(piece_id, kind, raised_run, note)
  select u.piece_id, 'ticket_conflict', p_run, format('serial %s is in the stock load but was sold on %s', u.serial, u.ticket_no)
    from ops_sync_ours u
   where not exists (select 1 from ops_review r where r.piece_id = u.piece_id and r.kind = 'ticket_conflict' and r.status = 'open');
  get diagnostics n = row_count;
  v_raised := v_raised + n;

  create temp table ops_sync_new on commit drop as
  select l.* from ops_sync_load l
   where not exists (select 1 from ops_pieces o
                      where o.state not in ('sold', 'not_received') and o.brand = l.brand and upper(btrim(o.serial)) = l.k)
     and not exists (select 1 from ops_sync_ours u where u.brand = l.brand and u.k = l.k);
  v_raised := v_raised + (select count(*) from ops_sync_new l
                           where exists (select 1 from ops_pieces o where o.state in ('sold', 'not_received')
                                            and o.brand = l.brand and upper(btrim(o.serial)) = l.k));
  with ins as (
    insert into ops_pieces(store_id, brand, serial, article, model_id, variant_id, size, state, shipped_on,
                           last_seen_run, last_seen_at, barcode, price_uzs)
    select 1, brand, serial, article, model_id, variant_id, size, src, shipped_on, p_run, now(), barcode, price_uzs from ops_sync_new
    returning piece_id, state, brand, serial, price_uzs)
  , pr as (
    -- the first price of a new piece comes from Colibri; after that only our tools change it
    insert into ops_piece_changes(piece_id, field, old_value, new_value, source, actor)
    select piece_id, 'price', null, price_uzs::text, 'colibri_first_load', 'catalogue load' from ins where price_uzs is not null
    returning piece_id)
  , ev as (
    insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor)
    select piece_id, null, state, case when state = 'in_stock' then 'arrived' else 'initial_load' end,
           'cat_run', p_run::text, 'catalogue load' from ins
    returning piece_id)
  insert into ops_review(piece_id, kind, raised_run, note)
  select i.piece_id, 'serial_reused', p_run, 'serial was sold or not received before'
    from ins i
   where exists (select 1 from ops_pieces o where o.state in ('sold', 'not_received') and o.brand = i.brand
                                              and upper(btrim(o.serial)) = upper(btrim(i.serial)));
  v_arrived := v_arrived + (select count(*) from ops_sync_new where src = 'in_stock');
  v_transit := (select count(*) from ops_sync_new where src = 'in_transit');

  -- 5. live pieces on the floor not in this load and held by no ticket line → review (once)
  insert into ops_review(piece_id, kind, raised_run)
  select o.piece_id, 'missing_from_export', p_run
    from ops_pieces o
   where o.state in ('in_stock', 'reserved', 'booked_out', 'damaged')
     and not exists (select 1 from ops_sync_load l where l.brand = o.brand and l.k = upper(btrim(o.serial)))
     and not exists (select 1 from ops_ticket_lines t where t.piece_id = o.piece_id)
     and not exists (select 1 from ops_review r
                      where r.piece_id = o.piece_id and r.kind = 'missing_from_export' and r.status = 'open');
  get diagnostics n = row_count;
  v_raised := v_raised + n;

  -- 6. in transit but gone from the incoming list without arriving → review (once)
  insert into ops_review(piece_id, kind, raised_run)
  select o.piece_id, 'dropped_from_incoming', p_run
    from ops_pieces o
   where o.state = 'in_transit'
     and not exists (select 1 from ops_sync_load l where l.brand = o.brand and l.k = upper(btrim(o.serial)))
     and not exists (select 1 from ops_review r
                      where r.piece_id = o.piece_id and r.kind = 'dropped_from_incoming' and r.status = 'open');
  get diagnostics n = row_count;
  v_raised := v_raised + n;

  -- 7. in transit > 60 days after shipment (or first sighting) → review; after "still coming", 60 days after the answer
  insert into ops_review(piece_id, kind, raised_run)
  select o.piece_id, 'overdue_in_transit', p_run
    from ops_pieces o
   where o.state = 'in_transit'
     and coalesce(o.shipped_on, o.first_seen_at::date) < current_date - 60
     and not exists (select 1 from ops_review r
                      where r.piece_id = o.piece_id and r.kind in ('overdue_in_transit', 'dropped_from_incoming')
                        and (r.status = 'open' or r.resolved_at > now() - interval '60 days'));
  get diagnostics n = row_count;
  v_raised := v_raised + n;

  drop table ops_sync_load;
  drop table ops_sync_new;
  drop table ops_sync_ours;
  return jsonb_build_object('arrived', v_arrived, 'in_transit', v_transit, 'refreshed', v_refreshed,
                            'review_raised', v_raised, 'review_closed', v_closed,
                            'sold_by_us_in_load', v_ours, 'differences', v_diffs);
end $$;

revoke execute on function public.ops_sync_pieces(bigint) from public, anon, authenticated;

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
       and model_id not in (select model_id from cat_incoming)
       and model_id not in (select x.model_id from ops_pieces x where x.model_id is not null and x.state not in ('sold', 'not_received'));   -- we hold a piece of it
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
     and not exists (select 1 from cat_overlay x where x.variant_id = v.variant_id)
     and not exists (select 1 from ops_pieces x where x.variant_id = v.variant_id and x.state not in ('sold', 'not_received'));   -- we hold a piece in it
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
