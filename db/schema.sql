--
-- PostgreSQL database dump
--

\restrict 0YQWGODP9ZgQ4DAIojEK3ow6oGWZJUxmwBBBtWTCxmnLD5HGMd3yT9ceY2khFTU

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: crm_flag; Type: DOMAIN; Schema: public; Owner: -
--

CREATE DOMAIN public.crm_flag AS text
	CONSTRAINT crm_flag_check CHECK ((VALUE = ANY (ARRAY['client'::text, 'delardi'::text, 'agreed'::text, 'rule'::text, 'manual'::text, 'gap'::text, 'conflict'::text, 'none'::text])));


--
-- Name: cat_apply_incoming(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_apply_incoming() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n integer; r record;
begin
  -- 1. a shipped reference that is another size of a design we have: attach to that model, size on the piece
  update cat_incoming i set model_id = x.model_id, variant_id = x.variant_id, size = coalesce(i.size, x.size)
  from (select i2.serial, coalesce(al.model_id, sib.model_id) model_id, coalesce(al.variant_id, sib.variant_id) variant_id,
               cat_size_from_ref(i2.article) size
        from cat_incoming i2
        left join cat_article_alias al on upper(al.article) = upper(i2.article)
        left join lateral (select v.model_id, v.variant_id from cat_variants v join cat_models m using (model_id)
                           join cat_size_coded_brands b on b.brand = m.brand
                           where left(m.model_id, length(m.model_id)-3) = left(i2.article, length(i2.article)-3)
                             and m.model_id <> i2.article
                             and split_part(v.variant_id, '-', 2) = split_part(i2.variant_id, '-', 2)
                           order by m.in_stock desc, m.model_id limit 1) sib on true
        where not exists (select 1 from cat_variants v where v.variant_id = i2.variant_id)
          and coalesce(al.model_id, sib.model_id) is not null) x
  where x.serial = i.serial;
  -- 2. a reference not in the catalogue at all: copy the model from clone_from (kept for brands without size codes)
  for r in select distinct i.model_id, i.variant_id, i.clone_from, tv.model_id as tmodel
           from cat_incoming i join cat_variants tv on tv.variant_id = i.clone_from
           where i.clone_from is not null and not exists (select 1 from cat_variants v where v.variant_id = i.variant_id) loop
    if not exists (select 1 from cat_models where model_id = r.model_id) then
      insert into cat_models select (jsonb_populate_record(null::cat_models, to_jsonb(m) || jsonb_build_object(
          'model_id', r.model_id, 'article', r.model_id, 'in_stock', false, 'qty_stock', 0,
          'price_min_uzs', null, 'price_max_uzs', null, 'variant_count', 1, 'arrival_years', '{}'::int[],
          'latest_arrival_year', null, 'updated_at', now()))).*
        from cat_models m where m.model_id = r.tmodel;
    end if;
    insert into cat_variants select (jsonb_populate_record(null::cat_variants, to_jsonb(v) || jsonb_build_object(
        'variant_id', r.variant_id, 'model_id', r.model_id, 'in_stock', false, 'qty_stock', 0, 'qty_in', 0, 'qty_sold', 0,
        'price_uzs', null, 'arrival_years', '{}'::int[], 'updated_at', now()))).*
      from cat_variants v where v.variant_id = r.clone_from;
    insert into cat_attributes(variant_id, key, value, value_num, flag, import_run)
      select r.variant_id, a.key, a.value, a.value_num, a.flag, a.import_run from cat_attributes a
      where a.variant_id = r.clone_from and a.key not in ('receipt_name', 'ring_size');
  end loop;
  -- 3. counts: shipped pieces whose serial is not in stock yet
  update cat_variants v set qty_transit = coalesce((select count(*) from cat_incoming i
      where i.variant_id = v.variant_id and not exists (select 1 from cat_pieces p where p.serial = i.serial)), 0)
    where v.qty_transit <> coalesce((select count(*) from cat_incoming i
      where i.variant_id = v.variant_id and not exists (select 1 from cat_pieces p where p.serial = i.serial)), 0);
  update cat_models m set qty_transit = coalesce((select sum(v.qty_transit) from cat_variants v where v.model_id = m.model_id), 0)
    where m.qty_transit <> coalesce((select sum(v.qty_transit) from cat_variants v where v.model_id = m.model_id), 0);
  select count(*) into n from cat_variants where qty_transit > 0;
  return n;
end $$;


--
-- Name: cat_apply_overlay(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_apply_overlay() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n integer; r record; added int;
begin
  -- keys each model gains for the first time (for completeness)
  create temp table _ov_new on commit drop as
    select v.model_id, count(distinct o.key) filter (where a.key is null) n_new
    from cat_overlay o join cat_variants v using (variant_id)
    left join cat_attributes a on a.variant_id = o.variant_id and a.key = o.key
    join cat_models m on m.model_id = v.model_id
    join cat_expected_keys e on e.category = m.category and e.key = o.key
    group by v.model_id;
  delete from cat_attributes a using cat_overlay o where a.variant_id = o.variant_id and a.key = o.key;
  insert into cat_attributes(variant_id, key, value, value_num, flag, import_run)
    select o.variant_id, o.key, o.value, o.value_num, 'confirmed', null
    from cat_overlay o join cat_variants v using (variant_id);
  get diagnostics n = row_count;
  -- model columns that mirror attributes
  update cat_models m set
    name_en = coalesce((select o.value from cat_overlay o join cat_variants v using (variant_id) where v.model_id = m.model_id and o.key = 'name_en' limit 1), m.name_en),
    name_ru = coalesce((select o.value from cat_overlay o join cat_variants v using (variant_id) where v.model_id = m.model_id and o.key = 'name_ru' limit 1), m.name_ru),
    model_name = coalesce((select o.value from cat_overlay o join cat_variants v using (variant_id) where v.model_id = m.model_id and o.key = 'model_name' limit 1), m.model_name),
    collection = coalesce((select o.value from cat_overlay o join cat_variants v using (variant_id) where v.model_id = m.model_id and o.key = 'collection' limit 1), m.collection),
    subcategory = coalesce((select o.value from cat_overlay o join cat_variants v using (variant_id) where v.model_id = m.model_id and o.key = 'subcategory' limit 1), m.subcategory)
  where m.model_id in (select v.model_id from cat_overlay o join cat_variants v using (variant_id));
  -- sources
  update cat_variants v set sources = (select array_agg(distinct s) from unnest(coalesce(v.sources, '{}') ||
      (select array_agg(distinct split_part(o.source, ', p.', 1)) from cat_overlay o where o.variant_id = v.variant_id)) s)
  where v.variant_id in (select variant_id from cat_overlay);
  -- completeness, crucial gaps, unconfirmed marks
  update cat_models m set
    completeness = least(100, m.completeness + round(100.0 * x.n_new / 33)),
    missing_crucial = coalesce((select array_agg(e.key order by e.sort_order) from cat_expected_keys e
        where e.category = m.category and e.crucial and not exists (select 1 from cat_attributes a join cat_variants v using (variant_id)
          where v.model_id = m.model_id and a.key = e.key)), '{}'),
    has_unconfirmed = exists (select 1 from cat_attributes a join cat_variants v using (variant_id)
          where v.model_id = m.model_id and a.flag = 'unconfirmed')
  from _ov_new x where x.model_id = m.model_id;
  -- v2 facet cache: refresh after a floor edit, but not when cat_load already
  -- owns the transaction (it sets cat.skip_v2 and rebuilds once at its end).
  if coalesce(current_setting('cat.skip_v2', true), 'off') <> 'on' then
    perform cat_rebuild_facets_v2_safe();
  end if;
  return n;
end $$;


--
-- Name: cat_filter_match_v2(jsonb, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_filter_match_v2(c jsonb, f jsonb, skip text DEFAULT ''::text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
select (skip='category' or ((f->'category' is null or f->'category'='null'::jsonb or f->'category'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'category')='array' then f->'category' else jsonb_build_array(f->'category') end) x where (c->'category') @> jsonb_build_array(x.value)))) is true)
 and (skip='types' or ((f->'types' is null or f->'types'='null'::jsonb or f->'types'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'types')='array' then f->'types' else jsonb_build_array(f->'types') end) x where (c->'types') @> jsonb_build_array(x.value)))) is true)
 and (skip='brands' or ((f->'brands' is null or f->'brands'='null'::jsonb or f->'brands'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'brands')='array' then f->'brands' else jsonb_build_array(f->'brands') end) x where (c->'brands') @> jsonb_build_array(x.value)))) is true)
 and (skip='collections' or ((f->'collections' is null or f->'collections'='null'::jsonb or f->'collections'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'collections')='array' then f->'collections' else jsonb_build_array(f->'collections') end) x where (c->'collections') @> jsonb_build_array(x.value)))) is true)
 and (skip='availability' or ((f->'availability' is null or f->'availability'='null'::jsonb or f->'availability'='[]'::jsonb or f->'availability'='"all"'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'availability')='array' then f->'availability' else jsonb_build_array(f->'availability') end) x where (c->'availability') @> jsonb_build_array(x.value)))) is true)
 and (skip='materials' or ((f->'materials' is null or f->'materials'='null'::jsonb or f->'materials'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'materials')='array' then f->'materials' else jsonb_build_array(f->'materials') end) x where (c->'materials') @> jsonb_build_array(x.value)))) is true)
 and (skip='stone_types' or ((f->'stone_types' is null or f->'stone_types'='null'::jsonb or f->'stone_types'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'stone_types')='array' then f->'stone_types' else jsonb_build_array(f->'stone_types') end) x where (c->'stone_types') @> jsonb_build_array(x.value)))) is true)
 and (skip='stone_presence' or ((f->'stone_presence' is null or f->'stone_presence'='null'::jsonb or f->'stone_presence'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'stone_presence')='array' then f->'stone_presence' else jsonb_build_array(f->'stone_presence') end) x where (c->'stone_presence') @> jsonb_build_array(x.value)))) is true)
 and (skip='movements' or ((f->'movements' is null or f->'movements'='null'::jsonb or f->'movements'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'movements')='array' then f->'movements' else jsonb_build_array(f->'movements') end) x where (c->'movements') @> jsonb_build_array(x.value)))) is true)
 and (skip='sizes' or ((f->'sizes' is null or f->'sizes'='null'::jsonb or f->'sizes'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'sizes')='array' then f->'sizes' else jsonb_build_array(f->'sizes') end) x where (c->'sizes') @> jsonb_build_array(x.value)))) is true)
 and (skip='genders' or ((f->'genders' is null or f->'genders'='null'::jsonb or f->'genders'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'genders')='array' then f->'genders' else jsonb_build_array(f->'genders') end) x where (c->'genders') @> jsonb_build_array(x.value)))) is true)
 and (skip='case_diameters_mm' or (((coalesce(jsonb_array_length(f->'case_diameters_mm'),0)=0 and not coalesce((f->>'case_unspecified')::boolean,false)) or ((c->'case_diameters_mm') <@ (f->'case_diameters_mm') and (c->'case_diameters_mm') <> '[]'::jsonb) or (coalesce((f->>'case_unspecified')::boolean,false) and (c->'case_diameters_mm')='[]'::jsonb))) is true)
 and (skip='price' or (((f->>'price_min_uzs' is null or (c->>'price')::numeric >= (f->>'price_min_uzs')::numeric) and (f->>'price_max_uzs' is null or (c->>'price')::numeric <= (f->>'price_max_uzs')::numeric))) is true)
 and (((not coalesce((f->>'incomplete')::boolean,false) or (c->>'incomplete')::boolean)) is true)
 and ((not exists(select 1 from regexp_split_to_table(lower(coalesce(f->>'q','')), '\s+') w where w<>'' and case when (c->'known_serials') ? w then coalesce(c->>'serial','')<>w else position(w in c->>'search')=0 end)) is true)
$$;


--
-- Name: cat_filter_v2(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_filter_v2(p_request jsonb) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
with normalised as materialized (select * from public.cat_filter_candidates_v2),
size_catalog as materialized (select size_key,size_meta from public.cat_size_options),
input as (
  select p_request->'filters' f
),
request as (
  select f || jsonb_build_object('sizes',coalesce((select jsonb_agg(e.value order by e.value) from jsonb_array_elements(f->'sizes') e where not exists (
    select 1 from size_catalog sc where to_jsonb(sc.size_key)=e.value and (
      (f->>'category' is not null and f->>'category'<>'jewellery') or
      (jsonb_array_length(f->'types')>0 and not (f->'types') @> jsonb_build_array(sc.size_meta->'product_type'))
    ))),'[]'::jsonb)) f,
    coalesce((select jsonb_agg(jsonb_build_object('field','sizes','removed',e.value,'reason','incompatible_type')) from jsonb_array_elements(f->'sizes') e where exists (
      select 1 from size_catalog sc where to_jsonb(sc.size_key)=e.value and (
        (f->>'category' is not null and f->>'category'<>'jewellery') or
        (jsonb_array_length(f->'types')>0 and not (f->'types') @> jsonb_build_array(sc.size_meta->'product_type'))
      ))),'[]'::jsonb) adjustments
  from input
),
facts as materialized (
  select n.model_id,n.variant_id,n.sort_order,n.origin,n.price,n.size_meta,n.size_key,
    n.c || jsonb_build_object('known_serials',(select coalesce(jsonb_agg(distinct p.serial),'[]'::jsonb) from public.cat_filter_candidates_v2 p
      where p.serial in (select regexp_split_to_table(lower((select f->>'q' from request)),'\s+')))) c
  from normalised n
),
checks as materialized (select facts.*,array_remove(array[case when ((f->'category' is null or f->'category'='null'::jsonb or f->'category'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'category')='array' then f->'category' else jsonb_build_array(f->'category') end) x where (c->'category') @> jsonb_build_array(x.value)))) is not true then 'category'::text end,
case when ((f->'types' is null or f->'types'='null'::jsonb or f->'types'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'types')='array' then f->'types' else jsonb_build_array(f->'types') end) x where (c->'types') @> jsonb_build_array(x.value)))) is not true then 'types'::text end,
case when ((f->'brands' is null or f->'brands'='null'::jsonb or f->'brands'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'brands')='array' then f->'brands' else jsonb_build_array(f->'brands') end) x where (c->'brands') @> jsonb_build_array(x.value)))) is not true then 'brands'::text end,
case when ((f->'collections' is null or f->'collections'='null'::jsonb or f->'collections'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'collections')='array' then f->'collections' else jsonb_build_array(f->'collections') end) x where (c->'collections') @> jsonb_build_array(x.value)))) is not true then 'collections'::text end,
case when ((f->'availability' is null or f->'availability'='null'::jsonb or f->'availability'='[]'::jsonb or f->'availability'='"all"'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'availability')='array' then f->'availability' else jsonb_build_array(f->'availability') end) x where (c->'availability') @> jsonb_build_array(x.value)))) is not true then 'availability'::text end,
case when ((f->'materials' is null or f->'materials'='null'::jsonb or f->'materials'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'materials')='array' then f->'materials' else jsonb_build_array(f->'materials') end) x where (c->'materials') @> jsonb_build_array(x.value)))) is not true then 'materials'::text end,
case when ((f->'stone_types' is null or f->'stone_types'='null'::jsonb or f->'stone_types'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'stone_types')='array' then f->'stone_types' else jsonb_build_array(f->'stone_types') end) x where (c->'stone_types') @> jsonb_build_array(x.value)))) is not true then 'stone_types'::text end,
case when ((f->'stone_presence' is null or f->'stone_presence'='null'::jsonb or f->'stone_presence'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'stone_presence')='array' then f->'stone_presence' else jsonb_build_array(f->'stone_presence') end) x where (c->'stone_presence') @> jsonb_build_array(x.value)))) is not true then 'stone_presence'::text end,
case when ((f->'movements' is null or f->'movements'='null'::jsonb or f->'movements'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'movements')='array' then f->'movements' else jsonb_build_array(f->'movements') end) x where (c->'movements') @> jsonb_build_array(x.value)))) is not true then 'movements'::text end,
case when ((f->'sizes' is null or f->'sizes'='null'::jsonb or f->'sizes'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'sizes')='array' then f->'sizes' else jsonb_build_array(f->'sizes') end) x where (c->'sizes') @> jsonb_build_array(x.value)))) is not true then 'sizes'::text end,
case when ((f->'genders' is null or f->'genders'='null'::jsonb or f->'genders'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'genders')='array' then f->'genders' else jsonb_build_array(f->'genders') end) x where (c->'genders') @> jsonb_build_array(x.value)))) is not true then 'genders'::text end,
case when (((coalesce(jsonb_array_length(f->'case_diameters_mm'),0)=0 and not coalesce((f->>'case_unspecified')::boolean,false)) or ((c->'case_diameters_mm') <@ (f->'case_diameters_mm') and (c->'case_diameters_mm') <> '[]'::jsonb) or (coalesce((f->>'case_unspecified')::boolean,false) and (c->'case_diameters_mm')='[]'::jsonb))) is not true then 'case_diameters_mm'::text end,
case when (((f->>'price_min_uzs' is null or (c->>'price')::numeric >= (f->>'price_min_uzs')::numeric) and (f->>'price_max_uzs' is null or (c->>'price')::numeric <= (f->>'price_max_uzs')::numeric))) is not true then 'price'::text end,
case when ((not coalesce((f->>'incomplete')::boolean,false) or (c->>'incomplete')::boolean)) is not true then 'incomplete'::text end,
case when (not exists(select 1 from regexp_split_to_table(lower(coalesce(f->>'q','')), '\s+') w where w<>'' and case when (c->'known_serials') ? w then coalesce(c->>'serial','')<>w else position(w in c->>'search')=0 end)) is not true then 'q'::text end],null) failed_groups from facts cross join request),
matched as materialized (select * from checks where cardinality(failed_groups)=0),
models as materialized (
  select m.model_id,m.brand,m.collection,m.model_name,m.latest_arrival_year,m.completeness,
    bool_or(t.origin='boutique') has_boutique,bool_or(t.origin='transit') has_transit,min(t.price) eligible_min,max(t.price) eligible_max,
    coalesce(array_agg(distinct t.variant_id order by t.variant_id) filter(where t.variant_id is not null),'{}'::text[]) matched_variant_ids,
    (array_agg(t.variant_id order by (t.origin='boutique') desc,(t.origin='transit') desc,t.sort_order nulls last,t.variant_id))[1] preferred_variant_id
  from matched t join public.cat_models m using(model_id)
  group by m.model_id,m.brand,m.collection,m.model_name,m.latest_arrival_year,m.completeness
),
ordered as (
  select x.*,row_number() over(order by
    case when p_request->>'sort'='newest' then x.has_boutique end desc nulls last,
    case when p_request->>'sort'='newest' then x.has_transit end desc nulls last,
    case when p_request->>'sort'='newest' then x.latest_arrival_year end desc nulls last,
    case when p_request->>'sort' in ('newest','brand') then x.brand end asc nulls last,
    case when p_request->>'sort'='brand' then x.collection end asc nulls last,
    case when p_request->>'sort'='brand' then x.model_name end asc nulls last,
    case when p_request->>'sort'='price_asc' then x.eligible_min end asc nulls last,
    case when p_request->>'sort'='price_desc' then x.eligible_max end desc nulls last,
    case when p_request->>'sort'='completeness' then x.completeness end asc nulls last,x.model_id) rn from models x
),
groups(key,mode) as (values ('category','single'),('types','multi'),('brands','multi'),('collections','multi'),('availability','single'),('materials','multi'),('stone_types','multi'),('stone_presence','single'),('movements','multi'),('case_diameters_mm','multi'),('sizes','multi'),('genders','multi')),
universe as materialized (
  select group_key key,value from public.cat_filter_options_v2
  union select 'case_diameters_mm','"unspecified"'::jsonb
  union select g.key,e.value from groups g cross join request r cross join lateral jsonb_array_elements(case when g.key='case_diameters_mm' then r.f->g.key
    when jsonb_typeof(r.f->g.key)='array' then r.f->g.key when r.f->g.key <> 'null'::jsonb then jsonb_build_array(r.f->g.key) else '[]'::jsonb end) e
),
group_matches as (
  select g.key,t.model_id,t.c from groups g cross join checks t where t.failed_groups <@ array[g.key]
),
counts as materialized (
  select u.key,u.value,coalesce(z.n,0) n from universe u left join (
    select key,value,count(*) n from (select distinct t.key,v.value,t.model_id from group_matches t
      cross join lateral jsonb_array_elements(case when t.key='case_diameters_mm' and t.c->t.key='[]'::jsonb then '["unspecified"]'::jsonb else t.c->t.key end) v
     ) distinct_models group by key,value
  ) z on z.key=u.key and z.value=u.value
),
facet_rows as (
  select g.key,g.mode,
    case when g.key in ('movements','case_diameters_mm') then (r.f->>'category' is null or r.f->>'category'='watch') and (jsonb_array_length(r.f->'types')=0 or r.f->'types' @> '["watch"]'::jsonb)
      when g.key='sizes' then r.f->>'category' is null or r.f->>'category'='jewellery' else true end applicable,
    coalesce((select jsonb_agg(jsonb_build_object('value',ct.value,'count',ct.n,
      'selected',coalesce(case when ct.key='case_diameters_mm' and ct.value='"unspecified"'::jsonb then (r.f->>'case_unspecified')::boolean
        when jsonb_typeof(r.f->ct.key)='array' then r.f->ct.key @> jsonb_build_array(ct.value) else r.f->ct.key=ct.value end,false),
      'disabled',ct.n=0 and not coalesce(case when ct.key='case_diameters_mm' and ct.value='"unspecified"'::jsonb then (r.f->>'case_unspecified')::boolean
        when jsonb_typeof(r.f->ct.key)='array' then r.f->ct.key @> jsonb_build_array(ct.value) else r.f->ct.key=ct.value end,false),
      'metadata',case when ct.key='sizes' then (select sc.size_meta || jsonb_build_object('provenance',(select jsonb_agg(distinct n.origin) from normalised n where n.size_key=sc.size_key)) from size_catalog sc where to_jsonb(sc.size_key)=ct.value limit 1) end) order by ct.value)
      from counts ct where ct.key=g.key),'[]'::jsonb) options
  from groups g cross join request r
),
revision as (select md5(coalesce((select max(id)::text from public.cat_import_runs),'0')||':'||counter::text) id from public.cat_facet_revision where singleton)
select case when p_request->>'action'='facets' and r.f='{"category":null,"types":[],"brands":[],"collections":[],"availability":"all","materials":[],"stone_types":[],"stone_presence":null,"movements":[],"case_diameters_mm":[],"case_unspecified":false,"sizes":[],"genders":[],"price_min_uzs":null,"price_max_uzs":null,"q":"","incomplete":false}'::jsonb and (select unfiltered_facets is not null from public.cat_facet_revision where singleton) then jsonb_build_object('filter_version',2,'normalised_filters',r.f,'adjustments',r.adjustments,'revision',revision.id,
  'total',(select total_models from public.cat_facet_revision where singleton),'facets',(select unfiltered_facets from public.cat_facet_revision where singleton)) else jsonb_build_object('filter_version',2,'normalised_filters',r.f,'adjustments',r.adjustments,'revision',revision.id,'total',(select count(distinct model_id) from matched)) ||
case when p_request->>'action'='facets' then jsonb_build_object('facets',(select jsonb_agg(to_jsonb(facet_rows) order by key) from facet_rows))
else jsonb_build_object('limit',(p_request->>'limit')::int,'offset',(p_request->>'offset')::int,'rows',coalesce((
  select jsonb_agg(
    (select jsonb_object_agg(e.key,e.value) from jsonb_each(to_jsonb(m)) e where e.key = any(array['model_id','article','brand','category','retail_category','subcategory','collection','model_name','gender','material','name_en','name_ru','in_stock','qty_stock','qty_transit','price_min_uzs','price_max_uzs','latest_arrival_year','variant_count','completeness','missing_crucial','has_unconfirmed','image_key','metal_keys','stone_keys','movement','case_mm'])) ||
    jsonb_build_object('matched_variant_ids',x.matched_variant_ids,'preferred_variant_id',x.preferred_variant_id,
      'price_min_uzs',x.eligible_min,'price_max_uzs',x.eligible_max,
      'eligible_availability',jsonb_build_object('boutique',x.has_boutique,'transit',x.has_transit),
      'eligible_attributes',(select jsonb_build_object('materials',t.c->'materials','stone_types',t.c->'stone_types','stone_presence',t.c->'stone_presence','movements',t.c->'movements','case_diameters_mm',t.c->'case_diameters_mm') from matched t where t.variant_id=x.preferred_variant_id limit 1),
      'colours',(select jsonb_agg(jsonb_build_object('variant_id',v.variant_id,'colour_code',v.colour_code,'in_stock',v.in_stock,'qty_transit',v.qty_transit) order by v.sort_order,v.variant_id) from public.cat_variants v where v.model_id=m.model_id)) order by x.rn)
  from ordered x join public.cat_models m using(model_id) where x.rn>(p_request->>'offset')::int and x.rn<=(p_request->>'offset')::int+(p_request->>'limit')::int
),'[]'::jsonb)) end end from request r cross join revision
$$;


--
-- Name: cat_link_transactions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_link_transactions() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n integer;
begin
  update crm_transactions t set cat_model_id = x.model_id, cat_variant_id = d.variant_id,
    cat_name_ru = d.name_ru, cat_name_en = d.name_en, cat_thumb_url = d.thumb_url
  from (select id, item, (cat_match_article(article)).* from crm_transactions) x
  cross join lateral cat_txn_display(x.model_id, x.variant_id, x.item) d
  where x.id = t.id and (t.cat_model_id, t.cat_variant_id, t.cat_name_ru, t.cat_name_en, t.cat_thumb_url)
    is distinct from (x.model_id, d.variant_id, d.name_ru, d.name_en, d.thumb_url);
  get diagnostics n = row_count;
  return n;
end $$;


--
-- Name: cat_load(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_load(p jsonb, p_source text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET statement_timeout TO '120s'
    AS $$
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
end $$;


--
-- Name: cat_match_article(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_match_article(a text, OUT model_id text, OUT variant_id text) RETURNS record
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with k as (select upper(regexp_replace(coalesce(a, ''), '[\s\-]+', '', 'g')) k)
  select coalesce(v.model_id, m.model_id, al.model_id), coalesce(v.variant_id, al.variant_id)
  from k
  left join lateral (select variant_id, model_id from cat_variants
                     where upper(regexp_replace(variant_id, '[\s\-]+', '', 'g')) = k.k order by sort_order limit 1) v on true
  left join lateral (select model_id from cat_models where model_id = k.k limit 1) m on true
  left join lateral (select x.model_id, x.variant_id from cat_article_alias x where upper(x.article) = k.k limit 1) al on true;
$$;


--
-- Name: cat_merge_sizes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_merge_sizes() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare g record; o record; canon text; cv text; n int := 0;
begin
  for g in select left(m.model_id, length(m.model_id)-3) base, array_agg(m.model_id order by m.in_stock desc, m.model_id) ids
           from cat_models m join cat_size_coded_brands b on b.brand = m.brand
           where length(m.model_id) > 6
           group by 1 having count(*) > 1 loop
    -- the established model stays: named in an alias, else the one with photos, else in stock, else the lowest reference
    canon := coalesce((select a.model_id from cat_article_alias a where a.model_id = any(g.ids) limit 1),
                      (select m.model_id from cat_models m where m.model_id = any(g.ids)
                       order by exists (select 1 from cat_photos p where p.model_id = m.model_id) desc, m.in_stock desc, m.model_id limit 1));
    for o in select model_id from cat_models where model_id = any(g.ids) and model_id <> canon loop
      for cv in select v.variant_id from cat_variants v where v.model_id = o.model_id loop
        declare tv text := (select t.variant_id from cat_variants t where t.model_id = canon
                             and t.colour_code is not distinct from (select colour_code from cat_variants where variant_id = cv) limit 1);
        begin
          if tv is null then
            update cat_variants set model_id = canon where variant_id = cv;   -- a colour the canonical model lacks
            tv := cv;
          else
            update cat_pieces p set variant_id = tv, size = coalesce(p.size, cat_size_from_ref(o.model_id)) where p.variant_id = cv;
            update cat_variants t set
              qty_stock = t.qty_stock + s.qty_stock, qty_in = coalesce(t.qty_in,0) + coalesce(s.qty_in,0),
              qty_sold = coalesce(t.qty_sold,0) + coalesce(s.qty_sold,0), in_stock = t.in_stock or s.in_stock,
              price_uzs = coalesce(s.price_uzs, t.price_uzs),
              arrival_years = (select array_agg(distinct y order by y) from unnest(coalesce(t.arrival_years,'{}') || coalesce(s.arrival_years,'{}')) y)
            from cat_variants s where t.variant_id = tv and s.variant_id = cv;
            insert into cat_attributes(variant_id, key, value, value_num, flag, import_run)
              select tv, a.key, a.value, a.value_num, a.flag, a.import_run from cat_attributes a
              where a.variant_id = cv and not exists (select 1 from cat_attributes b where b.variant_id = tv and b.key = a.key);
            delete from cat_attributes where variant_id = cv;
            delete from cat_variants where variant_id = cv;
          end if;
          insert into cat_article_alias(article, model_id, variant_id, size, reason)
            values (o.model_id, canon, tv, cat_size_from_ref(o.model_id), 'same design, another size (size-coded reference)')
            on conflict (article) do update set model_id = excluded.model_id, variant_id = excluded.variant_id;
        end;
      end loop;
      update cat_photos set model_id = canon where model_id = o.model_id
        and not exists (select 1 from cat_photos q where q.model_id = canon);
      delete from cat_models where model_id = o.model_id;
      n := n + 1;
    end loop;
    -- the canonical model's totals
    update cat_models m set
      in_stock = exists (select 1 from cat_variants v where v.model_id = m.model_id and v.in_stock),
      qty_stock = (select coalesce(sum(qty_stock),0) from cat_variants v where v.model_id = m.model_id),
      variant_count = (select count(*) from cat_variants v where v.model_id = m.model_id),
      price_min_uzs = coalesce((select min(p.price_uzs) from cat_pieces p join cat_variants v using (variant_id) where v.model_id = m.model_id), m.price_min_uzs),
      price_max_uzs = coalesce((select max(p.price_uzs) from cat_pieces p join cat_variants v using (variant_id) where v.model_id = m.model_id), m.price_max_uzs)
    where m.model_id = canon;
  end loop;
  return n;
end $$;


--
-- Name: cat_photos_relink(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_photos_relink() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update crm_transactions t set cat_variant_id = d.variant_id, cat_name_ru = d.name_ru, cat_name_en = d.name_en, cat_thumb_url = d.thumb_url
  from (select id, item, cat_model_id, (cat_match_article(article)).variant_id v0 from crm_transactions where cat_model_id = new.model_id) x
  cross join lateral cat_txn_display(x.cat_model_id, x.v0, x.item) d
  where t.id = x.id and t.cat_thumb_url is distinct from d.thumb_url;
  return null;
end $$;


--
-- Name: cat_rebuild_facets(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_rebuild_facets() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  metals text[][] := array[
    ['white_gold',  '(white|белое)\s*(gold|золото)|\mwg\M'],
    ['yellow_gold', '(yellow|жёлтое|желтое)\s*(gold|золото)|\myg\M'],
    ['rose_gold',   '(rose|red|pink|розовое|красное)\s*(gold|золото)|\m(pg|rg)\M|5n|4n'],
    ['platinum',    'platinum|платин'],
    ['silver',      'silver|серебр|\m925\M'],
    ['steel',       'steel|сталь'],
    ['titanium',    'titan|титан'],
    ['ceramic',     'ceramic|керамик'],
    ['carbon',      'carbon|карбон'],
    ['aluminium',   'alumin|алюмин'],
    ['rubber',      'rubber|каучук'],
    ['leather',     'leather|calf|alligator|кожа'],
    ['gold',        'gold|золот']];
  stones text[][] := array[
    ['diamond',     'diamond|бриллиант|алмаз'],
    ['lab_diamond', 'lab-grown|lab grown|лаборатор'],
    ['sapphire',    'sapphire|сапфир'],
    ['emerald',     'emerald|изумруд'],
    ['ruby',        'ruby|rubies|рубин'],
    ['rubellite',   'rubellite|рубел'],
    ['tsavorite',   'tsavorite|цаворит'],
    ['tanzanite',   'tanzanite|танзанит'],
    ['topaz',       'topaz|топаз'],
    ['amethyst',    'amethyst|аметист'],
    ['pearl',       '(?<!mother.of.)pearl|жемчуг'],
    ['mother_of_pearl', 'mother.of.pearl|перламутр|abalone'],
    ['opal',        '\mopal(?!escent)|опал(?!есц)'],
    ['turquoise',   'turquoise|бирюз'],
    ['malachite',   'malachite|малахит'],
    ['lapis',       'lapis|лазурит'],
    ['onyx',        'onyx|оникс'],
    ['agate',       'agate|агат'],
    ['crystal',     'crystal|кристал|opalescent|опалесц']];
  r record; txt text; mtxt text; mk text[]; sk text[]; i int;
begin
  for r in select m.model_id, m.material, m.category from cat_models m loop
    select lower(coalesce(string_agg(a.value, ' | '), '')) into txt
      from cat_attributes a join cat_variants v using (variant_id)
      where v.model_id = r.model_id and a.key in ('metal','metal_colour','fineness','case_material','bezel_material');
    select lower(coalesce(string_agg(coalesce(v.material,'') || ' ' || coalesce(v.colour_code,''), ' | '), '')) into mtxt
      from cat_variants v where v.model_id = r.model_id;
    txt := txt || ' | ' || lower(coalesce(r.material, '')) || ' | ' || mtxt;
    mk := '{}';
    for i in 1 .. array_length(metals, 1) loop
      if txt ~ metals[i][2] then mk := mk || metals[i][1]; end if;
    end loop;
    if mk && array['white_gold','yellow_gold','rose_gold'] then mk := array_remove(mk, 'gold'); end if;
    if r.category = 'watch' then mk := array_remove(array_remove(mk, 'leather'), 'rubber'); end if;

    select lower(coalesce(string_agg(a.value, ' | '), '')) into txt
      from cat_attributes a join cat_variants v using (variant_id)
      where v.model_id = r.model_id and a.key in ('stones','centre_stone_type','gem_set','natural_or_lab');
    sk := '{}';
    for i in 1 .. array_length(stones, 1) loop
      if txt ~ stones[i][2] then sk := sk || stones[i][1]; end if;
    end loop;

    update cat_models set metal_keys = mk, stone_keys = sk,
      movement = (select lower(a.value) from cat_attributes a join cat_variants v using (variant_id)
                  where v.model_id = r.model_id and a.key = 'movement_type' and lower(a.value) in ('automatic','quartz','manual') limit 1),
      case_mm = (select a.value_num from cat_attributes a join cat_variants v using (variant_id)
                 where v.model_id = r.model_id and a.key = 'case_diameter_mm' and a.value_num between 10 and 70 limit 1)
    where model_id = r.model_id;
  end loop;

  -- v6 (27 Oct 2026): the sizes a model has in stock, from its physical pieces.
  -- Used by the per-category size filter. Only in-stock piece sizes, cleaned of blanks.
  update cat_models set size_keys = '{}' where size_keys <> '{}';
  update cat_models m set size_keys = s.sizes
    from (select v.model_id, array_agg(distinct btrim(p.size) order by btrim(p.size)) as sizes
          from cat_pieces p join cat_variants v using (variant_id)
          where p.size is not null and btrim(p.size) <> ''
          group by v.model_id) s
   where s.model_id = m.model_id;
end $$;


--
-- Name: cat_rebuild_facets_v2(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_rebuild_facets_v2() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
declare previous_guard text := current_setting('delardi.facet_refresh_v2',true);
begin
  if previous_guard='on' then return; end if;
  perform set_config('delardi.facet_refresh_v2','on',true);
  perform 1 from public.cat_facet_revision where singleton for update;
  drop table if exists pg_temp._cat_facet_stage_v2;
  create temporary table _cat_facet_stage_v2 on commit drop as
  with attrs as materialized (
  select v.variant_id,
    coalesce(jsonb_object_agg(a.key,jsonb_build_object('value',a.value,'num',a.value_num,'flag',a.flag)) filter(where a.key is not null),'{}'::jsonb) a,
    coalesce(string_agg(a.value,' | ' order by a.key) filter(where a.key in ('metal','metal_colour','fineness','case_material','bezel_material')),'') metal_attr_text,
    coalesce(string_agg(a.value,' | ' order by a.key) filter(where a.key in ('stones','centre_stone_type','gem_set','natural_or_lab')),'') stone_attr_text
  from public.cat_variants v left join public.cat_attributes a using(variant_id)
  group by v.variant_id
),
variant_facts as materialized (
  select v.*, m.category, m.retail_category, x.a,
    lower(coalesce(x.metal_attr_text,'') || ' | ' || coalesce(m.material,'') || ' | ' || coalesce(v.material,'') || ' ' || coalesce(v.colour_code,'')) metal_text,
    lower(coalesce(x.stone_attr_text,'')) stone_text
  from (
    select v.* from public.cat_variants v
    union all
    select (jsonb_populate_record(null::public.cat_variants,jsonb_build_object('model_id',m.model_id))).*
      from public.cat_models m where not exists(select 1 from public.cat_variants v where v.model_id=m.model_id)
  ) v join public.cat_models m using(model_id) left join attrs x using(variant_id)
),
pieces as materialized (
  select v.model_id,v.variant_id,'boutique'::text origin,p.serial,p.size,p.price_uzs::numeric price from variant_facts v join public.cat_pieces p using(variant_id)
  union all
  select v.model_id,v.variant_id,'transit',i.serial,i.size,null::numeric from variant_facts v join public.cat_incoming i using(variant_id)
    where not exists(select 1 from public.cat_pieces p where p.serial=i.serial)
  union all
  select v.model_id,v.variant_id,'historical',null::text,
    case when v.retail_category='ring' and v.a->'ring_size'->>'flag' in ('confirmed','colibri_only') then v.a->'ring_size'->>'value'
      when v.retail_category in ('necklace','bracelet') and v.a->'chain_or_bracelet_length_cm'->>'flag' in ('confirmed','colibri_only')
      then coalesce(v.a->'chain_or_bracelet_length_cm'->>'num',v.a->'chain_or_bracelet_length_cm'->>'value') || ' cm' end,
    v.price_uzs::numeric from variant_facts v
    where not exists(select 1 from public.cat_pieces p where p.variant_id=v.variant_id)
      and not exists(select 1 from public.cat_incoming i where i.variant_id=v.variant_id and not exists(select 1 from public.cat_pieces p where p.serial=i.serial))
),
source as materialized (
  select v.*,p.origin,p.serial,p.price,p.size raw_size,
    case when v.retail_category in ('ring','necklace','bracelet') and nullif(btrim(p.size),'') is not null then
      jsonb_build_object('product_type',v.retail_category,
        'kind',case when v.retail_category='ring' then 'ring_size' when btrim(p.size) ~* '^[0-9]+([.,][0-9]+)?\s*cm$' then 'length' when btrim(p.size) in ('S','M','L','XS','XL') then 'named' else 'source_size' end,
        'system','unspecified',
        'unit',case when v.retail_category<>'ring' and btrim(p.size) ~* '^[0-9]+([.,][0-9]+)?\s*cm$' then 'cm' else null end,
        'value',case when v.retail_category<>'ring' and btrim(p.size) ~* '^[0-9]+([.,][0-9]+)?\s*cm$' then replace(regexp_replace(btrim(p.size),'\s*cm$','','i'),',','.') else btrim(p.size) end)
      end size_meta
  from variant_facts v join pieces p on p.model_id=v.model_id and p.variant_id is not distinct from v.variant_id
),
material_facets as materialized (
  select s.metal_text,s.category,coalesce((select jsonb_agg(k order by k) from (
      select distinct k from (values
        ('white_gold','(white|белое)\s*(gold|золото)|\mwg\M'),
        ('yellow_gold','(yellow|жёлтое|желтое)\s*(gold|золото)|\myg\M'),
        ('rose_gold','(rose|red|pink|розовое|красное)\s*(gold|золото)|\m(pg|rg)\M|5n|4n'),
        ('platinum','platinum|платин'),
        ('silver','silver|серебр|\m925\M'),
        ('steel','steel|сталь'),
        ('titanium','titan|титан'),
        ('ceramic','ceramic|керамик'),
        ('carbon','carbon|карбон'),
        ('aluminium','alumin|алюмин'),
        ('rubber','rubber|каучук'),
        ('leather','leather|calf|alligator|кожа'),
        ('gold','gold|золот')) d(k,pattern)
      where metal_text ~ pattern
        and not (category='watch' and k in ('rubber','leather'))
        and not (k='gold' and metal_text ~ '((white|белое)\s*(gold|золото)|\mwg\M)|((yellow|жёлтое|желтое)\s*(gold|золото)|\myg\M)|((rose|red|pink|розовое|красное)\s*(gold|золото)|\m(pg|rg)\M|5n|4n)')
    ) q),'[]'::jsonb) materials
  from (select distinct metal_text,category from source) s
),
stone_facets as materialized (
  select s.stone_text,coalesce((select jsonb_agg(k order by k) from (
      select distinct k from (values
        ('diamond','diamond|бриллиант|алмаз'),
        ('lab_diamond','lab-grown|lab grown|лаборатор'),
        ('sapphire','sapphire|сапфир'),
        ('emerald','emerald|изумруд'),
        ('ruby','ruby|rubies|рубин'),
        ('rubellite','rubellite|рубел'),
        ('tsavorite','tsavorite|цаворит'),
        ('tanzanite','tanzanite|танзанит'),
        ('topaz','topaz|топаз'),
        ('amethyst','amethyst|аметист'),
        ('pearl','(?<!mother.of.)pearl|жемчуг'),
        ('mother_of_pearl','mother.of.pearl|перламутр|abalone'),
        ('opal','\mopal(?!escent)|опал(?!есц)'),
        ('turquoise','turquoise|бирюз'),
        ('malachite','malachite|малахит'),
        ('lapis','lapis|лазурит'),
        ('onyx','onyx|оникс'),
        ('agate','agate|агат'),
        ('crystal','crystal|кристал|opalescent|опалесц')) d(k,pattern)
      where stone_text ~ pattern
    ) q),'[]'::jsonb) stones
  from (select distinct stone_text from source) s
),
normalised as materialized (
  select s.*,
    case when size_meta is not null then 'sz_'||md5(size_meta::text) end size_key,
    mf.materials,sf.stones,
    case when (a->'case_diameter_mm'->>'num')::numeric between 10 and 70 then (a->'case_diameter_mm'->>'num')::numeric end case_mm_v2,
    case when lower(a->'movement_type'->>'value') in ('automatic','quartz','manual') then lower(a->'movement_type'->>'value') end movement_v2
  from source s join material_facets mf on mf.metal_text=s.metal_text and mf.category=s.category join stone_facets sf on sf.stone_text=s.stone_text
)
  select n.*, case when n.stones<>'[]'::jsonb then 'with_stones'
  when n.a->'stones'->>'flag'='confirmed' and lower(btrim(n.a->'stones'->>'value')) in ('none','no stones','without stones','без камней','нет камней')
    and coalesce(lower(btrim(n.a->'centre_stone_type'->>'value')),'') in ('','none','no stones','without stones','без камней','нет камней') then 'without_stones' else 'unspecified' end stone_presence_v2 from normalised n;

  delete from public.cat_variant_facets f where not exists(select 1 from public.cat_variants v where v.variant_id=f.variant_id);
  insert into public.cat_variant_facets(variant_id,materials,stone_types,stone_presence,case_mm,movement,spec_size_key,spec_size_meta)
  select distinct on(n.variant_id) n.variant_id,
    array(select jsonb_array_elements_text(n.materials)),array(select jsonb_array_elements_text(n.stones)),
    n.stone_presence_v2,n.case_mm_v2,n.movement_v2,
    case when n.origin='historical' then n.size_key end,case when n.origin='historical' then n.size_meta end
  from pg_temp._cat_facet_stage_v2 n where n.variant_id is not null order by n.variant_id,n.origin
  on conflict(variant_id) do update set materials=excluded.materials,stone_types=excluded.stone_types,
    stone_presence=excluded.stone_presence,case_mm=excluded.case_mm,movement=excluded.movement,
    spec_size_key=excluded.spec_size_key,spec_size_meta=excluded.spec_size_meta;

  delete from public.cat_piece_sizes;
  insert into public.cat_piece_sizes(source_kind,source_id,variant_id,serial,raw_size,size_key,size_meta)
    select 'boutique',p.id::text,p.variant_id,p.serial,p.size,n.size_key,n.size_meta
    from public.cat_pieces p join pg_temp._cat_facet_stage_v2 n on n.variant_id=p.variant_id and n.origin='boutique'
      and n.serial is not distinct from p.serial and n.raw_size is not distinct from p.size and n.price is not distinct from p.price_uzs
    group by p.id,p.variant_id,p.serial,p.size,n.size_key,n.size_meta
    union all
    select 'transit',i.serial,i.variant_id,i.serial,i.size,n.size_key,n.size_meta
    from public.cat_incoming i join pg_temp._cat_facet_stage_v2 n on n.variant_id=i.variant_id and n.origin='transit' and n.serial=i.serial;
  insert into public.cat_size_options(size_key,size_meta)
    select distinct size_key,size_meta from pg_temp._cat_facet_stage_v2 where size_key is not null
    on conflict(size_key) do update set size_meta=excluded.size_meta;

  delete from public.cat_filter_candidates_v2;
  with variant_facts as materialized (
  select v.variant_id,v.model_id,v.sort_order,v.price_uzs,f.materials,f.stone_types,f.stone_presence,f.case_mm,f.movement,f.spec_size_key,f.spec_size_meta
  from public.cat_variants v left join public.cat_variant_facets f using(variant_id)
  union all
  select null,m.model_id,null,null,
    array(select jsonb_array_elements_text(o.materials)),array(select jsonb_array_elements_text(o.stones)),
    o.stone_presence_v2,o.case_mm_v2,o.movement_v2,o.size_key,o.size_meta
  from public.cat_models m join pg_temp._cat_facet_stage_v2 o using(model_id)
  where o.variant_id is null and not exists(select 1 from public.cat_variants v where v.model_id=m.model_id)
),
pieces as materialized (
  select v.model_id,p.variant_id,'boutique'::text origin,p.serial,p.price_uzs::numeric price,ps.size_key,ps.size_meta
  from public.cat_pieces p join variant_facts v using(variant_id)
    left join public.cat_piece_sizes ps on ps.source_kind='boutique' and ps.source_id=p.id::text
  union all
  select v.model_id,i.variant_id,'transit',i.serial,null::numeric,ps.size_key,ps.size_meta
  from public.cat_incoming i join variant_facts v using(variant_id)
    left join public.cat_piece_sizes ps on ps.source_kind='transit' and ps.source_id=i.serial
  where not exists(select 1 from public.cat_pieces p where p.serial=i.serial)
  union all
  select v.model_id,v.variant_id,'historical',null,v.price_uzs::numeric,v.spec_size_key,v.spec_size_meta
  from variant_facts v where not exists(select 1 from public.cat_pieces p where p.variant_id=v.variant_id)
    and not exists(select 1 from public.cat_incoming i where i.variant_id=v.variant_id and not exists(select 1 from public.cat_pieces p where p.serial=i.serial))
),
normalised as materialized (
  select v.model_id,v.variant_id,v.sort_order,p.origin,p.serial,p.price,p.size_key,p.size_meta,
    to_jsonb(coalesce(v.materials,'{}'::text[])) materials,to_jsonb(coalesce(v.stone_types,'{}'::text[])) stones,
    coalesce(v.stone_presence,'unspecified') stone_presence_v2,v.case_mm case_mm_v2,v.movement movement_v2
  from variant_facts v join pieces p on p.model_id=v.model_id and p.variant_id is not distinct from v.variant_id
),
facts as materialized (
  select n.model_id,n.variant_id,n.sort_order,n.origin,n.price,n.size_meta,n.size_key,
    jsonb_build_object('category',jsonb_build_array(m.category),'types',jsonb_build_array(m.retail_category),
      'brands',jsonb_build_array(m.brand),'collections',case when m.collection is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('brand',m.brand,'collection',m.collection)) end,
      'genders',case when m.gender is null then '[]'::jsonb else jsonb_build_array(m.gender) end,
      'availability',jsonb_build_array('all') || case when n.origin<>'historical' then jsonb_build_array(n.origin) else '[]'::jsonb end ||
        case when m.model_id not in(select pp.model_id from pieces pp where pp.origin<>'historical') then '["out"]'::jsonb else '[]'::jsonb end,
      'materials',n.materials,'stone_types',n.stones,
      'stone_presence',jsonb_build_array(n.stone_presence_v2),
      'movements',case when n.movement_v2 is null then '[]'::jsonb else jsonb_build_array(n.movement_v2) end,
      'case_diameters_mm',case when n.case_mm_v2 is null then '[]'::jsonb else jsonb_build_array(n.case_mm_v2) end,
      'sizes',case when n.size_key is null then '[]'::jsonb else jsonb_build_array(n.size_key) end,
      'price',n.price,'incomplete',cardinality(m.missing_crucial)>0,
      'serial',lower(n.serial),
      'known_serials','[]'::jsonb,
      'search',lower(coalesce(m.search_text,''))) c
  from normalised n join public.cat_models m using(model_id)
)
  insert into public.cat_filter_candidates_v2(candidate_id,model_id,variant_id,sort_order,origin,serial,price,size_key,size_meta,c)
  select row_number() over(order by model_id,variant_id,origin,price,size_key,c::text),model_id,variant_id,sort_order,origin,
    c->>'serial',price,size_key,size_meta,c-'known_serials' from facts;
  delete from public.cat_filter_options_v2;
  insert into public.cat_filter_options_v2(group_key,value)
  select distinct g.key,x.value from public.cat_filter_candidates_v2 t
    cross join unnest(array['category','types','brands','collections','availability','materials','stone_types','stone_presence','movements','case_diameters_mm','sizes','genders']) g(key)
    cross join lateral jsonb_array_elements(t.c->g.key) x;

  with payload as (with normalised as materialized (select * from public.cat_filter_candidates_v2),
size_catalog as materialized (select size_key,size_meta from public.cat_size_options),
input as (
  select '{"action":"facets","filter_version":2,"filters":{"category":null,"types":[],"brands":[],"collections":[],"availability":"all","materials":[],"stone_types":[],"stone_presence":null,"movements":[],"case_diameters_mm":[],"case_unspecified":false,"sizes":[],"genders":[],"price_min_uzs":null,"price_max_uzs":null,"q":"","incomplete":false},"sort":"newest","limit":60,"offset":0}'::jsonb->'filters' f
),
request as (
  select f || jsonb_build_object('sizes',coalesce((select jsonb_agg(e.value order by e.value) from jsonb_array_elements(f->'sizes') e where not exists (
    select 1 from size_catalog sc where to_jsonb(sc.size_key)=e.value and (
      (f->>'category' is not null and f->>'category'<>'jewellery') or
      (jsonb_array_length(f->'types')>0 and not (f->'types') @> jsonb_build_array(sc.size_meta->'product_type'))
    ))),'[]'::jsonb)) f,
    coalesce((select jsonb_agg(jsonb_build_object('field','sizes','removed',e.value,'reason','incompatible_type')) from jsonb_array_elements(f->'sizes') e where exists (
      select 1 from size_catalog sc where to_jsonb(sc.size_key)=e.value and (
        (f->>'category' is not null and f->>'category'<>'jewellery') or
        (jsonb_array_length(f->'types')>0 and not (f->'types') @> jsonb_build_array(sc.size_meta->'product_type'))
      ))),'[]'::jsonb) adjustments
  from input
),
facts as materialized (
  select n.model_id,n.variant_id,n.sort_order,n.origin,n.price,n.size_meta,n.size_key,
    n.c || jsonb_build_object('known_serials',(select coalesce(jsonb_agg(distinct p.serial),'[]'::jsonb) from public.cat_filter_candidates_v2 p
      where p.serial in (select regexp_split_to_table(lower((select f->>'q' from request)),'\s+')))) c
  from normalised n
),
checks as materialized (select facts.*,array_remove(array[case when ((f->'category' is null or f->'category'='null'::jsonb or f->'category'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'category')='array' then f->'category' else jsonb_build_array(f->'category') end) x where (c->'category') @> jsonb_build_array(x.value)))) is not true then 'category'::text end,
case when ((f->'types' is null or f->'types'='null'::jsonb or f->'types'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'types')='array' then f->'types' else jsonb_build_array(f->'types') end) x where (c->'types') @> jsonb_build_array(x.value)))) is not true then 'types'::text end,
case when ((f->'brands' is null or f->'brands'='null'::jsonb or f->'brands'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'brands')='array' then f->'brands' else jsonb_build_array(f->'brands') end) x where (c->'brands') @> jsonb_build_array(x.value)))) is not true then 'brands'::text end,
case when ((f->'collections' is null or f->'collections'='null'::jsonb or f->'collections'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'collections')='array' then f->'collections' else jsonb_build_array(f->'collections') end) x where (c->'collections') @> jsonb_build_array(x.value)))) is not true then 'collections'::text end,
case when ((f->'availability' is null or f->'availability'='null'::jsonb or f->'availability'='[]'::jsonb or f->'availability'='"all"'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'availability')='array' then f->'availability' else jsonb_build_array(f->'availability') end) x where (c->'availability') @> jsonb_build_array(x.value)))) is not true then 'availability'::text end,
case when ((f->'materials' is null or f->'materials'='null'::jsonb or f->'materials'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'materials')='array' then f->'materials' else jsonb_build_array(f->'materials') end) x where (c->'materials') @> jsonb_build_array(x.value)))) is not true then 'materials'::text end,
case when ((f->'stone_types' is null or f->'stone_types'='null'::jsonb or f->'stone_types'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'stone_types')='array' then f->'stone_types' else jsonb_build_array(f->'stone_types') end) x where (c->'stone_types') @> jsonb_build_array(x.value)))) is not true then 'stone_types'::text end,
case when ((f->'stone_presence' is null or f->'stone_presence'='null'::jsonb or f->'stone_presence'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'stone_presence')='array' then f->'stone_presence' else jsonb_build_array(f->'stone_presence') end) x where (c->'stone_presence') @> jsonb_build_array(x.value)))) is not true then 'stone_presence'::text end,
case when ((f->'movements' is null or f->'movements'='null'::jsonb or f->'movements'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'movements')='array' then f->'movements' else jsonb_build_array(f->'movements') end) x where (c->'movements') @> jsonb_build_array(x.value)))) is not true then 'movements'::text end,
case when ((f->'sizes' is null or f->'sizes'='null'::jsonb or f->'sizes'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'sizes')='array' then f->'sizes' else jsonb_build_array(f->'sizes') end) x where (c->'sizes') @> jsonb_build_array(x.value)))) is not true then 'sizes'::text end,
case when ((f->'genders' is null or f->'genders'='null'::jsonb or f->'genders'='[]'::jsonb or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(f->'genders')='array' then f->'genders' else jsonb_build_array(f->'genders') end) x where (c->'genders') @> jsonb_build_array(x.value)))) is not true then 'genders'::text end,
case when (((coalesce(jsonb_array_length(f->'case_diameters_mm'),0)=0 and not coalesce((f->>'case_unspecified')::boolean,false)) or ((c->'case_diameters_mm') <@ (f->'case_diameters_mm') and (c->'case_diameters_mm') <> '[]'::jsonb) or (coalesce((f->>'case_unspecified')::boolean,false) and (c->'case_diameters_mm')='[]'::jsonb))) is not true then 'case_diameters_mm'::text end,
case when (((f->>'price_min_uzs' is null or (c->>'price')::numeric >= (f->>'price_min_uzs')::numeric) and (f->>'price_max_uzs' is null or (c->>'price')::numeric <= (f->>'price_max_uzs')::numeric))) is not true then 'price'::text end,
case when ((not coalesce((f->>'incomplete')::boolean,false) or (c->>'incomplete')::boolean)) is not true then 'incomplete'::text end,
case when (not exists(select 1 from regexp_split_to_table(lower(coalesce(f->>'q','')), '\s+') w where w<>'' and case when (c->'known_serials') ? w then coalesce(c->>'serial','')<>w else position(w in c->>'search')=0 end)) is not true then 'q'::text end],null) failed_groups from facts cross join request),
matched as materialized (select * from checks where cardinality(failed_groups)=0),
groups(key,mode) as (values ('category','single'),('types','multi'),('brands','multi'),('collections','multi'),('availability','single'),('materials','multi'),('stone_types','multi'),('stone_presence','single'),('movements','multi'),('case_diameters_mm','multi'),('sizes','multi'),('genders','multi')),
universe as materialized (
  select group_key key,value from public.cat_filter_options_v2
  union select 'case_diameters_mm','"unspecified"'::jsonb
  union select g.key,e.value from groups g cross join request r cross join lateral jsonb_array_elements(case when g.key='case_diameters_mm' then r.f->g.key
    when jsonb_typeof(r.f->g.key)='array' then r.f->g.key when r.f->g.key <> 'null'::jsonb then jsonb_build_array(r.f->g.key) else '[]'::jsonb end) e
),
group_matches as (
  select g.key,t.model_id,t.c from groups g cross join checks t where t.failed_groups <@ array[g.key]
),
counts as materialized (
  select u.key,u.value,coalesce(z.n,0) n from universe u left join (
    select key,value,count(*) n from (select distinct t.key,v.value,t.model_id from group_matches t
      cross join lateral jsonb_array_elements(case when t.key='case_diameters_mm' and t.c->t.key='[]'::jsonb then '["unspecified"]'::jsonb else t.c->t.key end) v
     ) distinct_models group by key,value
  ) z on z.key=u.key and z.value=u.value
),
facet_rows as (
  select g.key,g.mode,
    case when g.key in ('movements','case_diameters_mm') then (r.f->>'category' is null or r.f->>'category'='watch') and (jsonb_array_length(r.f->'types')=0 or r.f->'types' @> '["watch"]'::jsonb)
      when g.key='sizes' then r.f->>'category' is null or r.f->>'category'='jewellery' else true end applicable,
    coalesce((select jsonb_agg(jsonb_build_object('value',ct.value,'count',ct.n,
      'selected',coalesce(case when ct.key='case_diameters_mm' and ct.value='"unspecified"'::jsonb then (r.f->>'case_unspecified')::boolean
        when jsonb_typeof(r.f->ct.key)='array' then r.f->ct.key @> jsonb_build_array(ct.value) else r.f->ct.key=ct.value end,false),
      'disabled',ct.n=0 and not coalesce(case when ct.key='case_diameters_mm' and ct.value='"unspecified"'::jsonb then (r.f->>'case_unspecified')::boolean
        when jsonb_typeof(r.f->ct.key)='array' then r.f->ct.key @> jsonb_build_array(ct.value) else r.f->ct.key=ct.value end,false),
      'metadata',case when ct.key='sizes' then (select sc.size_meta || jsonb_build_object('provenance',(select jsonb_agg(distinct n.origin) from normalised n where n.size_key=sc.size_key)) from size_catalog sc where to_jsonb(sc.size_key)=ct.value limit 1) end) order by ct.value)
      from counts ct where ct.key=g.key),'[]'::jsonb) options
  from groups g cross join request r
)
  select jsonb_build_object('facets',(select jsonb_agg(to_jsonb(facet_rows) order by key) from facet_rows),'total',(select count(distinct model_id) from matched)) v)
  update public.cat_facet_revision set unfiltered_facets=(select (v->'facets') from payload),
    total_models=(select (v->>'total')::bigint from payload) where singleton;

  update public.cat_facet_revision set counter=counter+1,rebuilt_at=clock_timestamp() where singleton;
  perform set_config('delardi.facet_refresh_v2',coalesce(previous_guard,''),true);
exception when others then
  perform set_config('delardi.facet_refresh_v2',coalesce(previous_guard,''),true);
  raise;
end
$_$;


--
-- Name: cat_rebuild_facets_v2_safe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_rebuild_facets_v2_safe() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  perform public.cat_rebuild_facets_v2();
exception when others then
  raise warning 'cat_rebuild_facets_v2 failed; v2 facet cache left stale: %', sqlerrm;
end
$$;


--
-- Name: cat_rebuild_search(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_rebuild_search() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update cat_models m set search_text = lower(concat_ws(' ',
      m.article, m.model_id, m.brand, array_to_string(m.brand_raw,' '), m.category, m.retail_category, m.subcategory,
      m.collection, m.model_name, m.name_en, m.name_ru, m.material,
      (select string_agg(concat_ws(' ', v.variant_id, v.colour_code, v.colour_name_en, v.colour_name_ru, v.material,
                                   v.description_ru, v.description_en), ' ') from cat_variants v where v.model_id = m.model_id),
      (select string_agg(a.value, ' ') from cat_attributes a join cat_variants v using (variant_id) where v.model_id = m.model_id),
      (select string_agg(p.serial, ' ') from cat_pieces p join cat_variants v using (variant_id) where v.model_id = m.model_id)
  )) where true;
$$;


--
-- Name: cat_reference(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_reference() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'brands', (select jsonb_agg(jsonb_build_object('brand', brand, 'models', n, 'in_stock', s) order by brand)
               from (select brand, count(*) n, count(*) filter (where in_stock) s from cat_models group by brand) b),
    'categories', (select jsonb_agg(jsonb_build_object('category', category, 'retail_category', retail_category, 'models', n, 'in_stock', s) order by category, retail_category)
               from (select category, retail_category, count(*) n, count(*) filter (where in_stock) s from cat_models group by 1,2) c),
    'collections', (select jsonb_agg(jsonb_build_object('brand', brand, 'collection', collection, 'models', n, 'in_stock', s) order by brand, collection)
               from (select brand, collection, count(*) n, count(*) filter (where in_stock) s from cat_models where collection is not null group by 1,2) k),
    'metals', (select jsonb_agg(jsonb_build_object('key', k, 'models', n, 'in_stock', s) order by s desc)
               from (select unnest(metal_keys) k, count(*) n, count(*) filter (where in_stock) s from cat_models group by 1) x),
    'stones', (select jsonb_agg(jsonb_build_object('key', k, 'models', n, 'in_stock', s) order by s desc)
               from (select unnest(stone_keys) k, count(*) n, count(*) filter (where in_stock) s from cat_models group by 1) x),
    'movements', (select jsonb_agg(jsonb_build_object('key', movement, 'models', n, 'in_stock', s) order by s desc)
               from (select movement, count(*) n, count(*) filter (where in_stock) s from cat_models where movement is not null group by 1) x),
    'sizes', (select jsonb_agg(jsonb_build_object('cat', retail_category, 'size', sz, 'models', n, 'in_stock', s) order by retail_category, sz)
               from (select retail_category, unnest(size_keys) sz, count(*) n, count(*) filter (where in_stock) s from cat_models group by 1,2) x),
    'case_mm', (select jsonb_build_object('min', min(case_mm), 'max', max(case_mm), 'models', count(*)) from cat_models where case_mm is not null),
    'expected', (select jsonb_agg(jsonb_build_object('category', category, 'key', key, 'section', section, 'crucial', crucial) order by category, sort_order) from cat_expected_keys),
    'run', (select jsonb_build_object('id', id, 'run_at', run_at, 'source_built', source_built, 'counts', counts) from cat_import_runs order by id desc limit 1)
  );
$$;


--
-- Name: cat_ru_for(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_ru_for(vals text[]) RETURNS TABLE(en text, ru text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select t.en, t.ru from cat_text_ru t where t.en = any(vals) $$;


--
-- Name: cat_size_from_ref(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_size_from_ref(a text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $_$
  select case
    when right(a,3) = '000' or right(a,3) !~ '^[0-9]{2}[0-9]$' then null
    when substr(a,2,1) = 'A' then ltrim(substr(right(a,3),1,2),'0')
    else ltrim(substr(right(a,3),1,2),'0') || ' cm' end $_$;


--
-- Name: cat_txn_display(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cat_txn_display(p_model text, p_variant text, p_item text, OUT variant_id text, OUT name_ru text, OUT name_en text, OUT thumb_url text) RETURNS record
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  m record; code text; cnt int; enr_ru text; enr_en text; sib_ru text; sib_en text;
  col_ru text; col_en text; type_ru text; type_en text; label text;
  base constant text := 'https://hugduzqwyqwryicfzipu.supabase.co/storage/v1/object/public/catalogue-photos/';
begin
  variant_id := p_variant;
  if p_model is null then return; end if;
  select * into m from cat_models where model_id = p_model;
  if not found then return; end if;
  select count(*) into cnt from cat_variants v where v.model_id = p_model;
  -- The colour sold, read from Colibri's own words when the article does not say it.
  if variant_id is null and cnt > 1 then
    code := case when p_item ~* 'бел' then 'WG' when p_item ~* '(розов|красн)' then 'PG'
                 when p_item ~* '(жёлт|желт)' then 'YG' end;
    if code is not null then
      select v.variant_id into variant_id from cat_variants v
        where v.model_id = p_model and (upper(v.variant_id) like '%' || code or (code = 'PG' and upper(v.variant_id) like '%RG'))
        order by v.sort_order limit 1;
    end if;
  elsif variant_id is null then
    select v.variant_id into variant_id from cat_variants v where v.model_id = p_model limit 1;
  end if;
  if variant_id is not null then
    code := upper(substring(variant_id from '(WG|YG|PG|RG)$'));
    col_ru := case code when 'WG' then 'белое золото' when 'YG' then 'жёлтое золото' when 'PG' then 'розовое золото' when 'RG' then 'розовое золото' end;
    col_en := case code when 'WG' then 'white gold' when 'YG' then 'yellow gold' when 'PG' then 'rose gold' when 'RG' then 'rose gold' end;
    -- 1. the researched name of the colour sold
    select max(a.value) filter (where a.key = 'name_ru'), max(a.value) filter (where a.key = 'name_en')
      into enr_ru, enr_en from cat_attributes a where a.variant_id = cat_txn_display.variant_id and a.key in ('name_ru','name_en') and a.flag <> 'colibri_only';
  end if;
  -- 2. a sibling colour's researched name, its metal swapped for the colour sold (or dropped)
  if enr_ru is null or enr_en is null then
    select max(a.value) filter (where a.key = 'name_ru'), max(a.value) filter (where a.key = 'name_en')
      into sib_ru, sib_en from cat_attributes a join cat_variants v using (variant_id)
      where v.model_id = p_model and a.key in ('name_ru','name_en') and a.flag <> 'colibri_only';
    if sib_ru is not null and enr_ru is null then
      enr_ru := case when cnt > 1 and sib_ru ~ ',[^,]*золот[^,]*$' then regexp_replace(sib_ru, ',[^,]*$', '') || coalesce(', ' || col_ru, '') else sib_ru end;
    end if;
    if sib_en is not null and enr_en is null then
      enr_en := case when cnt > 1 and sib_en ~* ',[^,]*gold[^,]*$' then regexp_replace(sib_en, ',[^,]*$', '') || coalesce(', ' || col_en, '') else sib_en end;
    end if;
  end if;
  -- 3. type, brand and model or collection
  if enr_ru is null or enr_en is null then
    label := coalesce(m.model_name, m.collection);
    if label is not null then
      type_ru := case m.retail_category when 'ring' then 'Кольцо' when 'earrings' then 'Серьги' when 'necklace' then 'Колье'
        when 'bracelet' then 'Браслет' when 'cufflinks' then 'Запонки' when 'watch' then 'Часы' when 'strap' then 'Ремешок'
        when 'clasp' then 'Застёжка' when 'bracelet_element' then 'Элемент браслета' end;
      type_en := case m.retail_category when 'ring' then 'ring' when 'earrings' then 'earrings' when 'necklace' then 'necklace'
        when 'bracelet' then 'bracelet' when 'cufflinks' then 'cufflinks' when 'watch' then 'watch' when 'strap' then 'strap'
        when 'clasp' then 'clasp' when 'bracelet_element' then 'bracelet element' end;
      enr_ru := coalesce(enr_ru, concat_ws(' ', type_ru, m.brand, label) || coalesce(', ' || col_ru, ''));
      enr_en := coalesce(enr_en, concat_ws(' ', m.brand, label, type_en) || coalesce(', ' || col_en, ''));
    end if;
  end if;
  name_ru := enr_ru; name_en := enr_en;
  -- the colour's first photo, else the model's
  select base || p.path_thumb into thumb_url from cat_photos p
    where p.model_id = p_model and (p.variant_id = cat_txn_display.variant_id or p.variant_id is null)
    order by (p.variant_id is null), p.ord limit 1;
  if thumb_url is null and m.image_key is not null then thumb_url := base || m.image_key; end if;
end $_$;


--
-- Name: crm_accept_single_source(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_accept_single_source(p_id text, p_actor text) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare r crm_clients%rowtype; v_fields text[] := '{}';
begin
  r := crm_open_record(p_id);
  if r.name_flag = 'gap' then
    update crm_clients set name_confirmed = coalesce(crm_blank(name_colibri), crm_blank(name_marketing)), name_flag = 'rule' where client_id = p_id;
    v_fields := array_append(v_fields, 'name');
  end if;
  if r.phone_flag = 'gap' then
    update crm_clients set phone_confirmed = coalesce(crm_blank(phone_colibri), crm_blank(phone_marketing)), phone_flag = 'rule' where client_id = p_id;
    v_fields := array_append(v_fields, 'phone');
  end if;
  if r.gender_flag = 'gap' then
    update crm_clients set gender_confirmed = coalesce(crm_blank(gender_colibri), crm_blank(gender_marketing)), gender_flag = 'rule' where client_id = p_id;
    v_fields := array_append(v_fields, 'gender');
  end if;
  if r.dob_flag = 'gap' then
    update crm_clients set dob_confirmed = coalesce(dob_colibri, dob_marketing), dob_flag = 'rule' where client_id = p_id;
    v_fields := array_append(v_fields, 'dob');
  end if;
  if cardinality(v_fields) = 0 then perform crm_fail('Nothing on this record is held by one source only.'); end if;
  insert into crm_events (client_id, actor, action, new_value, note)
  values (p_id, p_actor, 'single_source_accepted', array_to_string(v_fields, ','), 'Values held by one source only were accepted as they are.');
  return cardinality(v_fields);
end $$;


--
-- Name: crm_add_note(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_add_note(p_id text, p_note text, p_actor text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_note text := crm_blank(p_note);
begin
  perform 1 from crm_clients where client_id = p_id;
  if not found then perform crm_fail('No record with that reference.'); end if;
  if v_note is null or char_length(v_note) < 2 then perform crm_fail('Write the note first.'); end if;
  if char_length(v_note) > 1000 then perform crm_fail('Keep a note under 1,000 characters.'); end if;
  insert into crm_events (client_id, actor, action, note) values (p_id, p_actor, 'note', v_note);
end $$;


--
-- Name: crm_apply_survivorship(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_apply_survivorship(p_actor text DEFAULT 'system'::text) RETURNS TABLE(fld text, n_agreed integer, n_gap integer, n_conflict integer, n_empty integer)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_rows int;
begin
  update public.crm_clients c set
    name_flag = s.f,
    name_confirmed = case when s.f = 'agreed' then public.crm_blank(c.name_colibri) end
  from (
    select client_id,
           case
             when public.crm_blank(name_colibri) is null
              and public.crm_blank(name_marketing) is null then 'none'
             when public.crm_blank(name_marketing) is null then 'gap'
             when public.crm_blank(name_colibri)   is null then 'gap'
             when public.crm_name_agrees(name_colibri, name_marketing) then 'agreed'
             else 'conflict'
           end as f
    from public.crm_clients
  ) s
  where s.client_id = c.client_id
    and c.name_flag in ('none','agreed','gap','conflict');

  update public.crm_clients c set
    phone_flag = s.f,
    phone_confirmed = case when s.f = 'agreed' then public.crm_blank(c.phone_marketing) end
  from (
    select client_id,
           case
             when public.crm_blank(phone_colibri) is null
              and public.crm_blank(phone_marketing) is null then 'none'
             when public.crm_blank(phone_marketing) is null then 'gap'
             when public.crm_blank(phone_colibri)   is null then 'gap'
             when public.crm_contains(phone_colibri, phone_marketing) then 'agreed'
             else 'conflict'
           end as f
    from public.crm_clients
  ) s
  where s.client_id = c.client_id
    and c.phone_flag in ('none','agreed','gap','conflict');

  update public.crm_clients c set
    gender_flag = s.f,
    gender_confirmed = case when s.f = 'agreed' then public.crm_blank(c.gender_colibri) end
  from (
    select client_id,
           case
             when public.crm_blank(gender_colibri) is null
              and public.crm_blank(gender_marketing) is null then 'none'
             when public.crm_blank(gender_marketing) is null then 'gap'
             when public.crm_blank(gender_colibri)   is null then 'gap'
             when gender_colibri = gender_marketing then 'agreed'
             else 'conflict'
           end as f
    from public.crm_clients
  ) s
  where s.client_id = c.client_id
    and c.gender_flag in ('none','agreed','gap','conflict');

  update public.crm_clients c set
    dob_flag = s.f,
    dob_confirmed = case when s.f = 'agreed' then c.dob_colibri end
  from (
    select client_id,
           case
             when dob_colibri is null and dob_marketing is null then 'none'
             when dob_marketing is null then 'gap'
             when dob_colibri   is null then 'gap'
             when dob_colibri = dob_marketing then 'agreed'
             else 'conflict'
           end as f
    from public.crm_clients
  ) s
  where s.client_id = c.client_id
    and c.dob_flag in ('none','agreed','gap','conflict');

  select count(*) into v_rows from public.crm_clients;
  insert into public.crm_events (client_id, actor, action, note)
  values (null, p_actor, 'survivorship_pass', v_rows || ' records evaluated');

  return query
  select x.nm,
         count(*) filter (where x.f='agreed')::int,
         count(*) filter (where x.f='gap')::int,
         count(*) filter (where x.f='conflict')::int,
         count(*) filter (where x.f='none')::int
  from public.crm_clients c
  cross join lateral (values
      ('name',c.name_flag),('phone',c.phone_flag),
      ('gender',c.gender_flag),('dob',c.dob_flag)
  ) as x(nm,f)
  group by x.nm order by x.nm;
end $$;


--
-- Name: crm_assign_owner(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_assign_owner(p_id text, p_owner text, p_reason text, p_actor text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare r crm_clients%rowtype; v_old text; v_old_label text; v_new_label text; v_reason text := crm_blank(p_reason);
begin
  r := crm_open_record(p_id);
  select label into v_new_label from crm_sales_reps where source_name = p_owner and active;
  if v_new_label is null then perform crm_fail('Choose a current sales rep or the shared list.'); end if;
  v_old := coalesce(r.assigned_owner, r.client_owner);
  if v_old = p_owner then perform crm_fail('That is already the owner.'); end if;
  if v_reason is not null and char_length(v_reason) > 300 then perform crm_fail('Keep the reason under 300 characters.'); end if;
  select label into v_old_label from crm_sales_reps where source_name = v_old;
  update crm_clients set assigned_owner = p_owner, assigned_by = p_actor, assigned_at = now(),
    assignment_reason = 'manual' || coalesce(': ' || v_reason, '')
  where client_id = p_id;
  insert into crm_events (client_id, actor, action, field, old_value, new_value, note)
  values (p_id, p_actor, 'owner_assigned', 'owner', coalesce(v_old_label, case when v_old is null then null else 'Former owner' end),
          v_new_label, coalesce(v_reason, 'Reassigned by hand.'));
end $$;


--
-- Name: crm_attention_ids(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_attention_ids(p_key text) RETURNS text[]
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with q as (select * from crm_queue where review_status not in ('merged','deleted')),
  reps as (select source_name from crm_sales_reps where active),
  dup as (
    select e.client_id, m[1] other
    from crm_events e, regexp_matches(coalesce(e.note, ''), '\m((?:DLD|PRS)-\d{3,4})\M', 'g') m
    where e.action = 'duplicate_suspect' and m[1] <> e.client_id
  ), dup_open as (
    select d.client_id, d.other from dup d
    where not exists (select 1 from crm_events x where x.action = 'duplicate_cleared'
                        and ((x.client_id = d.client_id and x.new_value = d.other) or (x.client_id = d.other and x.new_value = d.client_id)))
      and exists (select 1 from q where q.client_id = d.client_id)
      and exists (select 1 from q where q.client_id = d.other)
  ), resolved as (
    select client_id, field, max(at) at from crm_events where action = 'field_resolved' group by 1, 2
  ), last_applied as (
    select max(id) id from crm_import_batches where status = 'applied'
  )
  select coalesce(array_agg(distinct id order by id), '{}') from (
    select client_id id from dup_open where p_key = 'duplicates'
    union all select other from dup_open where p_key = 'duplicates'
    union all
    select e.client_id from crm_events e join resolved r on r.client_id = e.client_id and r.field = e.field and e.at > r.at
    where p_key = 'changed_after_check' and e.action = 'colibri_changed'
      and exists (select 1 from q where q.client_id = e.client_id)
    union all
    select q.client_id from q join crm_clients c using (client_id), last_applied la
    where p_key = 'new_from_refresh' and c.created_by_batch = la.id and q.review_status in ('decision','confirm')
    union all
    select q.client_id from q
    where p_key = 'shared_active' and q.record_type = 'client' and not q.related_party
      and q.lifecycle_status in ('Active','At risk')
      and (q.client_owner is null or q.client_owner = 'Unassigned' or q.client_owner not in (select source_name from reps))
    union all
    select q.client_id from q join crm_clients c using (client_id)
    where p_key = 'no_phone' and q.record_type = 'client' and c.phone_flag = 'none' and crm_blank(c.phone_telegram) is null
    union all
    select q.client_id from q join crm_clients c using (client_id)
    where p_key = 'no_dob' and q.record_type = 'client' and c.dob_flag = 'none'
    union all
    select q.client_id from q
    where p_key = 'initials_only' and q.review_status <> 'lead' and coalesce(q.display_name, '') !~ '[[:alpha:]]{3,}'
    union all
    select distinct t.client_id from crm_transactions t join q using (client_id)
    where p_key = 'brand_unassigned' and t.brand = 'Unassigned'
    union all
    select s.id from crm_telegram_chats ch, unnest(ch.suggested_ids) s(id)
    where p_key = 'telegram_to_confirm' and ch.link_status = 'suggested' and exists (select 1 from q where q.client_id = s.id)
  ) x
$$;


--
-- Name: crm_birthday_ids(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_birthday_ids(p_days integer) RETURNS text[]
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with t as (select (now() at time zone 'Asia/Tashkent')::date as d),
  c as (
    select q.client_id, coalesce(cl.dob_confirmed, cl.dob_colibri, cl.dob_marketing) as dob,
           extract(year from age(t.d, coalesce(cl.dob_confirmed, cl.dob_colibri, cl.dob_marketing)))::int as y, t.d
    from crm_queue q join crm_clients cl using (client_id), t
    where coalesce(cl.dob_confirmed, cl.dob_colibri, cl.dob_marketing) is not null
      and q.review_status not in ('merged','deleted')
  ), n as (
    select client_id, d,
           case when (dob + make_interval(years => y))::date = d then d
                else (dob + make_interval(years => y + 1))::date end as next_bd
    from c
  )
  select coalesce(array_agg(client_id order by next_bd, client_id), '{}')
  from n where next_bd - d between 0 and greatest(0, least(p_days, 366))
$$;


--
-- Name: crm_blank(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_blank(t text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select nullif(btrim(coalesce(t,'')),'')
$$;


--
-- Name: crm_brand_canon(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_brand_canon(p text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select case
    when k is null then null
    when k in ('hublot') then 'Hublot'
    when k in ('bulgari', 'bvlgari') then 'Bulgari'
    when k in ('gp', 'girard perregaux', 'girard-perregaux', 'girardperregaux') then 'Girard-Perregaux'
    when k in ('messika') then 'Messika'
    when k in ('stephen webster') then 'Stephen Webster'
    when k in ('leo pizzo') then 'Leo Pizzo'
    when k in ('dinh van') then 'Dinh Van'
    when k in ('gerald charles') then 'Gerald Charles'
    when k in ('fabio collection', 'fabio') then 'Fabio Collection'
    else coalesce((select brand from crm_transactions where lower(brand) = k and brand <> 'Unassigned' limit 1), initcap(btrim(p)))
  end
  from (select nullif(lower(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'))), '') as k) x
$$;


--
-- Name: crm_clear_duplicate(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_clear_duplicate(p_id text, p_other text, p_actor text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if p_id = p_other then perform crm_fail('Choose two different records.'); end if;
  perform 1 from crm_clients where client_id = p_id;
  if not found then perform crm_fail('No record with that reference.'); end if;
  perform 1 from crm_clients where client_id = p_other;
  if not found then perform crm_fail('No record with that reference.'); end if;
  insert into crm_events (client_id, actor, action, new_value, note) values
    (p_id, p_actor, 'duplicate_cleared', p_other, 'Checked: not the same person as ' || p_other || '.'),
    (p_other, p_actor, 'duplicate_cleared', p_id, 'Checked: not the same person as ' || p_id || '.');
end $$;


--
-- Name: crm_client_add(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_client_add(p jsonb, p_actor text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_name text := crm_blank(p->>'name');
  v_phone text := crm_blank(p->>'phone');
  v_norm text;
  v_gender text := crm_blank(p->>'gender');
  v_dob date;
  v_owner text := crm_blank(p->>'owner');
  v_src text;
  v_how text := crm_blank(p->>'how_met');
  v_note text := crm_blank(p->>'note');
  v_force boolean := coalesce((p->>'force')::boolean, false);
  v_id text;
  v_dups text[];
begin
  if v_name is null or char_length(v_name) < 3 then perform crm_fail('Write the client''s name.'); end if;
  if char_length(v_name) > 120 then perform crm_fail('Keep the name under 120 characters.'); end if;
  if v_gender is not null and v_gender not in ('M', 'F') then perform crm_fail('Gender must be M or F.'); end if;
  if v_how is not null and char_length(v_how) > 80 then perform crm_fail('Keep how you met under 80 characters.'); end if;
  if v_note is not null and char_length(v_note) > 500 then perform crm_fail('Keep the note under 500 characters.'); end if;
  begin
    v_dob := nullif(p->>'dob', '')::date;
  exception when others then perform crm_fail('That is not a date.');
  end;
  if v_dob is not null and crm_plausible_dob(v_dob, current_date) is null then
    perform crm_fail('That date of birth is outside the plausible range.');
  end if;
  if v_phone is not null then
    v_norm := crm_phone_norm(v_phone);
    if v_norm is null or length(regexp_replace(v_norm, '\D', '', 'g')) > 15 then perform crm_fail('That is not a phone number.'); end if;
  end if;

  if v_owner is null then
    v_src := 'Unassigned';
  else
    select source_name into v_src from crm_sales_reps where (label = v_owner or source_name = v_owner) and active limit 1;
    if v_src is null then perform crm_fail('Choose a current sales rep or the shared list.'); end if;
  end if;

  if not v_force then
    select array_agg(x order by x) into v_dups from (
      select c.client_id x from crm_clients c
      where c.record_state not in ('merged', 'deleted')
        and ( (v_norm is not null and c.client_id = any (crm_phone_ids(regexp_replace(v_norm, '\D', '', 'g'))))
              or crm_name_key(coalesce(c.name_confirmed, c.name_colibri, c.name_marketing)) = crm_name_key(v_name) )
      limit 5) d;
    if v_dups is not null then
      perform crm_fail('Already on file: ' || array_to_string(v_dups, ', ') || '. Open that record, or say it is a different person.');
    end if;
  end if;

  select 'PRS-' || to_char(coalesce(max(substring(client_id from 5) :: int), 0) + 1, 'FM000')
    into v_id from crm_clients where client_id ~ '^PRS-\d+$';

  insert into crm_clients (client_id, record_type, record_state, in_colibri, in_marketing,
    name_marketing, phone_marketing, gender_marketing, dob_marketing, match_phone,
    client_owner, assigned_owner, assigned_by, assigned_at, assignment_reason,
    added_by_hand, how_met)
  values (v_id, 'prospect', 'open', false, true,
    v_name, v_phone, v_gender, v_dob, v_norm,
    v_src, v_src, p_actor, now(), 'manual: added by hand',
    true, v_how);

  perform crm_recompute_flags(v_id);
  insert into crm_events (client_id, actor, action, field, new_value, note)
    values (v_id, p_actor, 'created_by_hand', null, v_src, v_how);
  if v_note is not null then perform crm_add_note(v_id, v_note, p_actor); end if;
  return v_id;
end $_$;


--
-- Name: crm_contact_add(text, date, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_contact_add(p_id text, p_on date, p_by text, p_channel text, p_note text, p_actor text) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_note text := crm_blank(p_note); v_id bigint; v_today date := (now() at time zone 'Asia/Tashkent')::date;
begin
  perform crm_open_record(p_id);
  if p_on is null then perform crm_fail('Say when the contact was.'); end if;
  if p_on > v_today then perform crm_fail('A contact cannot be in the future.'); end if;
  if p_on < date '2020-01-01' then perform crm_fail('That date is too far back.'); end if;
  if p_channel is null or p_channel not in ('visit','call','telegram','whatsapp','email','other') then perform crm_fail('Say how the contact was made.'); end if;
  if crm_blank(p_by) is null then perform crm_fail('Say who made the contact.'); end if;
  if v_note is not null and char_length(v_note) > 500 then perform crm_fail('Keep the note under 500 characters.'); end if;
  insert into crm_contacts (client_id, contacted_on, by_name, channel, note, created_by)
  values (p_id, p_on, btrim(p_by), p_channel, v_note, p_actor) returning id into v_id;
  insert into crm_events (client_id, actor, action, new_value, note) values (p_id, p_actor, 'contact_logged', p_channel, to_char(p_on, 'YYYY-MM-DD'));
  return v_id;
end $$;


--
-- Name: crm_contact_remove(text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_contact_remove(p_id text, p_contact bigint, p_actor text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare x crm_contacts%rowtype;
begin
  perform crm_open_record(p_id);
  select * into x from crm_contacts where id = p_contact and client_id = p_id for update;
  if not found then perform crm_fail('No such contact on this record.'); end if;
  if x.created_by <> p_actor then perform crm_fail('Only the person who logged a contact can remove it.'); end if;
  if x.created_at < now() - interval '15 minutes' then perform crm_fail('A contact can be removed only within 15 minutes of logging it.'); end if;
  delete from crm_contacts where id = p_contact;
  insert into crm_events (client_id, actor, action, new_value, note) values (p_id, p_actor, 'contact_removed', x.channel, to_char(x.contacted_on, 'YYYY-MM-DD'));
end $$;


--
-- Name: crm_contains(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_contains(haystack text, needle text) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select case
    when public.crm_blank(needle) is null then true
    when public.crm_blank(haystack) is null then false
    else position(lower(btrim(needle)) in lower(haystack)) > 0
  end
$$;


--
-- Name: crm_date_add(text, text, text, integer, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_date_add(p_id text, p_kind text, p_label text, p_month integer, p_day integer, p_year integer, p_actor text) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_label text := crm_blank(p_label); v_id bigint;
begin
  perform crm_open_record(p_id);
  if p_kind is null or p_kind not in ('anniversary','partner_birthday','child_birthday','other') then perform crm_fail('Say what the date is.'); end if;
  if p_kind = 'other' and v_label is null then perform crm_fail('Name the date.'); end if;
  if v_label is not null and char_length(v_label) > 80 then perform crm_fail('Keep the name under 80 characters.'); end if;
  if p_month is null or p_day is null or p_month not between 1 and 12 or p_day not between 1 and 31 then perform crm_fail('That is not a real date.'); end if;
  if p_year is not null and (p_year < 1900 or p_year > extract(year from now())::int + 1) then perform crm_fail('That year is out of range.'); end if;
  begin
    perform make_date(coalesce(p_year, 2000), p_month, p_day);
  exception when others then perform crm_fail('That is not a real date.'); end;
  if (select count(*) from crm_important_dates where client_id = p_id) >= 12 then perform crm_fail('Keep it to twelve dates per client.'); end if;
  insert into crm_important_dates (client_id, kind, label, month, day, year, created_by)
  values (p_id, p_kind, v_label, p_month, p_day, p_year, p_actor) returning id into v_id;
  insert into crm_events (client_id, actor, action, field, new_value, note) values (p_id, p_actor, 'date_added', 'personal', p_kind, v_label);
  return v_id;
end $$;


--
-- Name: crm_date_remove(text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_date_remove(p_id text, p_date bigint, p_actor text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare x crm_important_dates%rowtype;
begin
  perform crm_open_record(p_id);
  select * into x from crm_important_dates where id = p_date and client_id = p_id for update;
  if not found then perform crm_fail('No such date on this record.'); end if;
  delete from crm_important_dates where id = p_date;
  insert into crm_events (client_id, actor, action, field, new_value, note) values (p_id, p_actor, 'date_removed', 'personal', x.kind, x.label);
end $$;


--
-- Name: crm_export_record(text, text, jsonb, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_export_record(p_actor text, p_kind text, p_filters jsonb, p_rows integer, p_phones boolean) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
  insert into crm_export_log (actor, kind, filters, rows_out, with_phones)
  values (coalesce(nullif(btrim(p_actor), ''), 'unknown'),
          case when p_kind = 'birthdays' then 'birthdays' else 'list' end,
          coalesce(p_filters, '{}'::jsonb), greatest(coalesce(p_rows, 0), 0), coalesce(p_phones, false))
  returning id
$$;


--
-- Name: crm_export_rows(text[], boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_export_rows(p_ids text[], p_phones boolean DEFAULT true) RETURNS TABLE(sort_ord integer, client_id text, display_name text, phone_main text, phones_other text[], birth_day integer, birth_month integer, birth_year integer, birth_confirmed boolean, client_owner text, record_type text, review_status text, abc_class text, rfm_segment text, lifecycle_status text, lifetime_spend_uzs numeric, purchase_occasions integer, first_purchase_at date, last_purchase_at date, last_contact_on date, last_contact_by text, last_contact_channel text, do_not_contact boolean, in_telegram boolean, added_by_hand boolean, how_met text, related_party boolean)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with src as (
    select q.*, c.dob_confirmed, c.dob_colibri, c.dob_marketing,
           c.phone_confirmed, c.phone_colibri, c.phone_marketing, c.phone_telegram
    from crm_queue q join crm_clients c using (client_id)
    where q.client_id = any(p_ids)
      and coalesce(q.review_status, '') not in ('merged', 'deleted')
  ),
  listed as (
    select s.client_id, t.n, t.ord
    from src s,
    lateral unnest(
      array[coalesce(s.phone_confirmed, '')]
      || string_to_array(coalesce(s.phone_colibri, ''), ';')
      || array[coalesce(s.phone_marketing, ''), coalesce(s.phone_telegram, '')]
    ) with ordinality as t(n, ord)
  ),
  cleaned as (
    select client_id, btrim(n) as n, regexp_replace(n, '\D', '', 'g') as d, ord
    from listed where length(regexp_replace(n, '\D', '', 'g')) >= 7
  ),
  uniq as (
    select distinct on (client_id, d) client_id, n, ord from cleaned order by client_id, d, ord
  ),
  ranked as (
    select client_id, n, ord, row_number() over (partition by client_id order by ord) as rn from uniq
  ),
  phones as (
    select client_id,
           max(n) filter (where rn = 1) as phone_main,
           array_remove(array_agg(n order by ord) filter (where rn > 1), null) as phones_other
    from ranked group by client_id
  ),
  bd as (
    select client_id, coalesce(dob_confirmed, dob_colibri, dob_marketing) as d,
           (dob_confirmed is not null) as conf
    from src
  )
  select
    array_position(p_ids, s.client_id)::int,
    s.client_id, s.display_name,
    case when p_phones then p.phone_main end,
    case when p_phones then coalesce(p.phones_other, '{}') end,
    extract(day from bd.d)::int, extract(month from bd.d)::int,
    case when bd.d is null then null else extract(year from bd.d)::int end,
    bd.conf,
    s.client_owner, s.record_type, s.review_status,
    s.abc_class, s.rfm_segment, s.lifecycle_status,
    s.lifetime_spend_uzs, s.purchase_occasions,
    s.first_purchase_at, s.last_purchase_at,
    s.last_contact_on, s.last_contact_by, s.last_contact_channel,
    coalesce(s.do_not_contact, false), coalesce(s.in_telegram, false),
    coalesce(s.added_by_hand, false), s.how_met, coalesce(s.related_party, false)
  from src s
  left join phones p using (client_id)
  left join bd using (client_id)
  order by 1
$$;


--
-- Name: crm_fail(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_fail(p_message text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  raise exception using errcode = 'P0001', message = p_message;
end $$;


--
-- Name: crm_guess_brand(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_guess_brand(p_item text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select case
    when t ~ 'messika|\mmy move\M|glam.?azone' then 'Messika'
    when t ~ 'bvlgari|bulgari|serpenti|\mocto\M|lucea|\mdiva\M|b\.zero' then 'Bulgari'
    when t ~ 'hublot|big bang|classic fusion' then 'Hublot'
    when t ~ 'girard|perregaux|laureato|cat eye|gp 1966|free bridge' then 'Girard-Perregaux'
    when t ~ 'stephen webster|thorn embrace' then 'Stephen Webster'
    when t ~ 'palmiero' then 'Palmiero'
    when t ~ 'leo pizzo' then 'Leo Pizzo'
    when t ~ 'dinh van|menottes' then 'Dinh Van'
    when t ~ 'chronoswiss' then 'Chronoswiss'
    when t ~ 'gerald charles|maestro' then 'Gerald Charles'
    when t ~ 'cyrus|klepcys' then 'Cyrus'
    else null end
  from (select lower(translate(coalesce(p_item, ''), 'ё', 'е')) as t) x
$$;


--
-- Name: crm_guess_category(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_guess_category(p_item text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select case
    when t = '' then 'Unassigned'
    when t ~ '^(наручные )?час' then 'Watch'
    when t ~ '^(мини-)?серьг' then 'Earrings'
    when t ~ '^(кольц|обручальн|помолвочн)' then 'Ring'
    when t ~ '^(колье|подвеск|чокер)' then 'Necklace / pendant'
    when t ~ '^(теннисный )?браслет' then 'Bracelet'
    when t ~ '^запонк' then 'Brooch / other'
    when t ~ '(ремеш|ремщок|застежк|boucle)' and t !~ '(час|циферблат|корпус|watch|\d\s?(мм|mm)\M|big bang|fusion)' then 'Jewellery – other'
    when t ~ '(час|watch|циферблат|корпус|хронограф|кварц|автоматич|big bang|classic fusion|laureato|\d\s?(мм|mm)\M)' then 'Watch'
    when t ~ '(серьг|earring|пусет|boucles d.oreilles|\mbo\M)' then 'Earrings'
    when t ~ '(колье|чокер|necklace|лариат|collier|ожерель|\mco\M)' then 'Necklace / pendant'
    when t ~ '(браслет|bracelet|\mbt\M|\mbcl\M)' then 'Bracelet'
    when t ~ '(кольц|перстень|\mring\M|bague|\mbg\M)' then 'Ring'
    when t ~ '(подвес|pendant|кулон)' then 'Necklace / pendant'
    when t ~ '(запонк|брош|cufflink)' then 'Brooch / other'
    else 'Jewellery – other' end
  from (select btrim(lower(translate(coalesce(p_item, ''), 'ё', 'е'))) as t) x
$$;


--
-- Name: crm_health(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_health() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with q as (select q.*, c.name_flag, c.phone_flag, c.gender_flag, c.dob_flag
             from crm_queue q join crm_clients c using (client_id)),
  live as (select * from q where review_status not in ('merged','deleted','lead')),
  f as (
    select 'name' field, name_flag flag from live union all
    select 'phone', phone_flag from live union all
    select 'gender', gender_flag from live union all
    select 'dob', dob_flag from live
  ),
  keys(k, ord) as (values ('duplicates',1),('changed_after_check',2),('new_from_refresh',3),('shared_active',4),
                          ('no_phone',5),('no_dob',6),('initials_only',7),('brand_unassigned',8),('telegram_to_confirm',9)),
  raw as (
    select 'contact_channel' f, channel_raw v from crm_clients union all
    select 'purchase_for', purchase_for_raw from crm_clients union all
    select 'awareness_source', awareness_source_raw from crm_clients union all
    select 'online_interest', online_interest_raw from crm_clients union all
    select 'brand_preference', brand_preference_raw from crm_clients
  )
  select jsonb_build_object(
    'as_of', (now() at time zone 'Asia/Tashkent')::date,
    'status', (select jsonb_build_object(
        'records', count(*) filter (where review_status not in ('merged','deleted','lead')),
        'decision', count(*) filter (where review_status = 'decision'),
        'confirm', count(*) filter (where review_status = 'confirm'),
        'clean', count(*) filter (where review_status = 'clean'),
        'checked', count(*) filter (where review_status = 'checked'),
        'set_aside', count(*) filter (where review_status = 'set_aside'),
        'done', count(*) filter (where review_status in ('clean','checked')),
        'deleted', count(*) filter (where review_status = 'deleted'),
        'merged', count(*) filter (where review_status = 'merged'),
        'leads', count(*) filter (where review_status = 'lead'),
        'reviewed', count(*) filter (where reviewed_at is not null and review_status not in ('merged','deleted','lead')))
      from q),
    'fields', (select jsonb_object_agg(field, j) from (
        select field, jsonb_build_object(
          'settled', count(*) filter (where flag in ('agreed','client','delardi','manual','rule')),
          'conflict', count(*) filter (where flag = 'conflict'),
          'gap', count(*) filter (where flag = 'gap'),
          'none', count(*) filter (where flag = 'none' or flag is null)) j
        from f group by field) x),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'records', records, 'decision', decision,
                'confirm', confirm, 'done', done, 'set_aside', set_aside) order by day), '[]'::jsonb)
              from crm_health_snapshots where day >= (now() at time zone 'Asia/Tashkent')::date - 180),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'records', n) order by d), '[]'::jsonb) from (
        select (at at time zone 'Asia/Tashkent')::date d, count(distinct client_id) n from crm_events
        where at >= now() - interval '60 days'
          and action in ('field_resolved','field_reset','single_source_accepted','state_changed','merged_from',
                         'duplicate_cleared','note','do_not_contact_set','contact_note_set','referred_by_set',
                         'telegram_linked','telegram_rejected','missed_demand_set')
          and actor <> 'system'
        group by 1) a),
    'attention', (select jsonb_agg(jsonb_build_object('key', k, 'count', cardinality(ids),
                     'spend', (select coalesce(sum(lifetime_spend_uzs), 0) from crm_clients where client_id = any(ids))) order by ord)
                  from (select k, ord, crm_attention_ids(k) ids from keys) a),
    'lines', (select jsonb_build_object(
        'total', count(*), 'no_brand', count(*) filter (where brand = 'Unassigned'),
        'no_brand_spend', coalesce(sum(net_uzs) filter (where brand = 'Unassigned'), 0),
        'no_category', count(*) filter (where category is null or category = 'Unassigned'),
        'no_seller', count(*) filter (where advisor is null)) from crm_transactions),
    'unmapped', (select count(distinct (f, v)) from raw
                 where v is not null and not exists (select 1 from crm_value_mappings m where m.field = raw.f and m.raw_value = raw.v)),
    'refresh', jsonb_build_object(
        'staged', (select jsonb_build_object('id', id, 'created_at', created_at, 'period_from', period_from, 'period_to', period_to,
                     'to_decide', summary->'to_decide')
                   from crm_import_batches where status = 'staged' order by id desc limit 1),
        'last', (select jsonb_build_object('id', id, 'decided_at', decided_at, 'period_from', period_from, 'period_to', period_to,
                   'report_date', report_date, 'applied', summary->'applied')
                 from crm_import_batches where status = 'applied' order by id desc limit 1))
  )
$$;


--
-- Name: crm_health_snapshot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_health_snapshot() RETURNS void
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
  insert into crm_health_snapshots (day, taken_at, records, decision, confirm, done, set_aside, deleted, merged, fields)
  select (now() at time zone 'Asia/Tashkent')::date, now(),
         (h->'status'->>'records')::int, (h->'status'->>'decision')::int, (h->'status'->>'confirm')::int,
         (h->'status'->>'done')::int, (h->'status'->>'set_aside')::int, (h->'status'->>'deleted')::int,
         (h->'status'->>'merged')::int, h->'fields'
  from (select crm_health() h) x
  on conflict (day) do update set taken_at = excluded.taken_at, records = excluded.records, decision = excluded.decision,
    confirm = excluded.confirm, done = excluded.done, set_aside = excluded.set_aside, deleted = excluded.deleted,
    merged = excluded.merged, fields = excluded.fields
$$;


--
-- Name: crm_import_apply(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_import_apply(p_batch bigint, p_actor text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  b crm_import_batches%rowtype; v_sum jsonb; r record; k record; v_id text; v_label int;
  v_note text; v_touched text[] := '{}'; v_new text[] := '{}'; v_owner text; v_active boolean;
begin
  select * into b from crm_import_batches where id = p_batch for update;
  if not found then perform crm_fail('No such refresh.'); end if;
  if b.status <> 'staged' then perform crm_fail('This refresh has already been decided.'); end if;
  v_sum := crm_import_prepare(p_batch);        -- against the file as it stands now
  if (v_sum->'to_decide'->>'lines')::int > 0 then
    perform crm_fail('Some lines could belong to more than one client. Decide them first.');
  end if;
  -- Every existing record this refresh may touch, as it stands now, so an
  -- undo can put it back exactly.
  insert into crm_import_changes (batch_id, client_id, kind, old_value)
  select p_batch, c.client_id, 'client_row', (to_jsonb(c) - 'updated_at')::text
  from crm_clients c
  where c.client_id in (select client_id from crm_import_lines where batch_id = p_batch and client_id is not null
                        union select client_id from crm_import_cards where batch_id = p_batch and client_id is not null);
  v_note := 'Colibri refresh, ' || to_char(coalesce(b.period_from, b.period_to), 'DD.MM.YYYY') || '–' || to_char(b.period_to, 'DD.MM.YYYY') || '.';

  -- 1. A seller the file has never seen gets the next label, not yet assignable.
  select coalesce(max(substring(label from 'Sales rep (\d+)')::int), 0) into v_label from crm_sales_reps;
  for r in select distinct advisor_raw from crm_import_lines
           where batch_id = p_batch and advisor is null and advisor_raw is not null and dup_tx_id is null
           order by advisor_raw loop
    v_label := v_label + 1;
    insert into crm_sales_reps (source_name, label, active) values (r.advisor_raw, 'Sales rep ' || v_label, false);
    insert into crm_import_changes (batch_id, kind, new_value) values (p_batch, 'rep_created', 'Sales rep ' || v_label);
    update crm_import_lines set advisor = r.advisor_raw where batch_id = p_batch and advisor_raw = r.advisor_raw;
  end loop;

  -- 2. New clients, one per name, numbered on from the last reference.
  for r in select new_key, min(btrim(name_raw)) name_raw, min(phone_norm) phone,
                  (array_agg(advisor order by net desc nulls last))[1] top_advisor
           from crm_import_lines
           where batch_id = p_batch and match = 'new' and dup_tx_id is null and coalesce(decision, '') <> 'skip'
           group by new_key order by min(sold_at), new_key loop
    select 'DLD-' || lpad((coalesce(max(substring(client_id from 5)::int), 0) + 1)::text, 4, '0') into v_id
    from crm_clients where client_id ~ '^DLD-\d+$';
    select * into k from crm_import_cards
    where batch_id = p_batch and match = 'new_client'
      and (phone_norm = r.phone or name_key = r.new_key or crm_name_key(concat_ws(' ', surname, first_name)) = r.new_key)
    order by (phone_norm = r.phone) desc nulls last, row_no limit 1;
    v_active := exists (select 1 from crm_sales_reps where source_name = r.top_advisor and active);
    v_owner := case when v_active then r.top_advisor else 'Unassigned' end;
    insert into crm_clients (client_id, record_type, in_colibri, in_marketing, name_colibri, phone_colibri, gender_colibri,
                             dob_colibri, patronymic, client_owner, assigned_owner, assigned_by, assigned_at, assignment_reason,
                             created_by_batch)
    values (v_id, 'client', true, false, r.name_raw, coalesce(r.phone, k.phone_norm),
            case upper(btrim(k.gender)) when 'М' then 'M' when 'M' then 'M' when 'Ж' then 'F' when 'F' then 'F' end,
            crm_plausible_dob(k.dob, coalesce(b.report_date, b.period_to)), nullif(btrim(k.patronymic), ''),
            coalesce(r.top_advisor, 'Unassigned'), v_owner, p_actor, now(),
            case when v_active then 'rule: new client, owned by the rep who made the sale'
                 else 'rule: new client, seller not a current rep — shared list' end,
            p_batch);
    perform crm_recompute_flags(v_id);
    update crm_import_lines set client_id = v_id where batch_id = p_batch and match = 'new' and new_key = r.new_key;
    insert into crm_import_changes (batch_id, client_id, kind) values (p_batch, v_id, 'client_created');
    insert into crm_events (client_id, actor, action, note) values (v_id, p_actor, 'created_by_import', v_note);
    v_new := v_new || v_id;
  end loop;

  -- 3. The new lines.
  with ins as (
    insert into crm_transactions (client_id, sold_at, brand, category, item, qty, gross_uzs, discount_pct, net_uzs, advisor, article, import_batch)
    select client_id, sold_at, brand, category, item, qty, gross, discount_pct, net, advisor, btrim(article), p_batch
    from crm_import_lines
    where batch_id = p_batch and dup_tx_id is null and client_id is not null and coalesce(decision, '') <> 'skip'
    returning id, client_id
  )
  insert into crm_import_changes (batch_id, client_id, kind, tx_id) select p_batch, client_id, 'tx_added', id from ins;
  select coalesce(array_agg(distinct client_id), '{}') into v_touched
  from crm_import_changes where batch_id = p_batch and kind = 'tx_added';

  -- 4. Known lines: a brand or seller the file lacked.
  insert into crm_import_changes (batch_id, client_id, kind, field, old_value, new_value, tx_id)
  select p_batch, t.client_id, 'tx_field', 'brand', t.brand, l.fill_brand, t.id
  from crm_import_lines l join crm_transactions t on t.id = l.dup_tx_id
  where l.batch_id = p_batch and l.fill_brand is not null;
  insert into crm_import_changes (batch_id, client_id, kind, field, old_value, new_value, tx_id)
  select p_batch, t.client_id, 'tx_field', 'advisor', t.advisor, l.fill_advisor, t.id
  from crm_import_lines l join crm_transactions t on t.id = l.dup_tx_id
  where l.batch_id = p_batch and l.fill_advisor is not null;
  update crm_transactions t set brand = l.fill_brand from crm_import_lines l
  where l.batch_id = p_batch and l.dup_tx_id = t.id and l.fill_brand is not null;
  update crm_transactions t set advisor = l.fill_advisor from crm_import_lines l
  where l.batch_id = p_batch and l.dup_tx_id = t.id and l.fill_advisor is not null;

  -- 5. A questionnaire-only person who has now bought becomes a client.
  for r in select distinct l.client_id, min(btrim(l.name_raw)) name_raw, min(l.phone_norm) phone
           from crm_import_lines l join crm_clients c on c.client_id = l.client_id
           where l.batch_id = p_batch and l.dup_tx_id is null and c.record_type = 'prospect'
           group by l.client_id loop
    insert into crm_import_changes (batch_id, client_id, kind, field, old_value, new_value)
    select p_batch, r.client_id, 'field_changed', f, o, n
    from crm_clients c, lateral (values ('record_type', c.record_type, 'client'),
                                        ('in_colibri', c.in_colibri::text, 'true'),
                                        ('name_colibri', c.name_colibri, coalesce(c.name_colibri, r.name_raw)),
                                        ('phone_colibri', c.phone_colibri, coalesce(c.phone_colibri, r.phone))) v(f, o, n)
    where c.client_id = r.client_id and o is distinct from n;
    update crm_clients set record_type = 'client', in_colibri = true,
      name_colibri = coalesce(name_colibri, r.name_raw), phone_colibri = coalesce(phone_colibri, r.phone)
    where client_id = r.client_id;
    insert into crm_events (client_id, actor, action, note) values (r.client_id, p_actor, 'became_client', v_note);
  end loop;

  -- 6. What the POS cards now say.
  for r in select * from crm_import_card_changes(p_batch) loop
    insert into crm_import_changes (batch_id, client_id, kind, field, old_value, new_value)
    values (p_batch, r.client_id, 'field_changed',
            case r.field when 'phone' then 'phone_colibri' when 'dob' then 'dob_colibri' when 'gender' then 'gender_colibri'
                         when 'name' then 'name_colibri' else r.field end, r.old_value, r.new_value);
    if r.field = 'phone' then
      update crm_clients set phone_colibri = r.new_value,
        phone_flag = case when phone_flag = 'rule' then 'none' else phone_flag end where client_id = r.client_id;
    elsif r.field = 'dob' then
      update crm_clients set dob_colibri = r.new_value::date,
        dob_flag = case when dob_flag = 'rule' then 'none' else dob_flag end where client_id = r.client_id;
    elsif r.field = 'gender' then
      update crm_clients set gender_colibri = r.new_value,
        gender_flag = case when gender_flag = 'rule' then 'none' else gender_flag end where client_id = r.client_id;
    elsif r.field = 'name' then
      update crm_clients set name_colibri = r.new_value,
        name_flag = case when name_flag = 'rule' then 'none' else name_flag end where client_id = r.client_id;
    elsif r.field = 'patronymic' then
      update crm_clients set patronymic = r.new_value where client_id = r.client_id;
    end if;
    perform crm_recompute_flags(r.client_id);
    insert into crm_events (client_id, actor, action, field, old_value, new_value, note)
    values (r.client_id, p_actor, 'colibri_changed', r.field,
            case when r.field = 'phone' then null else r.old_value end,
            case when r.field = 'phone' then null else r.new_value end, v_note);
  end loop;

  -- 7. Totals, a line in each client's history, then the classes.
  perform crm_recompute_purchases(v_touched);
  insert into crm_events (client_id, actor, action, new_value, note)
  select c.client_id, p_actor, 'purchases_imported', count(*)::text,
         v_note || ' ' || count(*) || ' line(s), ' || to_char(sum(t.net_uzs), 'FM999G999G999G999') || ' UZS.'
  from crm_import_changes c join crm_transactions t on t.id = c.tx_id
  where c.batch_id = p_batch and c.kind = 'tx_added'
  group by c.client_id;
  perform crm_recompute_segments('import');
  update crm_import_changes x set new_value = (to_jsonb(c) - 'updated_at')::text
  from crm_clients c where x.batch_id = p_batch and x.kind = 'client_row' and c.client_id = x.client_id;

  update crm_import_batches set status = 'applied', decided_at = now(), decided_by = p_actor,
    summary = v_sum || jsonb_build_object('applied', jsonb_build_object(
      'new_clients', cardinality(v_new), 'clients_touched', cardinality(v_touched),
      'lines_added', (select count(*) from crm_import_changes where batch_id = p_batch and kind = 'tx_added')))
  where id = p_batch;
  delete from crm_import_buyers where batch_id = p_batch;
  delete from crm_import_sales where batch_id = p_batch;
  delete from crm_import_cards where batch_id = p_batch;
  return (select summary from crm_import_batches where id = p_batch);
end $_$;


--
-- Name: crm_import_card_changes(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_import_card_changes(p_batch bigint) RETURNS TABLE(client_id text, field text, old_value text, new_value text)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with b as (select coalesce(report_date, (now() at time zone 'Asia/Tashkent')::date) asof from crm_import_batches where id = p_batch),
  k as (
    select k.client_id as cid, count(*) n,
           array_agg(distinct k.phone_norm) filter (where k.phone_norm is not null) phones,
           array_agg(distinct crm_plausible_dob(k.dob, b.asof)) filter (where crm_plausible_dob(k.dob, b.asof) is not null) dobs,
           count(*) filter (where crm_plausible_dob(k.dob, b.asof) is not null) n_dob,
           array_agg(distinct case upper(btrim(k.gender)) when 'М' then 'M' when 'M' then 'M' when 'Ж' then 'F' when 'F' then 'F' end)
             filter (where upper(btrim(k.gender)) in ('М','M','Ж','F')) genders,
           count(*) filter (where upper(btrim(k.gender)) in ('М','M','Ж','F')) n_gender,
           array_agg(distinct btrim(k.patronymic)) filter (where nullif(btrim(k.patronymic), '') is not null) patrs,
           count(*) filter (where nullif(btrim(k.patronymic), '') is not null) n_patr
    from crm_import_cards k, b
    where k.batch_id = p_batch and k.match in ('phone','name') and k.client_id is not null
    group by k.client_id
  ), c as (
    select c.client_id as id, c.phone_colibri, c.dob_colibri, c.gender_colibri, c.patronymic,
           crm_phones_of(c.phone_colibri, null, null, null) old_phones,
           k.n, k.phones, k.dobs, k.n_dob, k.genders, k.n_gender, k.patrs, k.n_patr
    from crm_clients c join k on k.cid = c.client_id
  )
  select id, 'phone', phone_colibri,
         array_to_string(array(select p from unnest(old_phones) p where p = any(phones)) ||
                         array(select p from unnest(phones) p where not p = any(old_phones)), '; ')
  from c where phones is not null and not (phones <@ old_phones and old_phones <@ phones)
  union all
  select id, 'dob', dob_colibri::text, dobs[1]::text
  from c where n_dob = n and cardinality(dobs) = 1 and dob_colibri is distinct from dobs[1]
  union all
  select id, 'gender', gender_colibri, genders[1]
  from c where n_gender = n and cardinality(genders) = 1 and gender_colibri is distinct from genders[1]
  union all
  select id, 'patronymic', patronymic, patrs[1]
  from c where n_patr = n and cardinality(patrs) = 1 and nullif(btrim(patronymic), '') is null
  union all
  select l.client_id, 'name', cc.name_colibri, min(btrim(l.name_raw))
  from crm_import_lines l join crm_clients cc on cc.client_id = l.client_id
  where l.batch_id = p_batch and l.match = 'phone' and l.dup_tx_id is null
    and crm_name_key(cc.name_colibri) is distinct from l.name_key
  group by l.client_id, cc.name_colibri
$$;


--
-- Name: crm_import_decide(bigint, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_import_decide(p_batch bigint, p_name_key text, p_decision text, p_actor text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare b crm_import_batches%rowtype; n int;
begin
  select * into b from crm_import_batches where id = p_batch for update;
  if not found or b.status <> 'staged' then perform crm_fail('This refresh is no longer waiting for a decision.'); end if;
  if p_decision not in ('new','skip','clear') and not exists (
       select 1 from crm_import_lines l join crm_clients c on c.client_id = p_decision
       where l.batch_id = p_batch and l.name_key = p_name_key and p_decision = any(l.candidates)
         and c.record_state not in ('merged','deleted','to_delete')) then
    perform crm_fail('Choose one of the suggested clients, a new client, or leave the line out.');
  end if;
  update crm_import_lines set decision = nullif(p_decision, 'clear')
  where batch_id = p_batch and name_key = p_name_key and candidates is not null and dup_tx_id is null;
  get diagnostics n = row_count;
  if n = 0 then perform crm_fail('There is nothing to decide for that name.'); end if;
  return crm_import_prepare(p_batch);
end $$;


--
-- Name: crm_import_detail(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_import_detail(p_batch bigint) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with b as (select * from crm_import_batches where id = p_batch),
  l as (select l.*, r.label seller_label from crm_import_lines l left join crm_sales_reps r on r.source_name = l.advisor
        where l.batch_id = p_batch),
  fresh as (select * from l where dup_tx_id is null),
  q as (select client_id, display_name, record_type, lifetime_spend_uzs, last_purchase_at, client_owner, review_status from crm_queue),
  ql as (select q.*, r.label owner_label from q left join crm_sales_reps r on r.source_name = q.client_owner),
  ch as (select * from crm_import_card_changes(p_batch) where (select status from b) = 'staged')
  select jsonb_build_object(
    'batch', (select jsonb_build_object('id', id, 'status', status, 'created_at', created_at, 'created_by', created_by,
                'period_from', period_from, 'period_to', period_to, 'report_date', report_date,
                'decided_at', decided_at, 'decided_by', decided_by, 'undone_at', undone_at, 'undone_by', undone_by,
                'files', (select coalesce(jsonb_agg(jsonb_build_object('kind', x->>'kind', 'name', x->>'name')), '[]'::jsonb)
                          from jsonb_array_elements(files) x where x ? 'kind'),
                'summary', summary) from b),
    'new_clients', (select coalesce(jsonb_agg(j order by j->>'first', j->>'name'), '[]'::jsonb) from (
        select jsonb_build_object('key', fl.new_key, 'name', min(btrim(fl.name_raw)), 'lines', count(*), 'spend', sum(fl.net),
          'first', min(fl.sold_at), 'last', max(fl.sold_at), 'decided', bool_or(fl.decision = 'new'),
          'seller', (array_agg(coalesce(fl.seller_label, case when fl.advisor_raw is not null then '+' end) order by fl.net desc nulls last))[1],
          'card', (select jsonb_build_object('gender', case upper(btrim(k.gender)) when 'М' then 'M' when 'M' then 'M' when 'Ж' then 'F' when 'F' then 'F' end,
                          'dob', crm_plausible_dob(k.dob, coalesce((select report_date from b), (select period_to from b))) is not null,
                          'phone', k.phone_norm is not null)
                   from crm_import_cards k where k.batch_id = p_batch and k.match = 'new_client'
                     and (k.phone_norm = min(fl.phone_norm) or k.name_key = fl.new_key
                          or crm_name_key(concat_ws(' ', k.surname, k.first_name)) = fl.new_key)
                   order by (k.phone_norm = min(fl.phone_norm)) desc nulls last, k.row_no limit 1)) j
        from fresh fl where fl.match = 'new' and coalesce(fl.decision, '') <> 'skip' group by fl.new_key) x),
    'to_decide', (select coalesce(jsonb_agg(j order by j->>'name'), '[]'::jsonb) from (
        select jsonb_build_object('name_key', fl.name_key, 'name', min(btrim(fl.name_raw)), 'lines', count(*), 'spend', sum(fl.net),
          'first', min(fl.sold_at), 'last', max(fl.sold_at), 'decision', min(fl.decision),
          'candidates', (select coalesce(jsonb_agg(jsonb_build_object('client_id', ql.client_id, 'name', ql.display_name,
                            'record_type', ql.record_type, 'spend', ql.lifetime_spend_uzs, 'last', ql.last_purchase_at,
                            'owner', coalesce(ql.owner_label, 'Unassigned'),
                            'by', case when crm_name_key(c.name_colibri) = fl.name_key then 'name' else 'phone' end)
                            order by ql.client_id), '[]'::jsonb)
                         from ql join crm_clients c using (client_id)
                         where ql.client_id in (select unnest(f2.candidates) from fresh f2 where f2.name_key = fl.name_key))) j
        from fresh fl where fl.candidates is not null group by fl.name_key) x),
    'by_phone', (select coalesce(jsonb_agg(j), '[]'::jsonb) from (
        select jsonb_build_object('client_id', fl.client_id, 'name', min(ql.display_name), 'export_name', min(btrim(fl.name_raw)),
          'lines', count(*), 'spend', sum(fl.net)) j
        from fresh fl join ql using (client_id) where fl.match = 'phone' group by fl.client_id) x),
    'added', (select coalesce(jsonb_agg(j order by (j->>'spend')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('client_id', fl.client_id, 'name', min(ql.display_name), 'lines', count(*), 'spend', sum(fl.net),
          'last', max(fl.sold_at), 'record_type', min(ql.record_type)) j
        from fresh fl join ql using (client_id)
        where fl.match in ('name','phone','decided') and coalesce(fl.decision, '') <> 'skip' group by fl.client_id) x),
    'changes', (select coalesce(jsonb_agg(jsonb_build_object('client_id', ch.client_id, 'name', ql.display_name, 'field', ch.field,
                   'old', case when ch.field = 'phone' then null else ch.old_value end,
                   'new', case when ch.field = 'phone' then null else ch.new_value end) order by ch.field, ch.client_id), '[]'::jsonb)
                from ch left join ql using (client_id)),
    'fills', (select jsonb_build_object(
        'brand', (select coalesce(jsonb_object_agg(fill_brand, n), '{}'::jsonb) from (
                    select fill_brand, count(*) n from l where fill_brand is not null group by 1) y),
        'seller', (select count(*) from l where fill_advisor is not null))),
    'no_brand', (select coalesce(jsonb_agg(jsonb_build_object('sold_at', sold_at, 'item', left(item, 90), 'net', net,
                   'name', coalesce((select display_name from q where q.client_id = fl.client_id), btrim(name_raw)))
                   order by sold_at), '[]'::jsonb)
                 from fresh fl where brand = 'Unassigned' and coalesce(decision, '') <> 'skip'),
    'missing', (select coalesce(jsonb_agg(jsonb_build_object('client_id', t.client_id, 'name', q.display_name, 'sold_at', t.sold_at,
                   'item', left(t.item, 90), 'brand', t.brand, 'net', t.net_uzs) order by t.sold_at desc), '[]'::jsonb)
                from crm_transactions t join q using (client_id), b
                where b.status = 'staged'
                  and t.sold_at between coalesce(b.period_from, b.period_to) and b.period_to
                  and not exists (select 1 from l where l.dup_tx_id = t.id)),
    'done', case when (select status from b) in ('applied','undone') then jsonb_build_object(
        'created', (select coalesce(jsonb_agg(jsonb_build_object('client_id', x.client_id, 'name', q.display_name)
                      order by x.client_id), '[]'::jsonb)
                    from crm_import_changes x left join q using (client_id) where x.batch_id = p_batch and x.kind = 'client_created'),
        'added', (select coalesce(jsonb_agg(j order by (j->>'spend')::numeric desc), '[]'::jsonb) from (
                    select jsonb_build_object('client_id', x.client_id, 'name', min(q.display_name), 'lines', count(*),
                      'spend', coalesce(sum(t.net_uzs), 0)) j
                    from crm_import_changes x left join crm_transactions t on t.id = x.tx_id left join q on q.client_id = x.client_id
                    where x.batch_id = p_batch and x.kind = 'tx_added' group by x.client_id) y),
        'fields', (select coalesce(jsonb_agg(jsonb_build_object('client_id', x.client_id, 'name', q.display_name, 'field', x.field,
                      'old', case when x.field like 'phone%' then null else x.old_value end,
                      'new', case when x.field like 'phone%' then null else x.new_value end) order by x.id), '[]'::jsonb)
                   from crm_import_changes x left join q using (client_id) where x.batch_id = p_batch and x.kind = 'field_changed'),
        'line_fields', (select count(*) from crm_import_changes where batch_id = p_batch and kind = 'tx_field'),
        'reps_created', (select count(*) from crm_import_changes where batch_id = p_batch and kind = 'rep_created'))
      end
  )
$$;


--
-- Name: crm_import_discard(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_import_discard(p_batch bigint, p_actor text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare b crm_import_batches%rowtype;
begin
  select * into b from crm_import_batches where id = p_batch for update;
  if not found or b.status <> 'staged' then perform crm_fail('Only a refresh waiting for a decision can be discarded.'); end if;
  update crm_import_batches set status = 'discarded', decided_at = now(), decided_by = p_actor where id = p_batch;
  delete from crm_import_buyers where batch_id = p_batch;
  delete from crm_import_sales where batch_id = p_batch;
  delete from crm_import_cards where batch_id = p_batch;
  delete from crm_import_lines where batch_id = p_batch;
end $$;


--
-- Name: crm_import_list(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_import_list() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'status', b.status, 'created_at', b.created_at, 'created_by', b.created_by,
    'period_from', b.period_from, 'period_to', b.period_to, 'report_date', b.report_date,
    'decided_at', b.decided_at, 'decided_by', b.decided_by, 'undone_at', b.undone_at, 'undone_by', b.undone_by,
    'files', (select coalesce(jsonb_agg(jsonb_build_object('kind', x->>'kind', 'name', x->>'name')), '[]'::jsonb)
              from jsonb_array_elements(b.files) x where x ? 'kind'),
    'summary', b.summary,
    'latest_applied', b.status = 'applied' and b.id = (select max(id) from crm_import_batches where status = 'applied'))
    order by b.id desc), '[]'::jsonb)
  from crm_import_batches b
$$;


--
-- Name: crm_import_prepare(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_import_prepare(p_batch bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare b crm_import_batches%rowtype; v_summary jsonb;
begin
  select * into b from crm_import_batches where id = p_batch for update;
  if not found then perform crm_fail('No such refresh.'); end if;
  if b.status <> 'staged' then perform crm_fail('This refresh has already been decided.'); end if;

  update crm_import_lines set phone_norm = null, advisor = null, advisor_raw = null, brand = null, category = null,
    client_id = null, match = null, candidates = null, new_key = null, dup_tx_id = null, fill_brand = null, fill_advisor = null
  where batch_id = p_batch;
  update crm_import_sales set used = false where batch_id = p_batch;
  update crm_import_cards set client_id = null, match = null where batch_id = p_batch;

  update crm_import_lines l set phone_norm = x.phone
  from (select name_key, min(phone_norm) phone from crm_import_buyers
        where batch_id = p_batch and phone_norm is not null
        group by name_key having count(distinct phone_norm) = 1) x
  where l.batch_id = p_batch and l.name_key = x.name_key;

  with recs as (
    select c.client_id, coalesce(case when c.record_state = 'merged' then c.merged_into end, c.client_id) as target,
           c.record_state, crm_name_key(c.name_colibri) as nk,
           crm_phones_of(c.phone_colibri, c.phone_marketing, c.phone_confirmed, c.match_phone) as phones
    from crm_clients c
  ), keyphones as (
    select name_key, array_agg(distinct phone_norm) phones from crm_import_buyers
    where batch_id = p_batch and phone_norm is not null group by name_key
  ), keys as (
    select distinct l.name_key from crm_import_lines l where l.batch_id = p_batch
  ), cand as (
    select k.name_key,
      array(select distinct r.target from recs r where r.nk = k.name_key and r.record_state not in ('deleted','to_delete')) as by_name,
      array(select distinct r.target from recs r, keyphones kp
            where kp.name_key = k.name_key and r.record_state not in ('deleted','to_delete') and r.phones && kp.phones) as by_phone,
      exists (select 1 from recs r where r.nk = k.name_key and r.record_state in ('deleted','to_delete')) as hits_deleted
    from keys k
  )
  update crm_import_lines l set
    client_id = case
      when cardinality(c.by_name) = 1 and (cardinality(c.by_phone) = 0 or c.by_phone = c.by_name) then c.by_name[1]
      when cardinality(c.by_name) = 0 and cardinality(c.by_phone) = 1 then c.by_phone[1] end,
    match = case
      when cardinality(c.by_name) = 1 and (cardinality(c.by_phone) = 0 or c.by_phone = c.by_name) then 'name'
      when cardinality(c.by_name) = 0 and cardinality(c.by_phone) = 1 then 'phone'
      when cardinality(c.by_name) = 0 and cardinality(c.by_phone) = 0 and not c.hits_deleted then 'new'
      else 'ambiguous' end,
    candidates = case when not (cardinality(c.by_name) = 1 and (cardinality(c.by_phone) = 0 or c.by_phone = c.by_name))
                       and not (cardinality(c.by_name) = 0 and cardinality(c.by_phone) <= 1)
                      then array(select distinct x from unnest(c.by_name || c.by_phone) x) end
  from cand c
  where l.batch_id = p_batch and l.name_key = c.name_key;
  update crm_import_lines set candidates = '{}' where batch_id = p_batch and match = 'ambiguous' and candidates is null;
  update crm_import_lines set client_id = case when decision in ('new','skip') then null else decision end,
         match = case when decision = 'new' then 'new' when decision = 'skip' then 'ambiguous' else 'decided' end
  where batch_id = p_batch and match = 'ambiguous' and decision is not null;
  update crm_import_lines set new_key = coalesce(name_key, 'row' || row_no) where batch_id = p_batch and match = 'new';

  with l as (
    select row_no, coalesce(client_id, x.cand) as cid, sold_at, qty, net, gross, coalesce(btrim(article), '') art
    from crm_import_lines il
    left join lateral unnest(case when il.match = 'ambiguous' then il.candidates end) as x(cand) on true
    where il.batch_id = p_batch and (il.client_id is not null or il.match = 'ambiguous')
  ), ln as (
    select *, row_number() over (partition by cid, sold_at, qty, net, gross, art order by row_no) rn from l
  ), t as (
    select id, client_id cid, sold_at, qty, net_uzs net, gross_uzs gross, coalesce(btrim(article), '') art,
           row_number() over (partition by client_id, sold_at, qty, net_uzs, gross_uzs, coalesce(btrim(article), '') order by id) rn
    from crm_transactions
  ), m as (
    select distinct on (ln.row_no) ln.row_no, ln.cid, t.id
    from ln join t using (cid, sold_at, qty, net, gross, art, rn)
    order by ln.row_no, t.id
  )
  update crm_import_lines il set dup_tx_id = m.id,
    client_id = coalesce(il.client_id, m.cid),
    match = case when il.match = 'ambiguous' then 'decided' else il.match end
  from m where il.batch_id = p_batch and il.row_no = m.row_no;

  with s as (
    select row_no, sold_at, regexp_replace(btrim(article), '\s+[A-Z]{2}$', '') art, qty, seller, brand_raw,
           row_number() over (partition by sold_at, regexp_replace(btrim(article), '\s+[A-Z]{2}$', ''), qty order by row_no) rn
    from crm_import_sales where batch_id = p_batch
  ), l as (
    select row_no, sold_at, btrim(article) art, qty,
           row_number() over (partition by sold_at, btrim(article), qty order by row_no) rn
    from crm_import_lines where batch_id = p_batch
  ), m as (
    select l.row_no, s.row_no srow, s.seller, s.brand_raw from l join s using (sold_at, art, qty, rn)
  ), u as (
    update crm_import_sales s set used = true from m where s.batch_id = p_batch and s.row_no = m.srow returning s.row_no
  )
  update crm_import_lines il set advisor_raw = nullif(m.seller, ''), advisor = crm_rep_source(nullif(m.seller, '')),
         brand = crm_brand_canon(nullif(m.brand_raw, ''))
  from m where il.batch_id = p_batch and il.row_no = m.row_no;

  update crm_import_lines il set
    fill_brand = case when t.brand = 'Unassigned' and il.brand is not null then il.brand end,
    fill_advisor = case when t.advisor is null then il.advisor end
  from crm_transactions t
  where il.batch_id = p_batch and il.dup_tx_id = t.id;

  update crm_import_lines il set
    brand = coalesce(
      (select t.brand from crm_transactions t where btrim(t.article) = btrim(il.article) and t.brand <> 'Unassigned'
       group by t.brand order by count(*) desc limit 1),
      il.brand, crm_guess_brand(il.item), 'Unassigned'),
    category = coalesce(
      (select t.category from crm_transactions t where btrim(t.article) = btrim(il.article) and t.category <> 'Unassigned'
       group by t.category order by count(*) desc limit 1),
      crm_guess_category(il.item))
  where il.batch_id = p_batch and il.dup_tx_id is null;

  with recs as (
    select c.client_id, crm_name_key(c.name_colibri) nk,
           crm_phones_of(c.phone_colibri, null, null, null) phones
    from crm_clients c where c.record_state not in ('merged','deleted','to_delete')
  ), ph as (
    select k.row_no, array(select distinct r.client_id from recs r where k.phone_norm = any(r.phones)) ids
    from crm_import_cards k where k.batch_id = p_batch
  ), nm as (
    select k.row_no, array(select distinct r.client_id from recs r
                           where r.nk in (k.name_key, crm_name_key(concat_ws(' ', k.surname, k.first_name)))) ids
    from crm_import_cards k where k.batch_id = p_batch
  )
  update crm_import_cards k set
    client_id = case when cardinality(ph.ids) = 1 then ph.ids[1]
                     when cardinality(ph.ids) > 1 and cardinality(array(select unnest(ph.ids) intersect select unnest(nm.ids))) = 1
                       then (array(select unnest(ph.ids) intersect select unnest(nm.ids)))[1]
                     when cardinality(ph.ids) = 0 and cardinality(nm.ids) = 1 then nm.ids[1] end,
    match = case when cardinality(ph.ids) = 1 then 'phone'
                 when cardinality(ph.ids) > 1 and cardinality(array(select unnest(ph.ids) intersect select unnest(nm.ids))) = 1 then 'phone'
                 when cardinality(ph.ids) = 0 and cardinality(nm.ids) = 1 then 'name'
                 when cardinality(ph.ids) + cardinality(nm.ids) = 0 then 'none' else 'ambiguous' end
  from ph join nm using (row_no)
  where k.batch_id = p_batch and k.row_no = ph.row_no;
  update crm_import_cards k set match = 'new_client'
  where k.batch_id = p_batch and k.match = 'none'
    and exists (select 1 from crm_import_lines l where l.batch_id = p_batch and l.match = 'new'
                and (l.phone_norm = k.phone_norm or l.name_key in (k.name_key, crm_name_key(concat_ws(' ', k.surname, k.first_name)))));

  v_summary := crm_import_summary(p_batch);
  update crm_import_batches set summary = v_summary where id = p_batch;
  return v_summary;
end $_$;


--
-- Name: crm_import_stage(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_import_stage(p_doc jsonb, p_actor text) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_batch bigint; v_period text := p_doc->'meta'->>'period';
  v_to date := coalesce(p_doc->'meta'->>'period_to', p_doc->'meta'->>'lines_to')::date;
  v_rep date := (p_doc->'meta'->>'report_date')::date;
begin
  if exists (select 1 from crm_import_batches where status = 'staged') then
    perform crm_fail('Another refresh is waiting for a decision. Apply or discard it first.');
  end if;
  insert into crm_import_batches (created_by, period_from, period_to, report_date, files)
  values (p_actor,
          coalesce(p_doc->'meta'->>'period_from', p_doc->'meta'->>'lines_from')::date,
          least(v_to, coalesce(v_rep - 1, v_to)),
          v_rep,
          coalesce(p_doc->'files', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('period', v_period, 'counts', p_doc->'meta'->'counts')))
  returning id into v_batch;

  insert into crm_import_buyers (batch_id, row_no, surname, first_name, patronymic, phone_raw, phone_norm, items, amount, name_key)
  select v_batch, (r->>0)::int, r->>1, r->>2, r->>3, r->>4, crm_phone_norm(r->>4),
         (r->>5)::numeric::int, (r->>6)::numeric,
         crm_name_key(concat_ws(' ', r->>1, r->>2, r->>3))
  from jsonb_array_elements(coalesce(p_doc->'buyers', '[]'::jsonb)) r;

  insert into crm_import_lines (batch_id, row_no, sold_at, name_raw, name_key, card_no, reg_discount, item, article,
                                colour, size, qty, gross, discount_pct, net, note)
  select v_batch, (r->>0)::int, (r->>1)::date, r->>2, crm_name_key(r->>2), r->>3, (r->>4)::numeric, r->>5, btrim(r->>6),
         r->>7, r->>8, (r->>9)::numeric::int, (r->>10)::numeric, (r->>11)::numeric, (r->>12)::numeric, r->>13
  from jsonb_array_elements(coalesce(p_doc->'lines', '[]'::jsonb)) r;

  insert into crm_import_sales (batch_id, row_no, sold_at, item, article, qty, size, seller, gross, net, discount_pct, note, brand_raw)
  select v_batch, (r->>0)::int, (r->>1)::date, r->>2, btrim(r->>3), (r->>4)::numeric::int, r->>5, btrim(r->>6),
         (r->>7)::numeric, (r->>8)::numeric, (r->>9)::numeric, r->>10, btrim(r->>11)
  from jsonb_array_elements(coalesce(p_doc->'sales', '[]'::jsonb)) r;

  insert into crm_import_cards (batch_id, row_no, surname, first_name, patronymic, phone_raw, phone_norm, dob, gender,
                                reg_discount, super_discount, accumulated, name_key)
  select v_batch, (r->>0)::int, r->>1, r->>2, r->>3, r->>4, crm_phone_norm(r->>4), (r->>5)::date, r->>6,
         (r->>7)::numeric, (r->>8)::numeric, (r->>9)::numeric,
         crm_name_key(concat_ws(' ', r->>1, r->>2, r->>3))
  from jsonb_array_elements(coalesce(p_doc->'cards', '[]'::jsonb)) r;

  return v_batch;
end $$;


--
-- Name: FUNCTION crm_import_stage(p_doc jsonb, p_actor text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.crm_import_stage(p_doc jsonb, p_actor text) IS 'Stages one Colibri refresh (purchases, daily sales, client cards) into the import tables. The period a refresh speaks for ends the day before the export''s report date when that comes first: an export run during the day may not hold that day''s sales, and without the cap they would be listed as missing from the export.';


--
-- Name: crm_import_summary(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_import_summary(p_batch bigint) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with b as (select * from crm_import_batches where id = p_batch),
  l as (select * from crm_import_lines where batch_id = p_batch),
  fresh as (select * from l where dup_tx_id is null and coalesce(decision, '') <> 'skip'),
  missing as (
    select t.* from crm_transactions t, b
    where t.sold_at between coalesce(b.period_from, b.period_to) and b.period_to
      and not exists (select 1 from l where l.dup_tx_id = t.id)
      and t.import_batch is distinct from p_batch
  ),
  ch as (select * from crm_import_card_changes(p_batch))
  select jsonb_build_object(
    'period_from', (select period_from from b), 'period_to', (select period_to from b),
    'report_date', (select report_date from b),
    'lines', (select count(*) from l),
    'known_lines', (select count(*) from l where dup_tx_id is not null),
    'added', jsonb_build_object(
      'lines', (select count(*) from fresh where client_id is not null and match <> 'new'),
      'spend', (select coalesce(sum(net), 0) from fresh where client_id is not null and match <> 'new'),
      'clients', (select count(distinct client_id) from fresh where client_id is not null and match <> 'new')),
    'new_clients', jsonb_build_object(
      'clients', (select count(distinct new_key) from fresh where match = 'new'),
      'lines', (select count(*) from fresh where match = 'new'),
      'spend', (select coalesce(sum(net), 0) from fresh where match = 'new')),
    'to_decide', jsonb_build_object(
      'lines', (select count(*) from fresh where match = 'ambiguous'),
      'names', (select count(distinct name_key) from fresh where match = 'ambiguous')),
    'skipped', (select count(*) from l where decision = 'skip' and dup_tx_id is null),
    'by_phone', (select count(distinct client_id) from fresh where match = 'phone'),
    'no_brand', (select count(*) from fresh where brand = 'Unassigned'),
    'no_seller', (select count(*) from fresh where advisor is null),
    'missing_from_export', jsonb_build_object('lines', (select count(*) from missing),
                                              'spend', (select coalesce(sum(net_uzs), 0) from missing)),
    'cards', jsonb_build_object(
      'total', (select count(*) from crm_import_cards where batch_id = p_batch),
      'matched', (select count(*) from crm_import_cards where batch_id = p_batch and match in ('phone','name')),
      'new_client', (select count(*) from crm_import_cards where batch_id = p_batch and match = 'new_client'),
      'unmatched', (select count(*) from crm_import_cards where batch_id = p_batch and match = 'none'),
      'ambiguous', (select count(*) from crm_import_cards where batch_id = p_batch and match = 'ambiguous')),
    'changes', (select coalesce(jsonb_object_agg(field, n), '{}'::jsonb) from (select field, count(*) n from ch group by field) x),
    'fills', jsonb_build_object(
      'brand', (select count(*) from l where fill_brand is not null),
      'seller', (select count(*) from l where fill_advisor is not null)),
    'unknown_sellers', (select count(distinct advisor_raw) from l where advisor is null and advisor_raw is not null),
    'sales_rows', (select count(*) from crm_import_sales where batch_id = p_batch),
    'sales_used', (select count(*) from crm_import_sales where batch_id = p_batch and used)
  )
$$;


--
-- Name: crm_import_undo(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_import_undo(p_batch bigint, p_actor text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare b crm_import_batches%rowtype; v_ids text[]; v_worked int; v_kept int := 0; r record;
  v_patch jsonb; v_n int; v_set text; v_redo text[] := '{}';
begin
  select * into b from crm_import_batches where id = p_batch for update;
  if not found or b.status <> 'applied' then perform crm_fail('Only an applied refresh can be undone.'); end if;
  if exists (select 1 from crm_import_batches where status = 'applied' and id > p_batch) then
    perform crm_fail('A later refresh has been applied. Undo that one first.');
  end if;
  select count(*) into v_worked from crm_events e join crm_clients c on c.client_id = e.client_id
  where c.created_by_batch = p_batch
    and e.action not in ('created_by_import','purchases_imported','colibri_changed','class_changed');
  if v_worked > 0 then
    perform crm_fail('Clients this refresh created have been worked on since. Undoing it would lose that work.');
  end if;
  if exists (select 1 from crm_clients where record_state = 'merged'
             and (created_by_batch = p_batch or merged_into in (select client_id from crm_clients where created_by_batch = p_batch))) then
    perform crm_fail('A client this refresh created has been merged since. Undo the merge first.');
  end if;

  select coalesce(array_agg(distinct client_id), '{}') into v_ids
  from crm_import_changes where batch_id = p_batch and client_id is not null;

  delete from crm_transactions where import_batch = p_batch;

  -- Values the refresh changed go back, unless someone has changed them since.
  for r in select * from crm_import_changes where batch_id = p_batch and kind = 'tx_field' loop
    execute format('update crm_transactions set %I = $1 where id = $2 and %I is not distinct from $3', r.field, r.field)
      using r.old_value, r.tx_id, r.new_value;
  end loop;
  -- Each record the refresh touched goes back to how it stood before, field by
  -- field, unless someone has changed that field since.
  for r in select x.client_id, x.old_value::jsonb b, x.new_value::jsonb a, to_jsonb(c) - 'updated_at' cur
           from crm_import_changes x join crm_clients c on c.client_id = x.client_id
           where x.batch_id = p_batch and x.kind = 'client_row' loop
    select coalesce(jsonb_object_agg(k, r.b->k), '{}'::jsonb),
           count(*) filter (where r.cur->k is distinct from r.a->k)
      into v_patch, v_n
    from jsonb_object_keys(r.b) k
    where r.b->k is distinct from r.a->k;
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_patch
    from jsonb_each(v_patch) e(k, v) where r.cur->k is not distinct from r.a->k;
    v_kept := v_kept + v_n;
    if v_n > 0 then v_redo := v_redo || r.client_id; end if;
    if v_patch <> '{}'::jsonb then
      select string_agg(format('%I = p.%I', k, k), ', ') into v_set from jsonb_object_keys(v_patch) k;
      execute format('update crm_clients c set %s from jsonb_populate_record(null::crm_clients, $1) p where c.client_id = $2', v_set)
        using v_patch, r.client_id;
    end if;
  end loop;

  delete from crm_events where client_id in (select client_id from crm_clients where created_by_batch = p_batch);
  delete from crm_clients where created_by_batch = p_batch;
  delete from crm_sales_reps s using crm_import_changes c
  where c.batch_id = p_batch and c.kind = 'rep_created' and s.label = c.new_value
    and not exists (select 1 from crm_transactions t where t.advisor = s.source_name);

  select coalesce(array_agg(x), '{}') into v_ids from unnest(v_ids) x where exists (select 1 from crm_clients where client_id = x);
  perform crm_recompute_purchases(v_ids);
  -- Flags are re-derived only where someone changed a value since the refresh.
  perform crm_recompute_flags(x) from unnest(v_redo) x;
  insert into crm_events (client_id, actor, action, note)
  select x, p_actor, 'import_undone', 'Colibri refresh #' || p_batch || ' undone.' from unnest(v_ids) x;
  perform crm_recompute_segments('import');
  update crm_import_batches set status = 'undone', undone_at = now(), undone_by = p_actor,
    summary = summary || jsonb_build_object('undo', jsonb_build_object('values_kept', v_kept))
  where id = p_batch;
  return (select summary from crm_import_batches where id = p_batch);
end $_$;


--
-- Name: crm_insights(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_insights(p_include_related boolean DEFAULT false) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
with
asof as (select (now() at time zone 'Asia/Tashkent')::date as d),
reps as (select source_name, label, active from crm_sales_reps),
live as (
  select c.*, coalesce(c.assigned_owner, c.client_owner) as owner_src
  from crm_clients c
  where c.record_state not in ('merged','deleted','to_delete')
    and (p_include_related or not c.related_party)
),
bd as (
  select l.client_id, l.record_type,
         coalesce(crm_blank(l.name_confirmed), crm_blank(l.name_colibri), crm_blank(l.name_marketing)) as display_name,
         coalesce(l.dob_confirmed, l.dob_colibri, l.dob_marketing) as bd_date,
         (l.dob_confirmed is not null) as bd_confirmed,
         crm_next_birthday(coalesce(l.dob_confirmed, l.dob_colibri, l.dob_marketing), (select d from asof)) as next_bd,
         l.abc_class, l.lifecycle_status, l.rfm_segment, l.lifetime_spend_uzs as spend,
         case when l.owner_src is null then null else coalesce(r.label, 'Unassigned') end as owner_label
  from live l left join reps r on r.source_name = l.owner_src
  where coalesce(l.dob_confirmed, l.dob_colibri, l.dob_marketing) is not null and not coalesce(l.do_not_contact, false)
),
cl as (
  select l.client_id, l.abc_class, l.lifecycle_status, l.rfm_segment, l.related_party,
         l.lifetime_spend_uzs as spend, l.purchase_occasions as occ,
         l.first_purchase_at, l.last_purchase_at, l.do_not_contact,
         extract(year from l.first_purchase_at)::int as first_year,
         case when l.owner_src is null then null else coalesce(r.label, 'Unassigned') end as owner_label,
         case when l.owner_src is null or l.owner_src = 'Unassigned' then 'shared'
              when coalesce(r.active, false) then 'named' else 'left' end as owner_kind,
         l.client_id in (select client_id from bd where next_bd - (select d from asof) between 0 and 30) as bday30
  from live l left join reps r on r.source_name = l.owner_src
  where l.record_type = 'client' and coalesce(l.purchase_occasions, 0) > 0
),
tx as (
  select t.client_id, t.sold_at, extract(year from t.sold_at)::int as y,
         coalesce(nullif(t.brand, ''), 'Unassigned') as brand,
         coalesce(nullif(t.category, ''), 'Unassigned') as category,
         t.qty, t.net_uzs, cl.first_year
  from crm_transactions t join cl on cl.client_id = t.client_id
),
per_client_brands as (
  select client_id, count(distinct brand) filter (where brand <> 'Unassigned') as nb
  from tx group by client_id
)
select jsonb_build_object(
  'as_of', (select d from asof),
  'basis', case when p_include_related then 'all' else 'retail' end,
  'last_recalculated', (select jsonb_build_object('ran_at', ran_at, 'as_of', as_of, 'trigger', trigger)
                        from crm_recompute_runs order by ran_at desc limit 1),
  'headline', (select jsonb_build_object(
      'clients', count(*),
      'spend', coalesce(sum(spend), 0),
      'active', count(*) filter (where lifecycle_status = 'Active'),
      'active_spend', coalesce(sum(spend) filter (where lifecycle_status = 'Active'), 0),
      'repeat', count(*) filter (where occ > 1),
      'priority', count(*) filter (where rfm_segment in ('Cannot lose','At risk - high value')),
      'priority_spend', coalesce(sum(spend) filter (where rfm_segment in ('Cannot lose','At risk - high value')), 0),
      'birthdays_30', (select count(*) from bd where next_bd - (select d from asof) between 0 and 30)
    ) from cl),
  'related', (select jsonb_build_object('clients', count(*), 'spend', coalesce(sum(lifetime_spend_uzs), 0))
              from crm_clients where related_party and record_type = 'client'
                and record_state not in ('merged','deleted','to_delete')),
  'grid', (select coalesce(jsonb_agg(jsonb_build_object('abc', abc_class, 'lifecycle', lifecycle_status,
              'clients', n, 'spend', s) order by abc_class, lifecycle_status), '[]')
           from (select abc_class, lifecycle_status, count(*) n, sum(spend) s from cl group by 1, 2) g),
  'segments', (select coalesce(jsonb_agg(jsonb_build_object('segment', rfm_segment, 'clients', n, 'spend', s,
              'named', named, 'shared', shared, 'left', lft, 'active', act) order by s desc), '[]')
           from (select rfm_segment, count(*) n, sum(spend) s,
                        count(*) filter (where owner_kind = 'named') named,
                        count(*) filter (where owner_kind = 'shared') shared,
                        count(*) filter (where owner_kind = 'left') lft,
                        count(*) filter (where lifecycle_status = 'Active') act
                 from cl group by 1) g),
  'owners', (select coalesce(jsonb_agg(jsonb_build_object('owner', owner, 'kind', kind, 'clients', n, 'spend', s,
              'a_class', a, 'active', act, 'at_risk', ar, 'lapsed', lp, 'dormant', dm, 'priority', pr,
              'birthdays_30', b30) order by case kind when 'named' then 0 when 'shared' then 1 else 2 end, owner), '[]')
           from (select case when owner_kind = 'left' then 'Owner has left' else owner_label end owner,
                        owner_kind kind, count(*) n, sum(spend) s,
                        count(*) filter (where abc_class = 'A') a,
                        count(*) filter (where lifecycle_status = 'Active') act,
                        count(*) filter (where lifecycle_status = 'At risk') ar,
                        count(*) filter (where lifecycle_status = 'Lapsed') lp,
                        count(*) filter (where lifecycle_status = 'Dormant') dm,
                        count(*) filter (where rfm_segment in ('Cannot lose','At risk - high value')) pr,
                        count(*) filter (where bday30) b30
                 from cl group by 1, 2) g),
  'years', (select coalesce(jsonb_agg(jsonb_build_object('year', y, 'revenue', rev, 'lines', lines, 'pieces', pcs,
              'buyers', buyers, 'new_clients', coalesce(nc.n, 0), 'new_revenue', new_rev,
              'returning_buyers', ret, 'returning_revenue', ret_rev) order by y), '[]')
           from (select y, sum(net_uzs) rev, count(*) lines, sum(qty) pcs, count(distinct client_id) buyers,
                        coalesce(sum(net_uzs) filter (where first_year = y), 0) new_rev,
                        count(distinct client_id) filter (where first_year < y) ret,
                        coalesce(sum(net_uzs) filter (where first_year < y), 0) ret_rev
                 from tx group by y) yy
           left join (select first_year, count(*) n from cl group by 1) nc on nc.first_year = yy.y),
  'frequency', (select coalesce(jsonb_agg(jsonb_build_object('bucket', b, 'clients', n, 'spend', s) order by o), '[]')
           from (select case when occ = 1 then '1' when occ = 2 then '2' when occ <= 4 then '3-4' else '5+' end b,
                        min(least(occ, 5)) o, count(*) n, sum(spend) s from cl group by 1) f),
  'brands', (select coalesce(jsonb_agg(jsonb_build_object('brand', brand, 'revenue', rev, 'lines', lines,
              'clients', n) order by rev desc), '[]')
           from (select brand, sum(net_uzs) rev, count(*) lines, count(distinct client_id) n from tx group by 1) b),
  'brand_years', (select coalesce(jsonb_agg(jsonb_build_object('brand', brand, 'year', y, 'revenue', rev)
              order by brand, y), '[]')
           from (select brand, y, sum(net_uzs) rev from tx group by 1, 2) b),
  'categories', (select coalesce(jsonb_agg(jsonb_build_object('category', category, 'revenue', rev, 'lines', lines,
              'clients', n) order by rev desc), '[]')
           from (select category, sum(net_uzs) rev, count(*) lines, count(distinct client_id) n from tx group by 1) c),
  'multi_brand', (select coalesce(jsonb_agg(jsonb_build_object('bucket', b, 'clients', n, 'spend', s) order by b), '[]')
           from (select case when coalesce(p.nb, 0) >= 3 then '3+' else coalesce(p.nb, 0)::text end b,
                        count(*) n, sum(cl.spend) s
                 from cl left join per_client_brands p using (client_id) group by 1) m),
  'brand_pairs', (select coalesce(jsonb_agg(jsonb_build_object('a', a, 'b', b, 'clients', n) order by n desc, a, b), '[]')
           from (select a, b, n from (
                   select x.brand a, y.brand b, count(distinct x.client_id) n
                   from (select distinct client_id, brand from tx where brand <> 'Unassigned') x
                   join (select distinct client_id, brand from tx where brand <> 'Unassigned') y
                     on x.client_id = y.client_id and x.brand < y.brand
                   group by 1, 2) p order by n desc, a, b limit 8) q),
  'birthdays', jsonb_build_object(
      'on_file', (select count(*) from bd),
      'confirmed', (select count(*) from bd where bd_confirmed),
      'to_confirm', (select count(*) from bd where not bd_confirmed),
      'missing', (select count(*) from live where coalesce(dob_confirmed, dob_colibri, dob_marketing) is null),
      'do_not_contact', (select count(*) from live where coalesce(dob_confirmed, dob_colibri, dob_marketing) is not null and coalesce(do_not_contact, false)),
      'by_month', (select jsonb_agg(jsonb_build_object('month', m, 'clients', coalesce(n, 0), 'spend', coalesce(s, 0), 'to_confirm', coalesce(tc, 0)) order by m)
                   from generate_series(1, 12) m
                   left join (select extract(month from bd_date)::int mm, count(*) n, sum(spend) s,
                                     count(*) filter (where not bd_confirmed) tc
                              from bd group by 1) x on x.mm = m),
      'upcoming', (select coalesce(jsonb_agg(jsonb_build_object(
                     'client_id', client_id, 'display_name', display_name, 'record_type', record_type,
                     'date', to_char(next_bd, 'YYYY-MM-DD'), 'days', next_bd - (select d from asof),
                     'owner', owner_label, 'abc', abc_class, 'lifecycle', lifecycle_status,
                     'segment', rfm_segment, 'spend', spend, 'confirmed', bd_confirmed)
                   order by next_bd, spend desc nulls last), '[]')
                   from bd where next_bd - (select d from asof) between 0 and 30)
  )
)
$$;


--
-- Name: crm_merge(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_merge(p_keep text, p_drop text, p_reason text, p_actor text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare k crm_clients%rowtype; d crm_clients%rowtype; v_reason text := crm_blank(p_reason); v_tx bigint[];
begin
  if p_keep = p_drop then perform crm_fail('Choose two different records.'); end if;
  if p_keep < p_drop then k := crm_open_record(p_keep); d := crm_open_record(p_drop);
  else d := crm_open_record(p_drop); k := crm_open_record(p_keep); end if;
  if v_reason is not null and char_length(v_reason) > 300 then perform crm_fail('Keep the reason under 300 characters.'); end if;

  select coalesce(array_agg(id order by id), '{}') into v_tx from crm_transactions where client_id = p_drop;
  insert into crm_merge_log (actor, survivor_id, duplicate_id, survivor_before, duplicate_before, moved_tx)
  values (p_actor, p_keep, p_drop, to_jsonb(k), to_jsonb(d), v_tx);

  update crm_transactions set client_id = p_keep where client_id = p_drop;
  update crm_telegram_chats set client_id = p_keep where client_id = p_drop;
  update crm_telegram_chats set suggested_ids = array_remove(suggested_ids, p_drop)
                                               || case when p_keep = any(suggested_ids) then '{}'::text[] else array[p_keep] end
    where p_drop = any(suggested_ids);
  update crm_missed_demand set client_id = p_keep where client_id = p_drop;
  update crm_contacts set client_id = p_keep where client_id = p_drop;
  update crm_important_dates set client_id = p_keep where client_id = p_drop;
  if exists (select 1 from crm_personal where client_id = p_drop) then
    insert into crm_personal (client_id) values (p_keep) on conflict do nothing;
    update crm_personal kp set
      ring_sizes  = case when cardinality(kp.ring_sizes) > 0 then kp.ring_sizes else dp.ring_sizes end,
      wrist_cm    = coalesce(kp.wrist_cm, dp.wrist_cm),
      necklace_cm = coalesce(kp.necklace_cm, dp.necklace_cm),
      sizes_note  = coalesce(kp.sizes_note, dp.sizes_note),
      sizes_by    = coalesce(kp.sizes_by, dp.sizes_by), sizes_at = coalesce(kp.sizes_at, dp.sizes_at),
      metals      = case when cardinality(kp.metals) > 0 then kp.metals else dp.metals end,
      stones      = case when cardinality(kp.stones) > 0 then kp.stones else dp.stones end,
      styles      = case when cardinality(kp.styles) > 0 then kp.styles else dp.styles end,
      fav_brands  = coalesce(kp.fav_brands, dp.fav_brands),
      dislikes    = coalesce(kp.dislikes, dp.dislikes),
      prefs_note  = coalesce(kp.prefs_note, dp.prefs_note),
      prefs_by    = coalesce(kp.prefs_by, dp.prefs_by), prefs_at = coalesce(kp.prefs_at, dp.prefs_at),
      address     = coalesce(kp.address, dp.address),
      address_by  = coalesce(kp.address_by, dp.address_by), address_at = coalesce(kp.address_at, dp.address_at),
      about       = coalesce(kp.about, dp.about),
      about_by    = coalesce(kp.about_by, dp.about_by), about_at = coalesce(kp.about_at, dp.about_at)
    from crm_personal dp where kp.client_id = p_keep and dp.client_id = p_drop;
  end if;

  update crm_clients set
    name_colibri     = coalesce(crm_blank(k.name_colibri), d.name_colibri),
    name_marketing   = coalesce(crm_blank(k.name_marketing), d.name_marketing),
    phone_colibri    = coalesce(crm_blank(k.phone_colibri), d.phone_colibri),
    phone_marketing  = coalesce(crm_blank(k.phone_marketing), d.phone_marketing),
    gender_colibri   = coalesce(crm_blank(k.gender_colibri), d.gender_colibri),
    gender_marketing = coalesce(crm_blank(k.gender_marketing), d.gender_marketing),
    dob_colibri      = coalesce(k.dob_colibri, d.dob_colibri),
    dob_marketing    = coalesce(k.dob_marketing, d.dob_marketing),
    patronymic       = coalesce(crm_blank(k.patronymic), d.patronymic),
    email            = coalesce(crm_blank(k.email), d.email),
    channel_raw      = coalesce(crm_blank(k.channel_raw), d.channel_raw),
    marketing_consent = coalesce(k.marketing_consent, d.marketing_consent),
    purchase_for_raw = coalesce(crm_blank(k.purchase_for_raw), d.purchase_for_raw),
    awareness_source_raw = coalesce(crm_blank(k.awareness_source_raw), d.awareness_source_raw),
    online_interest_raw  = coalesce(crm_blank(k.online_interest_raw), d.online_interest_raw),
    brand_preference_raw = coalesce(crm_blank(k.brand_preference_raw), d.brand_preference_raw),
    form_submitted_at = coalesce(k.form_submitted_at, d.form_submitted_at),
    in_colibri   = k.in_colibri or d.in_colibri,
    in_marketing = k.in_marketing or d.in_marketing,
    in_telegram  = k.in_telegram or d.in_telegram,
    telegram_id    = coalesce(crm_blank(k.telegram_id), d.telegram_id),
    name_telegram  = coalesce(crm_blank(k.name_telegram), d.name_telegram),
    phone_telegram = coalesce(crm_blank(k.phone_telegram), d.phone_telegram),
    match_phone    = coalesce(crm_blank(k.match_phone), d.match_phone),
    record_type  = case when 'client' in (k.record_type, d.record_type) then 'client' else 'prospect' end,
    related_party  = k.related_party or d.related_party,
    do_not_contact = k.do_not_contact or d.do_not_contact,
    contact_note   = coalesce(k.contact_note, d.contact_note),
    referred_by    = coalesce(k.referred_by, d.referred_by),
    client_owner   = case when coalesce(k.assigned_owner, k.client_owner) is null then d.client_owner else k.client_owner end,
    assigned_owner = case when coalesce(k.assigned_owner, k.client_owner) is null then d.assigned_owner else k.assigned_owner end,
    lifecycle_status = case when d.last_purchase_at > coalesce(k.last_purchase_at, date '1900-01-01') then d.lifecycle_status else coalesce(k.lifecycle_status, d.lifecycle_status) end,
    rfm_segment      = case when d.last_purchase_at > coalesce(k.last_purchase_at, date '1900-01-01') then d.rfm_segment else coalesce(k.rfm_segment, d.rfm_segment) end,
    abc_class        = least(k.abc_class, d.abc_class)
  where client_id = p_keep;

  update crm_clients c set
    lifetime_spend_uzs = a.net, purchase_occasions = a.occ, items_bought = a.items,
    first_purchase_at = a.f, last_purchase_at = a.l, advisors_seen = a.adv
  from (select sum(net_uzs) as net, count(distinct sold_at)::int as occ, sum(qty)::int as items,
               min(sold_at) as f, max(sold_at) as l, count(distinct advisor)::int as adv
        from crm_transactions where client_id = p_keep) a
  where c.client_id = p_keep and a.occ > 0;

  update crm_clients set
    name_flag   = case when name_flag   = 'rule' then 'none' else name_flag end,
    phone_flag  = case when phone_flag  = 'rule' then 'none' else phone_flag end,
    gender_flag = case when gender_flag = 'rule' then 'none' else gender_flag end,
    dob_flag    = case when dob_flag    = 'rule' then 'none' else dob_flag end
  where client_id = p_keep;
  perform crm_recompute_flags(p_keep);

  update crm_clients set record_state = 'merged', merged_into = p_keep,
    state_reason = v_reason, state_by = p_actor, state_at = now()
  where client_id = p_drop;

  insert into crm_events (client_id, actor, action, new_value, note) values
    (p_drop, p_actor, 'merged_into', p_keep, coalesce(v_reason, 'Same person as ' || p_keep || '.')),
    (p_keep, p_actor, 'merged_from', p_drop, coalesce(v_reason, 'Same person as ' || p_drop || '.') ||
       ' ' || cardinality(v_tx) || ' purchase line(s) moved here.');
  perform crm_recompute_segments('merge');
end $$;


--
-- Name: crm_missed_ids(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_missed_ids(p_kind text, p_brand text) RETURNS text[]
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(array_agg(distinct m.client_id order by m.client_id), '{}')
  from crm_missed_demand m join crm_clients c using (client_id)
  where m.status = 'open' and c.record_state not in ('merged','deleted','to_delete')
    and (p_kind is null or m.kind = p_kind) and (p_brand is null or m.brand = p_brand)
$$;


--
-- Name: crm_missed_load(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_missed_load(p jsonb, p_source text) RETURNS integer
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with ins as (
    insert into crm_missed_demand (telegram_id, client_id, asked_at, kind, brand, excerpt, late, answered, first_reply_minutes, source)
    select r->>'tg', (select client_id from crm_telegram_chats ch where ch.telegram_id = r->>'tg'),
           (r->>'at')::timestamptz, r->>'kind', crm_blank(r->>'brand'), crm_blank(r->>'ex'),
           coalesce((r->>'late')::boolean, false), (r->>'ans')::boolean, (r->>'frm')::numeric, p_source
    from jsonb_array_elements(p) r
    on conflict (telegram_id, asked_at, kind) do nothing
    returning 1)
  select count(*)::int from ins
$$;


--
-- Name: crm_missed_set(text, bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_missed_set(p_id text, p_missed bigint, p_status text, p_actor text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare m crm_missed_demand%rowtype;
begin
  perform crm_open_record(p_id);
  if p_status not in ('open','followed_up','closed') then perform crm_fail('Choose open, followed up or closed.'); end if;
  select * into m from crm_missed_demand where id = p_missed and client_id = p_id for update;
  if not found then perform crm_fail('No such request on this record.'); end if;
  if m.status = p_status then return; end if;
  update crm_missed_demand set status = p_status, status_by = p_actor, status_at = now() where id = p_missed;
  insert into crm_events (client_id, actor, action, old_value, new_value, note)
  values (p_id, p_actor, 'missed_demand_set', m.status, p_status, m.kind || coalesce(':' || m.brand, ''));
end $$;


--
-- Name: crm_name_agrees(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_name_agrees(colibri text, marketing text) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with t as (select btrim(coalesce(marketing,'')) as m),
       p as (select m, position(' ' in m||' ') as pos from t)
  select public.crm_contains(colibri, left(m, pos-1))
     and public.crm_contains(colibri, btrim(substring(m from pos)))
  from p
$$;


--
-- Name: crm_name_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_name_key(p text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select nullif(btrim(regexp_replace(translate(lower(coalesce(p, '')), 'ё', 'е'), '[^a-zа-я0-9]+', ' ', 'g')), '')
$$;


--
-- Name: crm_next_birthday(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_next_birthday(p_dob date, p_asof date) RETURNS date
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select case when p_dob is null then null else (
    select case when d >= p_asof then d else
      (select case when extract(month from p_dob) = 2 and extract(day from p_dob) = 29
                    and not (((y + 1) % 4 = 0 and (y + 1) % 100 <> 0) or (y + 1) % 400 = 0)
               then make_date(y + 1, 2, 28)
               else make_date(y + 1, extract(month from p_dob)::int, extract(day from p_dob)::int) end)
      end
    from (select y,
            case when extract(month from p_dob) = 2 and extract(day from p_dob) = 29
                  and not ((y % 4 = 0 and y % 100 <> 0) or y % 400 = 0)
                 then make_date(y, 2, 28)
                 else make_date(y, extract(month from p_dob)::int, extract(day from p_dob)::int) end as d
          from (select extract(year from p_asof)::int as y) yy) x
  ) end
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: crm_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_clients (
    client_id text NOT NULL,
    record_type text NOT NULL,
    in_colibri boolean DEFAULT false NOT NULL,
    in_marketing boolean DEFAULT false NOT NULL,
    match_phone text,
    record_state text DEFAULT 'open'::text NOT NULL,
    merged_into text,
    park_reason text,
    name_colibri text,
    name_marketing text,
    name_confirmed text,
    name_flag public.crm_flag DEFAULT 'none'::text NOT NULL,
    phone_colibri text,
    phone_marketing text,
    phone_confirmed text,
    phone_flag public.crm_flag DEFAULT 'none'::text NOT NULL,
    gender_colibri text,
    gender_marketing text,
    gender_confirmed text,
    gender_flag public.crm_flag DEFAULT 'none'::text NOT NULL,
    dob_colibri date,
    dob_marketing date,
    dob_confirmed date,
    dob_flag public.crm_flag DEFAULT 'none'::text NOT NULL,
    patronymic text,
    email text,
    channel_raw text,
    marketing_consent boolean,
    purchase_for_raw text,
    awareness_source_raw text,
    online_interest_raw text,
    brand_preference_raw text,
    form_submitted_at timestamp with time zone,
    form_duplicate boolean DEFAULT false NOT NULL,
    first_purchase_at date,
    last_purchase_at date,
    purchase_occasions integer,
    items_bought integer,
    lifetime_spend_uzs numeric(14,0),
    abc_class text,
    rfm_segment text,
    lifecycle_status text,
    client_owner text,
    advisors_seen integer,
    related_party boolean DEFAULT false NOT NULL,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    review_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_owner text,
    assigned_by text,
    assigned_at timestamp with time zone,
    assignment_reason text,
    do_not_contact boolean DEFAULT false NOT NULL,
    contact_note text,
    referred_by text,
    state_reason text,
    state_by text,
    state_at timestamp with time zone,
    created_by_batch bigint,
    in_telegram boolean DEFAULT false NOT NULL,
    telegram_id text,
    name_telegram text,
    phone_telegram text,
    added_by_hand boolean DEFAULT false NOT NULL,
    how_met text,
    CONSTRAINT crm_clients_record_state_check CHECK ((record_state = ANY (ARRAY['open'::text, 'confirmed'::text, 'parked'::text, 'merged'::text, 'to_delete'::text, 'deleted'::text]))),
    CONSTRAINT crm_clients_record_type_check CHECK ((record_type = ANY (ARRAY['client'::text, 'prospect'::text])))
);


--
-- Name: crm_open_record(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_open_record(p_id text) RETURNS public.crm_clients
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare r crm_clients%rowtype;
begin
  select * into r from crm_clients where client_id = p_id for update;
  if not found then perform crm_fail('No record with that reference.'); end if;
  if r.record_state = 'merged' then perform crm_fail('This record was merged into another one and cannot be changed.'); end if;
  if r.record_state in ('deleted','to_delete') then perform crm_fail('This record is deleted. Restore it before changing it.'); end if;
  return r;
end $$;


--
-- Name: crm_phone_ids(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_phone_ids(p_digits text) RETURNS text[]
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(array_agg(distinct c.client_id order by c.client_id), '{}')
  from crm_clients c
  cross join lateral unnest(string_to_array(coalesce(c.phone_colibri, ''), ';') ||
                            array[c.phone_marketing, c.phone_confirmed, c.phone_telegram, c.match_phone]) ph
  where length(regexp_replace(coalesce(p_digits, ''), '\D', '', 'g')) >= 4
    and regexp_replace(coalesce(ph, ''), '\D', '', 'g') like '%' || regexp_replace(p_digits, '\D', '', 'g') || '%'
$$;


--
-- Name: crm_phone_norm(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_phone_norm(p text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select case
    when d is null or length(d) < 7 then null
    when length(d) = 9 then '+998' || d
    else '+' || d end
  from (select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') as d) x
$$;


--
-- Name: crm_phones_of(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_phones_of(p_colibri text, p_marketing text, p_confirmed text, p_match text) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(array_agg(distinct n order by n), '{}')
  from (select crm_phone_norm(x) n
        from unnest(string_to_array(coalesce(p_colibri, ''), ';') || array[p_marketing, p_confirmed, p_match]) x) y
  where n is not null
$$;


--
-- Name: crm_plausible_dob(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_plausible_dob(p_dob date, p_asof date) RETURNS date
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select case when p_dob is not null and p_dob >= date '1920-01-01'
                   and p_dob <= (p_asof - interval '18 years')::date then p_dob end
$$;


--
-- Name: crm_recompute_flags(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_recompute_flags(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  update crm_clients c set
    name_flag = f2.f,
    name_confirmed = case when f2.f = 'agreed' then crm_blank(c.name_colibri) end
  from (select case
      when crm_blank(name_colibri) is null and crm_blank(name_marketing) is null then 'none'
      when crm_blank(name_marketing) is null or crm_blank(name_colibri) is null then 'gap'
      when crm_name_agrees(name_colibri, name_marketing) then 'agreed' else 'conflict' end as f
    from crm_clients where client_id = p_id) f2
  where c.client_id = p_id and c.name_flag in ('none','agreed','gap','conflict');

  update crm_clients c set
    phone_flag = f2.f,
    phone_confirmed = case when f2.f = 'agreed' then crm_blank(c.phone_marketing) end
  from (select case
      when crm_blank(phone_colibri) is null and crm_blank(phone_marketing) is null then 'none'
      when crm_blank(phone_marketing) is null or crm_blank(phone_colibri) is null then 'gap'
      when crm_contains(phone_colibri, phone_marketing) then 'agreed' else 'conflict' end as f
    from crm_clients where client_id = p_id) f2
  where c.client_id = p_id and c.phone_flag in ('none','agreed','gap','conflict');

  update crm_clients c set
    gender_flag = f2.f,
    gender_confirmed = case when f2.f = 'agreed' then crm_blank(c.gender_colibri) end
  from (select case
      when crm_blank(gender_colibri) is null and crm_blank(gender_marketing) is null then 'none'
      when crm_blank(gender_marketing) is null or crm_blank(gender_colibri) is null then 'gap'
      when gender_colibri = gender_marketing then 'agreed' else 'conflict' end as f
    from crm_clients where client_id = p_id) f2
  where c.client_id = p_id and c.gender_flag in ('none','agreed','gap','conflict');

  update crm_clients c set
    dob_flag = f2.f,
    dob_confirmed = case when f2.f = 'agreed' then c.dob_colibri end
  from (select case
      when dob_colibri is null and dob_marketing is null then 'none'
      when dob_marketing is null or dob_colibri is null then 'gap'
      when dob_colibri = dob_marketing then 'agreed' else 'conflict' end as f
    from crm_clients where client_id = p_id) f2
  where c.client_id = p_id and c.dob_flag in ('none','agreed','gap','conflict');
end $$;


--
-- Name: crm_recompute_purchases(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_recompute_purchases(p_ids text[]) RETURNS void
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
  update crm_clients c set
    lifetime_spend_uzs = a.net, purchase_occasions = a.occ, items_bought = a.items,
    first_purchase_at = a.f, last_purchase_at = a.l, advisors_seen = a.adv
  from (select x.id,
               sum(t.net_uzs) net, nullif(count(distinct t.sold_at), 0)::int occ, sum(t.qty)::int items,
               min(t.sold_at) f, max(t.sold_at) l, nullif(count(distinct t.advisor), 0)::int adv
        from unnest(p_ids) x(id) left join crm_transactions t on t.client_id = x.id
        group by x.id) a
  where c.client_id = a.id
$$;


--
-- Name: crm_recompute_segments(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_recompute_segments(p_trigger text DEFAULT 'daily'::text, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_asof date := (now() at time zone 'Asia/Tashkent')::date;
  v_note text := coalesce(p_note, case p_trigger
      when 'daily' then 'Daily recalculation.'
      when 'merge' then 'Recalculated after a merge.'
      when 'state' then 'Recalculated after a record was deleted or restored.'
      else 'Recalculated.' end);
  v_clients int; v_abc int := 0; v_life int := 0; v_seg int := 0;
begin
  perform set_config('crm.system_recompute', 'on', true);

  select count(*) into v_clients from crm_clients
  where record_type = 'client' and record_state not in ('merged','deleted','to_delete')
    and coalesce(purchase_occasions, 0) > 0;

  with base as (
    select client_id, related_party, last_purchase_at, purchase_occasions as occ,
           lifetime_spend_uzs as n, abc_class, rfm_segment, lifecycle_status
    from crm_clients
    where record_type = 'client' and record_state not in ('merged','deleted','to_delete')
      and coalesce(purchase_occasions, 0) > 0
  ), pop as (
    select n from base where not related_party
  ), tot as (
    select nullif(sum(n), 0) as s, nullif(count(*), 0) as c from pop
  ), calc as (
    select b.*, (v_asof - b.last_purchase_at) as days,
      (select sum(p.n) from pop p where p.n >= b.n) / t.s as cum,
      (select count(*) from pop p where p.n <= b.n)::numeric / t.c as mpct
    from base b cross join tot t
  ), scored as (
    select *,
      case when days <= 180 then 5 when days <= 365 then 4 when days <= 730 then 3
           when days <= 1095 then 2 else 1 end as r,
      least(greatest(occ, 1), 5) as f,
      case when mpct >= 0.8 then 5 when mpct >= 0.6 then 4 when mpct >= 0.4 then 3
           when mpct >= 0.2 then 2 else 1 end as m,
      case when related_party then abc_class
           when cum <= 0.80 then 'A' when cum <= 0.95 then 'B' else 'C' end as abc_new,
      case when days <= 365 then 'Active' when days <= 730 then 'At risk'
           when days <= 1095 then 'Lapsed' else 'Dormant' end as life_new
    from calc
  ), seg as (
    select *, case
      when r >= 4 and f >= 4 then 'Champion'
      when r >= 4 and f >= 2 then 'Loyal'
      when r >= 4 and m >= 4 then 'New high-value'
      when r >= 4 then 'New client'
      when r = 3 and f >= 3 then 'Needs attention'
      when r = 3 and m >= 4 then 'At risk - high value'
      when r = 3 then 'At risk'
      when r <= 2 and m >= 4 then 'Cannot lose'
      when r = 2 then 'Hibernating'
      else 'Lost' end as seg_new
    from scored
  ), chg as (
    select client_id, abc_class as o_abc, abc_new, lifecycle_status as o_life, life_new,
           rfm_segment as o_seg, seg_new
    from seg
    where abc_class is distinct from abc_new or lifecycle_status is distinct from life_new
       or rfm_segment is distinct from seg_new
  ), upd as (
    update crm_clients c set abc_class = chg.abc_new, lifecycle_status = chg.life_new, rfm_segment = chg.seg_new
    from chg where c.client_id = chg.client_id
    returning c.client_id
  ), ev as (
    insert into crm_events (client_id, actor, action, field, old_value, new_value, note)
    select chg.client_id, 'system', 'class_changed', x.f, x.o, x.nv, v_note
    from chg cross join lateral (values
      ('abc_class', chg.o_abc, chg.abc_new),
      ('lifecycle_status', chg.o_life, chg.life_new),
      ('rfm_segment', chg.o_seg, chg.seg_new)) as x(f, o, nv)
    where x.o is distinct from x.nv
    returning field
  )
  select count(*) filter (where field = 'abc_class'),
         count(*) filter (where field = 'lifecycle_status'),
         count(*) filter (where field = 'rfm_segment')
    into v_abc, v_life, v_seg
  from ev;

  insert into crm_recompute_runs (as_of, trigger, clients, abc_changed, lifecycle_changed, segment_changed)
  values (v_asof, p_trigger, v_clients, v_abc, v_life, v_seg);

  perform set_config('crm.system_recompute', 'off', true);
  return jsonb_build_object('as_of', v_asof, 'clients', v_clients,
    'abc_changed', v_abc, 'lifecycle_changed', v_life, 'segment_changed', v_seg);
end $$;


--
-- Name: crm_rep_source(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_rep_source(p text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    (select source_name from crm_sales_reps where source_name = btrim(p)),
    (select source_name from crm_rep_aliases where lower(alias) = lower(btrim(p))))
$$;


--
-- Name: crm_reset_field(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_reset_field(p_id text, p_field text, p_actor text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare r crm_clients%rowtype; v_old text;
begin
  r := crm_open_record(p_id);
  if p_field = 'name' then
    v_old := r.name_confirmed; update crm_clients set name_flag = 'none', name_confirmed = null where client_id = p_id;
  elsif p_field = 'gender' then
    v_old := r.gender_confirmed; update crm_clients set gender_flag = 'none', gender_confirmed = null where client_id = p_id;
  elsif p_field = 'dob' then
    v_old := to_char(r.dob_confirmed, 'YYYY-MM-DD'); update crm_clients set dob_flag = 'none', dob_confirmed = null where client_id = p_id;
  elsif p_field = 'phone' then
    v_old := null; update crm_clients set phone_flag = 'none', phone_confirmed = null where client_id = p_id;
  else perform crm_fail('Unknown field.'); end if;
  perform crm_recompute_flags(p_id);
  insert into crm_events (client_id, actor, action, field, old_value, note)
  values (p_id, p_actor, 'field_reset', p_field, v_old, 'Back to the automatic comparison.');
end $$;


--
-- Name: crm_resolve_field(text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_resolve_field(p_id text, p_field text, p_source text, p_value text, p_basis text, p_actor text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare r crm_clients%rowtype; v_new text; v_old text; v_date date;
begin
  r := crm_open_record(p_id);
  if p_field not in ('name','gender','dob','phone') then perform crm_fail('Unknown field.'); end if;
  if p_source not in ('colibri','marketing','value','telegram') then perform crm_fail('Choose where the value comes from.'); end if;
  if p_source = 'telegram' and p_field <> 'phone' then perform crm_fail('Only a phone number can come from Telegram.'); end if;
  if p_basis not in ('client','delardi') then perform crm_fail('Say how the value was confirmed.'); end if;

  if p_field = 'name' then
    v_old := r.name_confirmed;
    v_new := case p_source when 'colibri' then crm_blank(r.name_colibri)
                           when 'marketing' then crm_blank(r.name_marketing) else crm_blank(p_value) end;
    if v_new is null then perform crm_fail('There is no value to confirm.'); end if;
    v_new := regexp_replace(v_new, '\s+', ' ', 'g');
    if char_length(v_new) < 2 or char_length(v_new) > 120 then perform crm_fail('A name must be 2 to 120 characters.'); end if;
    update crm_clients set name_confirmed = v_new, name_flag = p_basis where client_id = p_id;

  elsif p_field = 'gender' then
    v_old := r.gender_confirmed;
    v_new := case p_source when 'colibri' then crm_blank(r.gender_colibri)
                           when 'marketing' then crm_blank(r.gender_marketing) else upper(crm_blank(p_value)) end;
    if v_new is null then perform crm_fail('There is no value to confirm.'); end if;
    if v_new not in ('F','M') then perform crm_fail('Gender must be F or M.'); end if;
    update crm_clients set gender_confirmed = v_new, gender_flag = p_basis where client_id = p_id;

  elsif p_field = 'dob' then
    v_old := to_char(r.dob_confirmed, 'YYYY-MM-DD');
    if p_source = 'colibri' then v_date := r.dob_colibri;
    elsif p_source = 'marketing' then v_date := r.dob_marketing;
    else
      begin
        v_date := to_date(crm_blank(p_value), 'YYYY-MM-DD');
      exception when others then
        perform crm_fail('A date of birth must be a real date, written YYYY-MM-DD.');
      end;
    end if;
    if v_date is null then perform crm_fail('There is no value to confirm.'); end if;
    if v_date < date '1920-01-01' or v_date > current_date - interval '14 years' then
      perform crm_fail('That date of birth is outside the plausible range.');
    end if;
    v_new := to_char(v_date, 'YYYY-MM-DD');
    update crm_clients set dob_confirmed = v_date, dob_flag = p_basis where client_id = p_id;

  else
    v_old := r.phone_confirmed;
    if p_source = 'value' then
      v_new := crm_phone_norm(p_value);
      if v_new is null or length(regexp_replace(v_new, '\D', '', 'g')) > 15 then perform crm_fail('That is not a phone number.'); end if;
    else
      v_new := case p_source when 'colibri' then crm_blank(split_part(coalesce(r.phone_colibri, ''), ';', 1))
                             when 'marketing' then crm_blank(r.phone_marketing)
                             else crm_blank(r.phone_telegram) end;
      if v_new is null then perform crm_fail('There is no number on file from that source.'); end if;
    end if;
    update crm_clients set phone_confirmed = v_new, phone_flag = p_basis,
      match_phone = coalesce(match_phone, crm_phone_norm(v_new)) where client_id = p_id;
  end if;

  insert into crm_events (client_id, actor, action, field, old_value, new_value, note)
  values (p_id, p_actor, 'field_resolved', p_field, v_old, v_new, p_basis || ':' || p_source);
end $$;


--
-- Name: crm_set_contact(text, boolean, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_set_contact(p_id text, p_do_not_contact boolean, p_contact_note text, p_referred_by text, p_actor text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare r crm_clients%rowtype; v_note text := crm_blank(p_contact_note); v_ref text := crm_blank(p_referred_by); v_changed boolean := false;
begin
  r := crm_open_record(p_id);
  if v_note is not null and char_length(v_note) > 300 then perform crm_fail('Keep the contact note under 300 characters.'); end if;
  if v_ref is not null and char_length(v_ref) > 120 then perform crm_fail('Keep "referred by" under 120 characters.'); end if;
  if p_do_not_contact is not null and p_do_not_contact is distinct from r.do_not_contact then
    insert into crm_events (client_id, actor, action, field, old_value, new_value, note)
    values (p_id, p_actor, 'do_not_contact_set', 'do_not_contact', r.do_not_contact::text, p_do_not_contact::text, v_note);
    v_changed := true;
  end if;
  if v_note is distinct from r.contact_note and not v_changed then
    insert into crm_events (client_id, actor, action, field, old_value, new_value)
    values (p_id, p_actor, 'contact_note_set', 'contact_note', r.contact_note, v_note);
    v_changed := true;
  end if;
  if v_ref is distinct from r.referred_by then
    insert into crm_events (client_id, actor, action, field, old_value, new_value)
    values (p_id, p_actor, 'referred_by_set', 'referred_by', r.referred_by, v_ref);
    v_changed := true;
  end if;
  if not v_changed then perform crm_fail('Nothing has changed.'); end if;
  update crm_clients set
    do_not_contact = coalesce(p_do_not_contact, r.do_not_contact),
    contact_note = v_note, referred_by = v_ref
  where client_id = p_id;
end $$;


--
-- Name: crm_set_personal(text, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_set_personal(p_id text, p_group text, p jsonb, p_actor text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare o crm_personal%rowtype; v_changed text[] := '{}';
  v_rings numeric[]; v_wrist numeric; v_neck int; v_note text;
  v_metals text[]; v_stones text[]; v_styles text[]; v_fav text; v_dis text; v_text text;
begin
  perform crm_open_record(p_id);
  if p_group not in ('sizes','prefs','address','about') then perform crm_fail('Unknown group.'); end if;
  insert into crm_personal (client_id) values (p_id) on conflict do nothing;
  select * into o from crm_personal where client_id = p_id for update;

  if p_group = 'sizes' then
    begin
      v_rings := coalesce((select array_agg(distinct x::numeric order by x::numeric) from jsonb_array_elements_text(coalesce(p->'ring_sizes', '[]')) x), '{}');
      v_wrist := nullif(p->>'wrist_cm', '')::numeric;
      v_neck := nullif(p->>'necklace_cm', '')::int;
    exception when others then perform crm_fail('Sizes must be numbers.'); end;
    if exists (select 1 from unnest(v_rings) r where r < 12 or r > 25 or (r * 2) <> trunc(r * 2)) then perform crm_fail('Ring sizes run from 12 to 25, in halves.'); end if;
    if cardinality(v_rings) > 6 then perform crm_fail('Keep it to six ring sizes.'); end if;
    if v_wrist is not null and (v_wrist < 12 or v_wrist > 25) then perform crm_fail('A wrist is 12 to 25 cm.'); end if;
    if v_neck is not null and (v_neck < 35 or v_neck > 100) then perform crm_fail('A necklace length is 35 to 100 cm.'); end if;
    v_note := crm_blank(p->>'note');
    if v_note is not null and char_length(v_note) > 200 then perform crm_fail('Keep the note under 200 characters.'); end if;
    if v_rings is distinct from o.ring_sizes then v_changed := v_changed || text 'ring_sizes'; end if;
    if v_wrist is distinct from o.wrist_cm then v_changed := v_changed || text 'wrist_cm'; end if;
    if v_neck is distinct from o.necklace_cm then v_changed := v_changed || text 'necklace_cm'; end if;
    if v_note is distinct from o.sizes_note then v_changed := v_changed || text 'sizes_note'; end if;
    if cardinality(v_changed) = 0 then return; end if;
    update crm_personal set ring_sizes = v_rings, wrist_cm = v_wrist, necklace_cm = v_neck, sizes_note = v_note,
      sizes_by = p_actor, sizes_at = now() where client_id = p_id;

  elsif p_group = 'prefs' then
    v_metals := coalesce((select array_agg(distinct x order by x) from jsonb_array_elements_text(coalesce(p->'metals', '[]')) x), '{}');
    v_stones := coalesce((select array_agg(distinct x order by x) from jsonb_array_elements_text(coalesce(p->'stones', '[]')) x), '{}');
    v_styles := coalesce((select array_agg(distinct x order by x) from jsonb_array_elements_text(coalesce(p->'styles', '[]')) x), '{}');
    if not v_metals <@ array['yellow_gold','white_gold','rose_gold','platinum','steel'] then perform crm_fail('Unknown metal.'); end if;
    if not v_stones <@ array['diamonds','coloured_stones','pearls','no_stones'] then perform crm_fail('Unknown stone choice.'); end if;
    if not v_styles <@ array['classic','modern','statement'] then perform crm_fail('Unknown style.'); end if;
    v_fav := crm_blank(p->>'fav_brands'); v_dis := crm_blank(p->>'dislikes'); v_note := crm_blank(p->>'note');
    if coalesce(char_length(v_fav), 0) > 300 or coalesce(char_length(v_dis), 0) > 300 or coalesce(char_length(v_note), 0) > 300 then
      perform crm_fail('Keep each line under 300 characters.'); end if;
    if v_metals is distinct from o.metals then v_changed := v_changed || text 'metals'; end if;
    if v_stones is distinct from o.stones then v_changed := v_changed || text 'stones'; end if;
    if v_styles is distinct from o.styles then v_changed := v_changed || text 'styles'; end if;
    if v_fav is distinct from o.fav_brands then v_changed := v_changed || text 'fav_brands'; end if;
    if v_dis is distinct from o.dislikes then v_changed := v_changed || text 'dislikes'; end if;
    if v_note is distinct from o.prefs_note then v_changed := v_changed || text 'prefs_note'; end if;
    if cardinality(v_changed) = 0 then return; end if;
    update crm_personal set metals = v_metals, stones = v_stones, styles = v_styles, fav_brands = v_fav, dislikes = v_dis,
      prefs_note = v_note, prefs_by = p_actor, prefs_at = now() where client_id = p_id;

  elsif p_group = 'address' then
    v_text := crm_blank(p->>'address');
    if v_text is not null and char_length(v_text) > 500 then perform crm_fail('Keep the address under 500 characters.'); end if;
    if v_text is not distinct from o.address then return; end if;
    v_changed := array['address'];
    update crm_personal set address = v_text, address_by = p_actor, address_at = now() where client_id = p_id;

  else
    v_text := crm_blank(p->>'about');
    if v_text is not null and char_length(v_text) > 2000 then perform crm_fail('Keep it under 2,000 characters.'); end if;
    if v_text is not distinct from o.about then return; end if;
    v_changed := array['about'];
    update crm_personal set about = v_text, about_by = p_actor, about_at = now() where client_id = p_id;
  end if;

  insert into crm_events (client_id, actor, action, field, note)
  values (p_id, p_actor, 'personal_set', p_group, array_to_string(v_changed, ','));
end $$;


--
-- Name: crm_set_state(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_set_state(p_id text, p_state text, p_reason text, p_actor text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare r crm_clients%rowtype; v_reason text := crm_blank(p_reason); v_conflicts int;
begin
  select * into r from crm_clients where client_id = p_id for update;
  if not found then perform crm_fail('No record with that reference.'); end if;
  if r.record_state = 'merged' then perform crm_fail('This record was merged into another one and cannot be changed.'); end if;
  if p_state not in ('open','confirmed','parked','deleted') then perform crm_fail('Unknown record state.'); end if;
  if p_state = r.record_state then perform crm_fail('The record is already in that state.'); end if;
  if r.record_state in ('deleted','to_delete') and p_state <> 'open' then
    perform crm_fail('This record is deleted. Restore it before changing it.');
  end if;
  if p_state in ('parked','deleted') and (v_reason is null or char_length(v_reason) < 3) then
    perform crm_fail('Give a short reason.');
  end if;
  if v_reason is not null and char_length(v_reason) > 300 then perform crm_fail('Keep the reason under 300 characters.'); end if;
  if p_state = 'confirmed' then
    select count(*) into v_conflicts from (values (r.name_flag),(r.phone_flag),(r.gender_flag),(r.dob_flag)) v(f) where f = 'conflict';
    if v_conflicts > 0 then perform crm_fail('Settle every field where the sources differ before marking the record checked.'); end if;
  end if;

  update crm_clients set
    record_state = p_state,
    state_reason = case when p_state in ('parked','deleted') then v_reason end,
    state_by = p_actor, state_at = now(),
    reviewed_by = case when p_state = 'confirmed' then p_actor end,
    reviewed_at = case when p_state = 'confirmed' then now() end
  where client_id = p_id;

  insert into crm_events (client_id, actor, action, field, old_value, new_value, note)
  values (p_id, p_actor, 'state_changed', 'record_state', r.record_state, p_state, v_reason);
  if r.record_type = 'client' and (p_state = 'deleted' or r.record_state in ('deleted','to_delete')) then
    perform crm_recompute_segments('state');
  end if;
end $$;


--
-- Name: crm_telegram_link(text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_telegram_link(p_id text, p_chat bigint, p_actor text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare r crm_clients%rowtype; ch crm_telegram_chats%rowtype; v_phone boolean;
begin
  r := crm_open_record(p_id);
  select * into ch from crm_telegram_chats where id = p_chat for update;
  if not found then perform crm_fail('No such Telegram chat.'); end if;
  if ch.client_id is not null then perform crm_fail('This Telegram chat is already linked to a record.'); end if;
  if not (p_id = any(ch.suggested_ids)) then perform crm_fail('This Telegram chat was not suggested for this record.'); end if;
  v_phone := crm_blank(r.phone_colibri) is null and crm_blank(r.phone_marketing) is null and crm_blank(r.phone_telegram) is null and ch.phone is not null;
  update crm_telegram_chats set client_id = p_id, link_status = 'confirmed', suggested_ids = '{}', decided_by = p_actor, decided_at = now() where id = p_chat;
  update crm_clients set in_telegram = true, telegram_id = coalesce(telegram_id, ch.telegram_id),
    name_telegram = coalesce(crm_blank(name_telegram), ch.display_name),
    phone_telegram = coalesce(crm_blank(phone_telegram), ch.phone), match_phone = coalesce(match_phone, ch.phone)
  where client_id = p_id;
  update crm_missed_demand set client_id = p_id where telegram_id = ch.telegram_id and client_id is null;
  insert into crm_events (client_id, actor, action, new_value, note)
  values (p_id, p_actor, 'telegram_linked', 'confirmed', case when v_phone then 'phone_added' end);
end $$;


--
-- Name: crm_telegram_load(jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_telegram_load(p jsonb, p_actor text, p_source text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare r jsonb; v_ids text[]; v_link text; v_chat bigint; v_cid text; v_n int;
  n_loaded int := 0; n_skipped int := 0; n_linked int := 0; n_suggested int := 0; n_leads int := 0;
begin
  for r in select value from jsonb_array_elements(p) loop
    if exists (select 1 from crm_telegram_chats where telegram_id = r->>'tg') then n_skipped := n_skipped + 1; continue; end if;
    v_link := r->>'link';
    v_ids := array(select c.client_id from crm_clients c
                   where c.client_id in (select jsonb_array_elements_text(coalesce(r->'ids', '[]'::jsonb)))
                     and c.record_state not in ('merged','deleted','to_delete') order by c.client_id);
    if v_link = 'phone' and cardinality(v_ids) <> 1 then v_link := case when cardinality(v_ids) > 1 then 'suggested' else 'none' end; end if;
    if v_link = 'suggested' and cardinality(v_ids) = 0 then v_link := 'none'; end if;
    insert into crm_telegram_chats (telegram_id, link_status, match_basis, suggested_ids, display_name, phone, language, segment, dormant, do_not_contact,
      first_contact, last_contact, last_client_message, messages_total, messages_from_client, messages_from_boutique, inquiries,
      replies_over_24h, never_answered, broadcasts_received, interest_brands, purchase_signal, pos_revenue_uzs, pos_items, last_pos_purchase, pos_brands,
      max_discount_pct, flags, last_client_excerpt, as_of, source)
    values (r->>'tg', v_link, r->>'basis', case when v_link = 'suggested' then v_ids else '{}' end,
      crm_blank(r->>'name'), crm_phone_norm(r->>'phone'), r->>'lang', r->>'seg', (r->>'dormant')::boolean, coalesce((r->>'dnc')::boolean, false),
      (r->>'first')::date, (r->>'last')::date, (r->>'lastc')::date, (r->>'mt')::int, (r->>'mc')::int, (r->>'mb')::int, (r->>'inq')::int,
      (r->>'late')::int, (r->>'never')::int, (r->>'bc')::int,
      array(select jsonb_array_elements_text(coalesce(r->'brands', '[]'::jsonb))), coalesce((r->>'sig')::boolean, false),
      (r->>'prev')::numeric, (r->>'pitems')::int, (r->>'plast')::date, array(select jsonb_array_elements_text(coalesce(r->'pbrands', '[]'::jsonb))),
      (r->>'disc')::numeric, array(select jsonb_array_elements_text(coalesce(r->'flags', '[]'::jsonb))), crm_blank(r->>'ex'),
      (r->>'asof')::date, p_source)
    returning id into v_chat;
    n_loaded := n_loaded + 1;
    if v_link = 'phone' then
      v_cid := v_ids[1];
      update crm_telegram_chats set client_id = v_cid where id = v_chat;
      update crm_clients set in_telegram = true, telegram_id = coalesce(telegram_id, r->>'tg'),
        name_telegram = coalesce(crm_blank(name_telegram), crm_blank(r->>'name')),
        phone_telegram = coalesce(crm_blank(phone_telegram), crm_phone_norm(r->>'phone'))
      where client_id = v_cid;
      insert into crm_events (client_id, actor, action, note) values (v_cid, p_actor, 'telegram_linked', 'phone');
      n_linked := n_linked + 1;
    elsif v_link = 'suggested' then
      n_suggested := n_suggested + 1;
    elsif v_link = 'lead' then
      select coalesce(max(substring(client_id from 5)::int), 0) + 1 into v_n from crm_clients where client_id ~ '^PRS-\d+$';
      v_cid := 'PRS-' || lpad(v_n::text, 3, '0');
      insert into crm_clients (client_id, record_type, record_state, in_colibri, in_marketing, in_telegram, telegram_id, name_telegram, phone_telegram, match_phone)
      values (v_cid, 'prospect', 'open', false, false, true, r->>'tg', crm_blank(r->>'name'), crm_phone_norm(r->>'phone'), crm_phone_norm(r->>'phone'));
      update crm_telegram_chats set client_id = v_cid where id = v_chat;
      insert into crm_events (client_id, actor, action, new_value, note)
      values (v_cid, p_actor, 'created_from_telegram', case when coalesce((r->>'sig')::boolean, false) then 'chat_buyer' else 'lead' end, (r->>'lastc'));
      n_leads := n_leads + 1;
    end if;
  end loop;
  return jsonb_build_object('loaded', n_loaded, 'skipped', n_skipped, 'linked', n_linked, 'suggested', n_suggested, 'leads', n_leads);
end $_$;


--
-- Name: crm_telegram_reject(text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_telegram_reject(p_id text, p_chat bigint, p_actor text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare ch crm_telegram_chats%rowtype; v_rest text[];
begin
  perform crm_open_record(p_id);
  select * into ch from crm_telegram_chats where id = p_chat for update;
  if not found then perform crm_fail('No such Telegram chat.'); end if;
  if not (p_id = any(ch.suggested_ids)) then perform crm_fail('This Telegram chat was not suggested for this record.'); end if;
  v_rest := array_remove(ch.suggested_ids, p_id);
  update crm_telegram_chats set suggested_ids = v_rest,
    link_status = case when cardinality(v_rest) = 0 then 'rejected' else link_status end,
    decided_by = p_actor, decided_at = now()
  where id = p_chat;
  insert into crm_events (client_id, actor, action) values (p_id, p_actor, 'telegram_rejected');
end $$;


--
-- Name: crm_telegram_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_telegram_summary() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with ch as (select * from crm_telegram_chats),
  md as (select * from crm_missed_demand),
  today as (select (now() at time zone 'Asia/Tashkent')::date d),
  lead as (
    select c.*, (select d from today) - c.last_client_message as age
    from ch c join crm_queue q on q.client_id = c.client_id
    where c.link_status = 'lead' and q.review_status = 'lead')
  select jsonb_build_object(
    'as_of', (select max(as_of) from ch),
    'chats', (select count(*) from ch),
    'linked', (select count(*) from ch where link_status in ('phone','confirmed')),
    'to_confirm', (select count(*) from ch where link_status = 'suggested'),
    'leads', (select jsonb_build_object(
        'total', count(*),
        'hot', count(*) filter (where not purchase_signal and age <= 30),
        'warm', count(*) filter (where not purchase_signal and age between 31 and 180),
        'cold', count(*) filter (where not purchase_signal and (age > 180 or age is null)),
        'buyers', count(*) filter (where purchase_signal),
        'with_phone', count(*) filter (where phone is not null)) from lead),
    'missed', (select jsonb_build_object(
        'total', count(*), 'open', count(*) filter (where status = 'open'),
        'clients', count(distinct telegram_id),
        'in_file', count(distinct client_id),
        'first', min(asked_at)::date, 'last', max(asked_at)::date) from md),
    'by_kind', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'requests', n, 'clients', k, 'in_file', f, 'open', o) order by n desc), '[]'::jsonb)
        from (select kind, count(*) n, count(distinct telegram_id) k, count(distinct client_id) f, count(*) filter (where status = 'open') o
              from md group by kind) x),
    'not_carried', (select coalesce(jsonb_agg(jsonb_build_object('brand', brand, 'requests', n, 'clients', k, 'in_file', f) order by n desc, brand), '[]'::jsonb)
        from (select brand, count(*) n, count(distinct telegram_id) k, count(distinct client_id) f from md where kind = 'not_carried' group by brand) x),
    'brands_asked', (select coalesce(jsonb_agg(jsonb_build_object('brand', brand, 'requests', n) order by n desc, brand), '[]'::jsonb)
        from (select brand, count(*) n from md where kind <> 'not_carried' and brand is not null group by brand) x),
    'by_year', (select coalesce(jsonb_agg(jsonb_build_object('year', y, 'requests', n, 'late', l) order by y), '[]'::jsonb)
        from (select extract(year from asked_at)::int y, count(*) filter (where kind <> 'late_reply') n, count(*) filter (where kind = 'late_reply') l
              from md group by 1) x)
  )
$$;


--
-- Name: crm_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(current_setting('crm.system_recompute', true), 'off') = 'on' then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end $$;


--
-- Name: crm_transactions_cat_link(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_transactions_cat_link() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r record; d record;
begin
  select * into r from cat_match_article(new.article);
  select * into d from cat_txn_display(r.model_id, r.variant_id, new.item);
  new.cat_model_id := r.model_id; new.cat_variant_id := d.variant_id;
  new.cat_name_ru := d.name_ru; new.cat_name_en := d.name_en; new.cat_thumb_url := d.thumb_url;
  return new;
end $$;


--
-- Name: ops_apply_ticket_line(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_apply_ticket_line(p_line uuid, p_actor text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_kind text; v_piece uuid; v_status text; v_state text; v_sold_line uuid;
begin
  select l.kind, l.piece_id, t.status into v_kind, v_piece, v_status
    from ops_ticket_lines l join ops_tickets t using (ticket_id)
   where l.line_id = p_line;
  if not found then raise exception 'ticket line % not found', p_line; end if;
  if v_piece is null or v_status = 'void' then return; end if;

  select state, sold_line_id into v_state, v_sold_line from ops_pieces where piece_id = v_piece for update;

  if v_kind = 'sale' then
    if v_state = 'sold' and v_sold_line = p_line then return; end if;
    if v_state in ('sold', 'not_received') then
      insert into ops_review(piece_id, kind, note)
      select v_piece, 'ticket_conflict', format('sale line %s on a piece that is %s', p_line, v_state)
       where not exists (select 1 from ops_review r
                          where r.piece_id = v_piece and r.kind = 'ticket_conflict' and r.status = 'open');
      return;
    end if;
    update ops_pieces
       set state = 'sold', state_since = now(), sold_line_id = p_line,
           hold_client_id = null, hold_until = null, state_note = null, updated_at = now()
     where piece_id = v_piece;
    insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor)
    values (v_piece, v_state, 'sold', 'sold', 'ticket_line', p_line::text, p_actor);
    update ops_review set status = 'auto_closed', resolved_at = now(), resolved_by = p_actor
     where piece_id = v_piece and status = 'open';

  elsif v_kind = 'refund' then
    if v_state <> 'sold' then return; end if;
    -- the serial is already live again as another piece (reused after sale): flag instead of failing
    if exists (select 1 from ops_pieces o, ops_pieces me
                where me.piece_id = v_piece and o.piece_id <> v_piece
                  and o.state not in ('sold', 'not_received')
                  and o.brand = me.brand and upper(btrim(o.serial)) = upper(btrim(me.serial))) then
      insert into ops_review(piece_id, kind, note)
      select v_piece, 'ticket_conflict', format('refund line %s but the serial is live as another piece', p_line)
       where not exists (select 1 from ops_review r
                          where r.piece_id = v_piece and r.kind = 'ticket_conflict' and r.status = 'open');
      return;
    end if;
    update ops_pieces
       set state = 'in_stock', state_since = now(), sold_line_id = null, updated_at = now()
     where piece_id = v_piece;
    insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor)
    values (v_piece, 'sold', 'in_stock', 'refunded', 'ticket_line', p_line::text, p_actor);
  end if;
end $$;


--
-- Name: ops_has_right(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_has_right(p_actor text, p_right text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce((
    select case p_right when 'manage_stock' then u.can_manage_stock else false end
      from board_users u
     where u.name = p_actor and u.active
     limit 1), false);
$$;


--
-- Name: ops_initial_fill(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_initial_fill(p_actor text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_run bigint; v_stock int; v_transit int;
begin
  if not ops_has_right(p_actor, 'manage_stock') then
    raise exception 'not allowed: % lacks manage stock', p_actor;
  end if;
  if exists (select 1 from ops_pieces) then raise exception 'initial fill already done'; end if;

  select max(id) into v_run from cat_import_runs;

  insert into ops_pieces(store_id, brand, serial, article, model_id, variant_id, size, state, last_seen_run, last_seen_at)
  select 1, m.brand, btrim(p.serial), m.article, m.model_id, p.variant_id, p.size, 'in_stock', p.import_run, now()
    from cat_pieces p
    join cat_variants v on v.variant_id = p.variant_id
    join cat_models   m on m.model_id   = v.model_id;
  get diagnostics v_stock = row_count;

  insert into ops_pieces(store_id, brand, serial, article, model_id, variant_id, size, state)
  select 1, m.brand, btrim(i.serial), coalesce(i.article, m.article), m.model_id, i.variant_id, i.size, 'in_transit'
    from cat_incoming i
    left join cat_variants v on v.variant_id = i.variant_id
    join cat_models m on m.model_id = coalesce(i.model_id, v.model_id)
   where not exists (select 1 from cat_pieces s where upper(btrim(s.serial)) = upper(btrim(i.serial)));
  get diagnostics v_transit = row_count;

  insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor)
  select piece_id, null, state, 'initial_load', 'cat_run', v_run::text, p_actor from ops_pieces;

  return jsonb_build_object('in_stock', v_stock, 'in_transit', v_transit);
end $$;


--
-- Name: ops_move_state(uuid, text, text, text, text, date, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_move_state(p_piece uuid, p_state text, p_actor text, p_note text, p_client text, p_until date, p_reason text, p_ref_kind text, p_ref_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_from text; v_reason text;
begin
  select state into v_from from ops_pieces where piece_id = p_piece for update;
  if not found then raise exception 'piece % not found', p_piece; end if;
  if not ((v_from = 'in_stock' and p_state in ('reserved', 'booked_out', 'damaged'))
       or (v_from in ('reserved', 'booked_out', 'damaged') and p_state = 'in_stock')
       or (v_from = 'in_transit' and p_state = 'not_received' and p_ref_kind = 'review')) then
    raise exception 'state % → % is not allowed', v_from, p_state;
  end if;
  v_reason := coalesce(p_reason, case
    when p_state = 'reserved'   then 'reserved'
    when p_state = 'booked_out' then 'booked_out'
    when p_state = 'damaged'    then 'damaged'
    when v_from  = 'reserved'   then 'released'
    when v_from  = 'booked_out' then 'returned_from_loan'
    when v_from  = 'damaged'    then 'repaired' end);
  update ops_pieces
     set state          = p_state,
         state_since    = now(),
         hold_client_id = case when p_state in ('reserved', 'booked_out') then p_client end,
         hold_until     = case when p_state in ('reserved', 'booked_out') then p_until end,
         state_note     = case when p_state = 'in_stock' then null else p_note end,
         updated_at     = now()
   where piece_id = p_piece;
  insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor, note)
  values (p_piece, v_from, p_state, v_reason, p_ref_kind, p_ref_id, p_actor, p_note);
end $$;


--
-- Name: ops_piece_events_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_piece_events_immutable() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  raise exception 'ops_piece_events is append-only';
end $$;


--
-- Name: ops_resolve_review(bigint, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_resolve_review(p_review bigint, p_resolution text, p_actor text, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_piece uuid; v_kind text; v_state text;
begin
  if not ops_has_right(p_actor, 'manage_stock') then
    raise exception 'not allowed: % lacks manage stock', p_actor;
  end if;
  select r.piece_id, r.kind into v_piece, v_kind from ops_review r
   where r.review_id = p_review and r.status = 'open' for update;
  if not found then raise exception 'review % is not open', p_review; end if;
  if p_resolution is null or p_resolution <> all (
       case when v_kind in ('overdue_in_transit', 'dropped_from_incoming')
            then array['still_in_transit', 'not_delivered']
            else array['sold', 'damaged', 'booked_out', 'still_in_stock'] end) then
    raise exception 'resolution % is not allowed for %', p_resolution, v_kind;
  end if;
  select state into v_state from ops_pieces where piece_id = v_piece for update;
  if p_resolution = 'sold' then
    if v_state <> 'sold' then raise exception 'state % → sold is not allowed', v_state; end if;
  elsif p_resolution in ('damaged', 'booked_out') and v_state <> p_resolution then
    perform ops_move_state(v_piece, p_resolution, p_actor, p_note, null, null,
                           'review_resolved', 'review', p_review::text);
  elsif p_resolution = 'not_delivered' and v_state <> 'not_received' then
    perform ops_move_state(v_piece, 'not_received', p_actor, p_note, null, null,
                           'review_resolved', 'review', p_review::text);
  end if;
  update ops_review
     set status = 'resolved', resolution = p_resolution, resolved_by = p_actor,
         resolved_at = now(), note = coalesce(p_note, note)
   where review_id = p_review;
end $$;


--
-- Name: ops_set_state(uuid, text, text, text, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_set_state(p_piece uuid, p_state text, p_actor text, p_note text DEFAULT NULL::text, p_client text DEFAULT NULL::text, p_until date DEFAULT NULL::date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not ops_has_right(p_actor, 'manage_stock') then
    raise exception 'not allowed: % lacks manage stock', p_actor;
  end if;
  perform ops_move_state(p_piece, p_state, p_actor, p_note, p_client, p_until, null, 'manual', null);
end $$;


--
-- Name: ops_sync_pieces(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_sync_pieces(p_run bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_arrived int := 0; v_transit int := 0; v_refreshed int := 0; v_raised int := 0; v_closed int := 0; n int;
begin
  -- this load: stock first, then incoming serials that are not in stock
  create temp table ops_sync_load on commit drop as
  select distinct on (l.brand, l.k) l.*
    from (
      select m.brand, upper(btrim(p.serial)) k, btrim(p.serial) serial, m.article, m.model_id,
             p.variant_id, p.size, null::date shipped_on, 'in_stock' src, 1 pri
        from cat_pieces p
        join cat_variants v on v.variant_id = p.variant_id
        join cat_models   m on m.model_id   = v.model_id
      union all
      select m.brand, upper(btrim(i.serial)), btrim(i.serial), coalesce(i.article, m.article), m.model_id,
             i.variant_id, i.size, i.shipped_on, 'in_transit', 2
        from cat_incoming i
        left join cat_variants v on v.variant_id = i.variant_id
        join cat_models m on m.model_id = coalesce(i.model_id, v.model_id)
       where not exists (select 1 from cat_pieces s where upper(btrim(s.serial)) = upper(btrim(i.serial)))
    ) l
   order by l.brand, l.k, l.pri;

  -- 1. in transit, now in stock → arrived
  with moved as (
    update ops_pieces o set state = 'in_stock', state_since = now(), updated_at = now()
      from ops_sync_load l
     where o.state = 'in_transit' and l.src = 'in_stock'
       and o.brand = l.brand and upper(btrim(o.serial)) = l.k
    returning o.piece_id)
  insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor)
  select piece_id, 'in_transit', 'in_stock', 'arrived', 'cat_run', p_run::text, 'catalogue load' from moved;
  get diagnostics v_arrived = row_count;

  -- 2. refresh every live piece in this load (never its state)
  update ops_pieces o
     set article = l.article, model_id = l.model_id, variant_id = l.variant_id, size = l.size,
         shipped_on = coalesce(l.shipped_on, o.shipped_on),
         last_seen_run = p_run, last_seen_at = now()
    from ops_sync_load l
   where o.state not in ('sold', 'not_received') and o.brand = l.brand and upper(btrim(o.serial)) = l.k;
  get diagnostics v_refreshed = row_count;

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
  create temp table ops_sync_new on commit drop as
  select l.* from ops_sync_load l
   where not exists (select 1 from ops_pieces o
                      where o.state not in ('sold', 'not_received') and o.brand = l.brand and upper(btrim(o.serial)) = l.k);
  v_raised := v_raised + (select count(*) from ops_sync_new l
                           where exists (select 1 from ops_pieces o where o.state in ('sold', 'not_received')
                                            and o.brand = l.brand and upper(btrim(o.serial)) = l.k));
  with ins as (
    insert into ops_pieces(store_id, brand, serial, article, model_id, variant_id, size, state, shipped_on,
                           last_seen_run, last_seen_at)
    select 1, brand, serial, article, model_id, variant_id, size, src, shipped_on, p_run, now() from ops_sync_new
    returning piece_id, state, brand, serial)
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

  -- 5. live pieces on the floor not in this load and with no ticket line → review (once)
  insert into ops_review(piece_id, kind, raised_run)
  select o.piece_id, 'missing_from_export', p_run
    from ops_pieces o
   where o.state in ('in_stock', 'reserved', 'booked_out', 'damaged')
     and not exists (select 1 from ops_sync_load l where l.brand = o.brand and l.k = upper(btrim(o.serial)))
     and not exists (select 1 from ops_ticket_lines t
                      where t.piece_id = o.piece_id or upper(btrim(t.serial_raw)) = upper(btrim(o.serial)))
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
  return jsonb_build_object('arrived', v_arrived, 'in_transit', v_transit, 'refreshed', v_refreshed,
                            'review_raised', v_raised, 'review_closed', v_closed);
end $$;


--
-- Name: prune_board_ephemera(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prune_board_ephemera() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from public.editor_sessions where expires_at < now() - interval '1 day';
  delete from public.auth_attempts   where created_at  < now() - interval '7 days';
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


--
-- Name: auth_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_attempts (
    id bigint NOT NULL,
    ip text NOT NULL,
    ok boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_attempts_id_seq OWNED BY public.auth_attempts.id;


--
-- Name: board_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    passcode_hash text NOT NULL,
    can_view_sensitive boolean DEFAULT false NOT NULL,
    can_view_email_suggestions boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    can_view_board boolean DEFAULT true NOT NULL,
    can_view_crm boolean DEFAULT false NOT NULL,
    can_edit_crm boolean DEFAULT false NOT NULL,
    can_import_crm boolean DEFAULT false NOT NULL,
    crm_rep_label text,
    can_export_crm boolean DEFAULT false NOT NULL,
    can_view_catalogue boolean DEFAULT false NOT NULL,
    can_manage_catalogue boolean DEFAULT false NOT NULL,
    can_manage_stock boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN board_users.can_view_board; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.board_users.can_view_board IS 'Weekly Board access. Enforced once board-api checks it (not yet deployed).';


--
-- Name: COLUMN board_users.can_view_crm; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.board_users.can_view_crm IS 'CRM instrument: read access.';


--
-- Name: COLUMN board_users.can_edit_crm; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.board_users.can_edit_crm IS 'CRM instrument: write access.';


--
-- Name: cat_article_alias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_article_alias (
    article text NOT NULL,
    model_id text NOT NULL,
    variant_id text NOT NULL,
    size text,
    reason text NOT NULL,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: cat_attributes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_attributes (
    variant_id text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    value_num numeric,
    flag text NOT NULL,
    import_run bigint,
    CONSTRAINT cat_attributes_flag_check CHECK ((flag = ANY (ARRAY['confirmed'::text, 'colibri_only'::text, 'unconfirmed'::text, 'conflict'::text])))
);


--
-- Name: cat_expected_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_expected_keys (
    category text NOT NULL,
    key text NOT NULL,
    section text NOT NULL,
    crucial boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: cat_facet_revision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_facet_revision (
    singleton boolean DEFAULT true NOT NULL,
    counter bigint DEFAULT 0 NOT NULL,
    rebuilt_at timestamp with time zone,
    unfiltered_facets jsonb,
    total_models bigint,
    CONSTRAINT cat_facet_revision_singleton_check CHECK (singleton)
);


--
-- Name: cat_filter_candidates_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_filter_candidates_v2 (
    candidate_id bigint NOT NULL,
    model_id text NOT NULL,
    variant_id text,
    sort_order integer,
    origin text NOT NULL,
    serial text,
    price numeric,
    size_key text,
    size_meta jsonb,
    c jsonb NOT NULL
);


--
-- Name: cat_filter_options_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_filter_options_v2 (
    group_key text NOT NULL,
    value jsonb NOT NULL
);


--
-- Name: cat_import_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_import_runs (
    id bigint NOT NULL,
    source_file text NOT NULL,
    source_built text,
    run_at timestamp with time zone DEFAULT now() NOT NULL,
    run_by text DEFAULT 'claude'::text NOT NULL,
    counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text
);


--
-- Name: cat_import_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cat_import_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cat_import_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cat_import_runs_id_seq OWNED BY public.cat_import_runs.id;


--
-- Name: cat_import_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_import_tokens (
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '02:00:00'::interval) NOT NULL,
    used_at timestamp with time zone,
    note text,
    purpose text DEFAULT 'load'::text NOT NULL
);


--
-- Name: cat_incoming; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_incoming (
    serial text NOT NULL,
    variant_id text NOT NULL,
    model_id text NOT NULL,
    size text,
    shipment text,
    shipped_on date,
    source text NOT NULL,
    clone_from text,
    added_at timestamp with time zone DEFAULT now(),
    article text
);


--
-- Name: TABLE cat_incoming; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cat_incoming IS 'Pieces shipped by a brand but not yet in Colibri stock. A piece stops counting as in transit as soon as its serial appears in cat_pieces.';


--
-- Name: cat_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_links (
    model_id text NOT NULL,
    linked_model_id text NOT NULL,
    kind text DEFAULT 'same_collection'::text NOT NULL,
    rank integer DEFAULT 0 NOT NULL
);


--
-- Name: cat_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_models (
    model_id text NOT NULL,
    article text NOT NULL,
    brand text NOT NULL,
    brand_raw text[] DEFAULT '{}'::text[] NOT NULL,
    category text NOT NULL,
    retail_category text NOT NULL,
    subcategory text,
    collection text,
    model_name text,
    gender text,
    material text,
    name_en text,
    name_ru text,
    in_stock boolean DEFAULT false NOT NULL,
    qty_stock integer DEFAULT 0 NOT NULL,
    price_min_uzs bigint,
    price_max_uzs bigint,
    latest_arrival_year integer,
    arrival_years integer[] DEFAULT '{}'::integer[] NOT NULL,
    variant_count integer DEFAULT 1 NOT NULL,
    completeness integer DEFAULT 0 NOT NULL,
    missing_crucial text[] DEFAULT '{}'::text[] NOT NULL,
    has_unconfirmed boolean DEFAULT false NOT NULL,
    image_key text,
    search_text text DEFAULT ''::text NOT NULL,
    import_run bigint,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metal_keys text[] DEFAULT '{}'::text[] NOT NULL,
    stone_keys text[] DEFAULT '{}'::text[] NOT NULL,
    movement text,
    case_mm numeric,
    qty_transit integer DEFAULT 0 NOT NULL,
    size_keys text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT cat_models_category_check CHECK ((category = ANY (ARRAY['watch'::text, 'jewellery'::text, 'accessory'::text]))),
    CONSTRAINT cat_models_gender_check CHECK ((gender = ANY (ARRAY['women'::text, 'men'::text, 'unisex'::text])))
);


--
-- Name: cat_overlay; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_overlay (
    variant_id text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    value_num numeric,
    source text NOT NULL,
    previous text,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE cat_overlay; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cat_overlay IS 'Values from brand catalogues (brand wins). Re-applied after every cat_load so a stock reload never loses them.';


--
-- Name: cat_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_photos (
    id bigint NOT NULL,
    model_id text NOT NULL,
    variant_id text,
    ord integer DEFAULT 1 NOT NULL,
    path_full text NOT NULL,
    path_thumb text NOT NULL,
    width integer,
    height integer,
    bytes_full integer,
    bytes_thumb integer,
    source text DEFAULT 'website'::text NOT NULL,
    source_file text NOT NULL,
    source_slug text,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cat_photos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cat_photos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cat_photos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cat_photos_id_seq OWNED BY public.cat_photos.id;


--
-- Name: cat_piece_sizes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_piece_sizes (
    source_kind text NOT NULL,
    source_id text NOT NULL,
    variant_id text NOT NULL,
    serial text,
    raw_size text,
    size_key text,
    size_meta jsonb,
    CONSTRAINT cat_piece_sizes_source_kind_check CHECK ((source_kind = ANY (ARRAY['boutique'::text, 'transit'::text])))
);


--
-- Name: cat_pieces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_pieces (
    id bigint NOT NULL,
    serial text NOT NULL,
    variant_id text NOT NULL,
    size text,
    price_uzs bigint,
    import_run bigint
);


--
-- Name: cat_pieces_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cat_pieces_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cat_pieces_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cat_pieces_id_seq OWNED BY public.cat_pieces.id;


--
-- Name: cat_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_reports (
    id bigint NOT NULL,
    model_id text NOT NULL,
    variant_id text,
    field_key text,
    message text NOT NULL,
    reported_by text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_by text,
    closed_at timestamp with time zone,
    CONSTRAINT cat_reports_message_check CHECK (((length(message) >= 1) AND (length(message) <= 1000))),
    CONSTRAINT cat_reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'fixed'::text, 'rejected'::text])))
);


--
-- Name: cat_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cat_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cat_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cat_reports_id_seq OWNED BY public.cat_reports.id;


--
-- Name: cat_size_coded_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_size_coded_brands (
    brand text NOT NULL
);


--
-- Name: cat_size_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_size_options (
    size_key text NOT NULL,
    size_meta jsonb NOT NULL
);


--
-- Name: cat_text_ru; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_text_ru (
    en text NOT NULL,
    ru text NOT NULL,
    source text DEFAULT 'claude'::text NOT NULL,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE cat_text_ru; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cat_text_ru IS 'Russian for attribute values written in English (keyed by the exact English text, so it survives every catalogue reload). The model page shows ru when the page is in Russian.';


--
-- Name: cat_variant_facets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_variant_facets (
    variant_id text NOT NULL,
    materials text[] DEFAULT '{}'::text[] NOT NULL,
    stone_types text[] DEFAULT '{}'::text[] NOT NULL,
    stone_presence text NOT NULL,
    case_mm numeric,
    movement text,
    spec_size_key text,
    spec_size_meta jsonb,
    CONSTRAINT cat_variant_facets_stone_presence_check CHECK ((stone_presence = ANY (ARRAY['with_stones'::text, 'without_stones'::text, 'unspecified'::text])))
);


--
-- Name: cat_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_variants (
    variant_id text NOT NULL,
    model_id text NOT NULL,
    colour_code text,
    colour_name_en text,
    colour_name_ru text,
    material text,
    in_stock boolean DEFAULT false NOT NULL,
    qty_stock integer DEFAULT 0 NOT NULL,
    qty_in integer DEFAULT 0 NOT NULL,
    qty_sold integer DEFAULT 0 NOT NULL,
    price_uzs bigint,
    arrival_years integer[] DEFAULT '{}'::integer[] NOT NULL,
    description_ru text,
    description_en text,
    found_online boolean DEFAULT false NOT NULL,
    confidence text,
    sources text[] DEFAULT '{}'::text[] NOT NULL,
    conflicts text,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    import_run bigint,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    qty_transit integer DEFAULT 0 NOT NULL,
    CONSTRAINT cat_variants_confidence_check CHECK ((confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])))
);


--
-- Name: crm_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_contacts (
    id bigint NOT NULL,
    client_id text NOT NULL,
    contacted_on date NOT NULL,
    by_name text NOT NULL,
    channel text NOT NULL,
    note text,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_contacts_channel_check CHECK ((channel = ANY (ARRAY['visit'::text, 'call'::text, 'telegram'::text, 'whatsapp'::text, 'email'::text, 'other'::text])))
);


--
-- Name: crm_contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_contacts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_contacts_id_seq OWNED BY public.crm_contacts.id;


--
-- Name: crm_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_events (
    id bigint NOT NULL,
    client_id text,
    at timestamp with time zone DEFAULT now() NOT NULL,
    actor text NOT NULL,
    action text NOT NULL,
    field text,
    old_value text,
    new_value text,
    note text
);


--
-- Name: crm_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_events_id_seq OWNED BY public.crm_events.id;


--
-- Name: crm_export_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_export_log (
    id bigint NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    actor text NOT NULL,
    kind text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    rows_out integer NOT NULL,
    with_phones boolean NOT NULL
);


--
-- Name: crm_export_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_export_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_export_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_export_log_id_seq OWNED BY public.crm_export_log.id;


--
-- Name: crm_health_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_health_snapshots (
    day date NOT NULL,
    taken_at timestamp with time zone DEFAULT now() NOT NULL,
    records integer,
    decision integer,
    confirm integer,
    done integer,
    set_aside integer,
    deleted integer,
    merged integer,
    fields jsonb
);


--
-- Name: crm_import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_import_batches (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text NOT NULL,
    status text DEFAULT 'staged'::text NOT NULL,
    period_from date,
    period_to date,
    report_date date,
    files jsonb DEFAULT '[]'::jsonb NOT NULL,
    summary jsonb,
    decided_at timestamp with time zone,
    decided_by text,
    undone_at timestamp with time zone,
    undone_by text,
    note text,
    CONSTRAINT crm_import_batches_status_check CHECK ((status = ANY (ARRAY['staged'::text, 'applied'::text, 'discarded'::text, 'undone'::text])))
);


--
-- Name: crm_import_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_import_batches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_import_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_import_batches_id_seq OWNED BY public.crm_import_batches.id;


--
-- Name: crm_import_buyers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_import_buyers (
    batch_id bigint NOT NULL,
    row_no integer NOT NULL,
    surname text,
    first_name text,
    patronymic text,
    phone_raw text,
    phone_norm text,
    items integer,
    amount numeric,
    name_key text
);


--
-- Name: crm_import_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_import_cards (
    batch_id bigint NOT NULL,
    row_no integer NOT NULL,
    surname text,
    first_name text,
    patronymic text,
    phone_raw text,
    phone_norm text,
    dob date,
    gender text,
    reg_discount numeric,
    super_discount numeric,
    accumulated numeric,
    name_key text,
    client_id text,
    match text
);


--
-- Name: crm_import_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_import_changes (
    id bigint NOT NULL,
    batch_id bigint NOT NULL,
    client_id text,
    kind text NOT NULL,
    field text,
    old_value text,
    new_value text,
    tx_id bigint,
    at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_import_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_import_changes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_import_changes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_import_changes_id_seq OWNED BY public.crm_import_changes.id;


--
-- Name: crm_import_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_import_lines (
    batch_id bigint NOT NULL,
    row_no integer NOT NULL,
    sold_at date NOT NULL,
    name_raw text,
    name_key text,
    card_no text,
    reg_discount numeric,
    item text,
    article text,
    colour text,
    size text,
    qty integer,
    gross numeric,
    discount_pct numeric,
    net numeric,
    note text,
    phone_norm text,
    advisor text,
    brand text,
    category text,
    client_id text,
    match text,
    candidates text[],
    new_key text,
    dup_tx_id bigint,
    decision text,
    advisor_raw text,
    fill_brand text,
    fill_advisor text
);


--
-- Name: crm_import_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_import_sales (
    batch_id bigint NOT NULL,
    row_no integer NOT NULL,
    sold_at date,
    item text,
    article text,
    qty integer,
    size text,
    seller text,
    gross numeric,
    net numeric,
    discount_pct numeric,
    note text,
    brand_raw text,
    used boolean DEFAULT false NOT NULL
);


--
-- Name: crm_import_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_import_tokens (
    token_hash text NOT NULL,
    purpose text DEFAULT 'crm_load'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '02:00:00'::interval) NOT NULL,
    used_at timestamp with time zone,
    note text
);


--
-- Name: TABLE crm_import_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.crm_import_tokens IS 'One-time keys for the crm-import edge function. Only the digest is stored; keys expire in two hours and are claimed on first use.';


--
-- Name: crm_important_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_important_dates (
    id bigint NOT NULL,
    client_id text NOT NULL,
    kind text NOT NULL,
    label text,
    month integer NOT NULL,
    day integer NOT NULL,
    year integer,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_important_dates_day_check CHECK (((day >= 1) AND (day <= 31))),
    CONSTRAINT crm_important_dates_kind_check CHECK ((kind = ANY (ARRAY['anniversary'::text, 'partner_birthday'::text, 'child_birthday'::text, 'other'::text]))),
    CONSTRAINT crm_important_dates_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT crm_important_dates_year_check CHECK (((year >= 1900) AND (year <= 2100)))
);


--
-- Name: crm_important_dates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_important_dates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_important_dates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_important_dates_id_seq OWNED BY public.crm_important_dates.id;


--
-- Name: crm_merge_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_merge_log (
    id bigint NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    actor text NOT NULL,
    survivor_id text NOT NULL,
    duplicate_id text NOT NULL,
    survivor_before jsonb NOT NULL,
    duplicate_before jsonb NOT NULL,
    moved_tx bigint[] DEFAULT '{}'::bigint[] NOT NULL
);


--
-- Name: TABLE crm_merge_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.crm_merge_log IS 'Archive of every merge: the full before-state of the survivor and the duplicate as jsonb, plus the purchase lines moved. Deliberately holds no foreign keys to crm_clients so an entry survives the removal of the record it describes.';


--
-- Name: crm_merge_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_merge_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_merge_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_merge_log_id_seq OWNED BY public.crm_merge_log.id;


--
-- Name: crm_missed_demand; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_missed_demand (
    id bigint NOT NULL,
    telegram_id text NOT NULL,
    client_id text,
    asked_at timestamp with time zone NOT NULL,
    kind text NOT NULL,
    brand text,
    excerpt text,
    late boolean DEFAULT false NOT NULL,
    answered boolean,
    first_reply_minutes numeric,
    basis text DEFAULT 'client words'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    status_by text,
    status_at timestamp with time zone,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_missed_demand_kind_check CHECK ((kind = ANY (ARRAY['not_carried'::text, 'not_in_stock'::text, 'awaiting'::text, 'order_request'::text, 'late_reply'::text]))),
    CONSTRAINT crm_missed_demand_status_check CHECK ((status = ANY (ARRAY['open'::text, 'followed_up'::text, 'closed'::text])))
);


--
-- Name: crm_missed_demand_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_missed_demand_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_missed_demand_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_missed_demand_id_seq OWNED BY public.crm_missed_demand.id;


--
-- Name: crm_personal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_personal (
    client_id text NOT NULL,
    ring_sizes numeric[] DEFAULT '{}'::numeric[] NOT NULL,
    wrist_cm numeric,
    necklace_cm integer,
    sizes_note text,
    sizes_by text,
    sizes_at timestamp with time zone,
    metals text[] DEFAULT '{}'::text[] NOT NULL,
    stones text[] DEFAULT '{}'::text[] NOT NULL,
    styles text[] DEFAULT '{}'::text[] NOT NULL,
    fav_brands text,
    dislikes text,
    prefs_note text,
    prefs_by text,
    prefs_at timestamp with time zone,
    address text,
    address_by text,
    address_at timestamp with time zone,
    about text,
    about_by text,
    about_at timestamp with time zone
);


--
-- Name: crm_sales_reps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_sales_reps (
    id integer NOT NULL,
    source_name text NOT NULL,
    label text NOT NULL,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: crm_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_transactions (
    id bigint NOT NULL,
    client_id text NOT NULL,
    sold_at date NOT NULL,
    brand text,
    category text,
    item text,
    qty integer,
    gross_uzs numeric(14,0),
    discount_pct numeric(6,4),
    net_uzs numeric(14,0),
    advisor text,
    article text,
    import_batch bigint,
    cat_model_id text,
    cat_variant_id text,
    cat_name_ru text,
    cat_name_en text,
    cat_thumb_url text,
    ticket_line_id uuid
);


--
-- Name: crm_queue; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.crm_queue WITH (security_invoker='true') AS
 SELECT v.client_id,
    v.record_type,
    v.record_state,
    v.in_colibri,
    v.in_marketing,
    v.abc_class,
    v.rfm_segment,
    v.lifecycle_status,
    v.client_owner,
    v.lifetime_spend_uzs,
    v.last_purchase_at,
    v.conflict_fields,
    v.gap_fields,
    v.settled_fields,
    v.queue_class,
    v.reviewed_by,
    v.reviewed_at,
    v.review_notes,
    v.updated_at,
    v.related_party,
    v.historic_owner,
    v.review_status,
    v.display_name,
    v.name_search,
    v.do_not_contact,
    v.merged_into,
    v.state_reason,
    v.first_purchase_at,
    v.purchase_occasions,
    v.brands_bought,
    v.birth_month,
    v.in_telegram,
    v.last_contact_on,
    v.last_contact_by,
    v.last_contact_channel,
    v.review_rank,
    v.lifecycle_rank,
    v.owner_label,
    v.added_by_hand,
    v.how_met,
    (EXTRACT(day FROM COALESCE(k.dob_confirmed, k.dob_colibri, k.dob_marketing)))::integer AS birth_day_any,
    (EXTRACT(month FROM COALESCE(k.dob_confirmed, k.dob_colibri, k.dob_marketing)))::integer AS birth_month_any,
    (k.dob_confirmed IS NOT NULL) AS birth_confirmed
   FROM (( SELECT q.client_id,
            q.record_type,
            q.record_state,
            q.in_colibri,
            q.in_marketing,
            q.abc_class,
            q.rfm_segment,
            q.lifecycle_status,
            q.client_owner,
            q.lifetime_spend_uzs,
            q.last_purchase_at,
            q.conflict_fields,
            q.gap_fields,
            q.settled_fields,
            q.queue_class,
            q.reviewed_by,
            q.reviewed_at,
            q.review_notes,
            q.updated_at,
            q.related_party,
            q.historic_owner,
            q.review_status,
            q.display_name,
            q.name_search,
            q.do_not_contact,
            q.merged_into,
            q.state_reason,
            q.first_purchase_at,
            q.purchase_occasions,
            q.brands_bought,
            q.birth_month,
            q.in_telegram,
            q.last_contact_on,
            q.last_contact_by,
            q.last_contact_channel,
            q.review_rank,
            q.lifecycle_rank,
            q.owner_label,
            c.added_by_hand,
            c.how_met
           FROM (( SELECT c_1.client_id,
                    c_1.record_type,
                    c_1.record_state,
                    c_1.in_colibri,
                    c_1.in_marketing,
                    c_1.abc_class,
                    c_1.rfm_segment,
                    c_1.lifecycle_status,
                    COALESCE(c_1.assigned_owner, c_1.client_owner) AS client_owner,
                    c_1.lifetime_spend_uzs,
                    c_1.last_purchase_at,
                    n.conflict_fields,
                    n.gap_fields,
                    n.settled_fields,
                        CASE
                            WHEN (n.conflict_fields > 0) THEN 'conflict'::text
                            WHEN (n.gap_fields > 0) THEN 'gap'::text
                            ELSE 'clean'::text
                        END AS queue_class,
                    c_1.reviewed_by,
                    c_1.reviewed_at,
                    c_1.review_notes,
                    c_1.updated_at,
                    c_1.related_party,
                    c_1.client_owner AS historic_owner,
                    s.rs AS review_status,
                    COALESCE(public.crm_blank(c_1.name_confirmed), public.crm_blank(c_1.name_colibri), public.crm_blank(c_1.name_marketing), public.crm_blank(c_1.name_telegram)) AS display_name,
                    translate(lower(concat_ws(' '::text, c_1.name_confirmed, c_1.name_colibri, c_1.name_marketing, c_1.name_telegram)), 'ё'::text, 'е'::text) AS name_search,
                    c_1.do_not_contact,
                    c_1.merged_into,
                    c_1.state_reason,
                    c_1.first_purchase_at,
                    c_1.purchase_occasions,
                    ( SELECT (count(DISTINCT t.brand))::integer AS count
                           FROM public.crm_transactions t
                          WHERE ((t.client_id = c_1.client_id) AND (t.brand IS NOT NULL) AND (t.brand <> 'Unassigned'::text))) AS brands_bought,
                    (EXTRACT(month FROM c_1.dob_confirmed))::integer AS birth_month,
                    c_1.in_telegram,
                    lc.contacted_on AS last_contact_on,
                    lc.by_name AS last_contact_by,
                    lc.channel AS last_contact_channel,
                        CASE s.rs
                            WHEN 'decision'::text THEN 1
                            WHEN 'confirm'::text THEN 2
                            WHEN 'set_aside'::text THEN 3
                            WHEN 'lead'::text THEN 4
                            WHEN 'clean'::text THEN 5
                            WHEN 'checked'::text THEN 6
                            WHEN 'merged'::text THEN 7
                            WHEN 'deleted'::text THEN 8
                            ELSE 9
                        END AS review_rank,
                        CASE c_1.lifecycle_status
                            WHEN 'Active'::text THEN 1
                            WHEN 'At risk'::text THEN 2
                            WHEN 'Lapsed'::text THEN 3
                            WHEN 'Dormant'::text THEN 4
                            ELSE 5
                        END AS lifecycle_rank,
                    ( SELECT r.label
                           FROM public.crm_sales_reps r
                          WHERE (r.source_name = COALESCE(c_1.assigned_owner, c_1.client_owner))
                         LIMIT 1) AS owner_label
                   FROM (((public.crm_clients c_1
                     CROSS JOIN LATERAL ( SELECT (count(*) FILTER (WHERE ((v_1.f)::text = 'conflict'::text)))::integer AS conflict_fields,
                            (count(*) FILTER (WHERE ((v_1.f)::text = 'gap'::text)))::integer AS gap_fields,
                            (count(*) FILTER (WHERE ((v_1.f)::text = ANY (ARRAY['agreed'::text, 'client'::text, 'delardi'::text, 'manual'::text, 'rule'::text]))))::integer AS settled_fields
                           FROM ( VALUES (c_1.name_flag), (c_1.phone_flag), (c_1.gender_flag), (c_1.dob_flag)) v_1(f)) n)
                     CROSS JOIN LATERAL ( SELECT
                                CASE c_1.record_state
                                    WHEN 'merged'::text THEN 'merged'::text
                                    WHEN 'deleted'::text THEN 'deleted'::text
                                    WHEN 'to_delete'::text THEN 'deleted'::text
                                    WHEN 'parked'::text THEN 'set_aside'::text
                                    WHEN 'confirmed'::text THEN 'checked'::text
                                    ELSE
                                    CASE
WHEN ((c_1.record_type = 'prospect'::text) AND c_1.in_telegram AND (NOT c_1.in_colibri) AND (NOT c_1.in_marketing)) THEN 'lead'::text
WHEN (n.conflict_fields > 0) THEN 'decision'::text
WHEN (n.gap_fields > 0) THEN 'confirm'::text
ELSE 'clean'::text
                                    END
                                END AS rs) s)
                     LEFT JOIN LATERAL ( SELECT x.contacted_on,
                            x.by_name,
                            x.channel
                           FROM public.crm_contacts x
                          WHERE (x.client_id = c_1.client_id)
                          ORDER BY x.contacted_on DESC, x.id DESC
                         LIMIT 1) lc ON (true))) q
             JOIN public.crm_clients c ON ((c.client_id = q.client_id)))) v
     JOIN public.crm_clients k ON ((k.client_id = v.client_id)));


--
-- Name: crm_recompute_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_recompute_runs (
    id bigint NOT NULL,
    ran_at timestamp with time zone DEFAULT now() NOT NULL,
    as_of date NOT NULL,
    trigger text NOT NULL,
    clients integer NOT NULL,
    abc_changed integer DEFAULT 0 NOT NULL,
    lifecycle_changed integer DEFAULT 0 NOT NULL,
    segment_changed integer DEFAULT 0 NOT NULL
);


--
-- Name: crm_recompute_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_recompute_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_recompute_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_recompute_runs_id_seq OWNED BY public.crm_recompute_runs.id;


--
-- Name: crm_rep_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_rep_aliases (
    alias text NOT NULL,
    source_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    note text
);


--
-- Name: crm_sales_reps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_sales_reps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_sales_reps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_sales_reps_id_seq OWNED BY public.crm_sales_reps.id;


--
-- Name: crm_telegram_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_telegram_chats (
    id bigint NOT NULL,
    telegram_id text NOT NULL,
    client_id text,
    link_status text NOT NULL,
    match_basis text,
    suggested_ids text[] DEFAULT '{}'::text[] NOT NULL,
    display_name text,
    phone text,
    language text,
    segment text,
    dormant boolean,
    do_not_contact boolean,
    first_contact date,
    last_contact date,
    last_client_message date,
    messages_total integer,
    messages_from_client integer,
    messages_from_boutique integer,
    inquiries integer,
    replies_over_24h integer,
    never_answered integer,
    broadcasts_received integer,
    interest_brands text[] DEFAULT '{}'::text[] NOT NULL,
    purchase_signal boolean DEFAULT false NOT NULL,
    pos_revenue_uzs numeric,
    pos_items integer,
    last_pos_purchase date,
    pos_brands text[] DEFAULT '{}'::text[] NOT NULL,
    max_discount_pct numeric,
    flags text[] DEFAULT '{}'::text[] NOT NULL,
    last_client_excerpt text,
    as_of date NOT NULL,
    source text NOT NULL,
    loaded_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_by text,
    decided_at timestamp with time zone,
    CONSTRAINT crm_telegram_chats_link_status_check CHECK ((link_status = ANY (ARRAY['phone'::text, 'suggested'::text, 'confirmed'::text, 'rejected'::text, 'lead'::text, 'none'::text])))
);


--
-- Name: crm_telegram_chats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_telegram_chats_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_telegram_chats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_telegram_chats_id_seq OWNED BY public.crm_telegram_chats.id;


--
-- Name: crm_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_transactions_id_seq OWNED BY public.crm_transactions.id;


--
-- Name: crm_value_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_value_mappings (
    id integer NOT NULL,
    field text NOT NULL,
    raw_value text NOT NULL,
    db_value text,
    extra text
);


--
-- Name: crm_value_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_value_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_value_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_value_mappings_id_seq OWNED BY public.crm_value_mappings.id;


--
-- Name: editor_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.editor_sessions (
    token text NOT NULL,
    display_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    can_view_sensitive boolean DEFAULT false NOT NULL,
    can_view_email_suggestions boolean DEFAULT false NOT NULL,
    can_view_crm boolean DEFAULT false NOT NULL,
    can_edit_crm boolean DEFAULT false NOT NULL,
    can_view_board boolean DEFAULT false NOT NULL,
    can_view_catalogue boolean DEFAULT false NOT NULL
);


--
-- Name: email_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mailbox text DEFAULT 'INBOX'::text NOT NULL,
    email_uid integer NOT NULL,
    from_addr text,
    to_addr text,
    subject text,
    sent_at timestamp with time zone,
    body_text text,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed boolean DEFAULT false NOT NULL,
    suggestion_id uuid,
    review_note text
);


--
-- Name: ops_piece_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_piece_events (
    event_id bigint NOT NULL,
    piece_id uuid NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    from_state text,
    to_state text NOT NULL,
    reason text NOT NULL,
    ref_kind text,
    ref_id text,
    actor text NOT NULL,
    note text,
    CONSTRAINT ops_piece_events_reason_check CHECK ((reason = ANY (ARRAY['initial_load'::text, 'arrived'::text, 'sold'::text, 'refunded'::text, 'reserved'::text, 'released'::text, 'booked_out'::text, 'returned_from_loan'::text, 'damaged'::text, 'repaired'::text, 'review_resolved'::text, 'serial_reused'::text]))),
    CONSTRAINT ops_piece_events_ref_kind_check CHECK ((ref_kind = ANY (ARRAY['cat_run'::text, 'ticket_line'::text, 'review'::text, 'manual'::text])))
);


--
-- Name: ops_piece_events_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ops_piece_events ALTER COLUMN event_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ops_piece_events_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ops_pieces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_pieces (
    piece_id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id smallint NOT NULL,
    brand text NOT NULL,
    serial text NOT NULL,
    article text,
    model_id text,
    variant_id text,
    size text,
    state text NOT NULL,
    state_since timestamp with time zone DEFAULT now() NOT NULL,
    hold_client_id text,
    hold_until date,
    state_note text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_run bigint,
    last_seen_at timestamp with time zone,
    sold_line_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    shipped_on date,
    CONSTRAINT ops_pieces_state_check CHECK ((state = ANY (ARRAY['in_transit'::text, 'in_stock'::text, 'reserved'::text, 'booked_out'::text, 'damaged'::text, 'sold'::text, 'not_received'::text])))
);


--
-- Name: ops_review; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_review (
    review_id bigint NOT NULL,
    piece_id uuid NOT NULL,
    kind text NOT NULL,
    raised_at timestamp with time zone DEFAULT now() NOT NULL,
    raised_run bigint,
    status text DEFAULT 'open'::text NOT NULL,
    resolution text,
    resolved_by text,
    resolved_at timestamp with time zone,
    note text,
    CONSTRAINT ops_review_kind_check CHECK ((kind = ANY (ARRAY['missing_from_export'::text, 'serial_reused'::text, 'ticket_conflict'::text, 'overdue_in_transit'::text, 'dropped_from_incoming'::text]))),
    CONSTRAINT ops_review_resolution_check CHECK ((resolution = ANY (ARRAY['sold'::text, 'damaged'::text, 'booked_out'::text, 'still_in_stock'::text, 'still_in_transit'::text, 'not_delivered'::text]))),
    CONSTRAINT ops_review_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'auto_closed'::text])))
);


--
-- Name: ops_review_review_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ops_review ALTER COLUMN review_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ops_review_review_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ops_stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_stores (
    store_id smallint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    address text,
    active boolean DEFAULT true NOT NULL,
    opened_on date
);


--
-- Name: ops_ticket_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_ticket_lines (
    line_id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    line_no integer NOT NULL,
    kind text DEFAULT 'sale'::text NOT NULL,
    article text,
    item_name text,
    size text,
    model_id text,
    variant_id text,
    piece_id uuid,
    serial_raw text,
    qty integer DEFAULT 1 NOT NULL,
    price_list numeric(14,0),
    price_current numeric(14,0),
    discount_pct numeric(6,4),
    discount_amt numeric(14,0),
    net numeric(14,0),
    CONSTRAINT ops_ticket_lines_kind_check CHECK ((kind = ANY (ARRAY['sale'::text, 'refund'::text])))
);


--
-- Name: ops_ticket_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_ticket_payments (
    payment_id bigint NOT NULL,
    ticket_id uuid NOT NULL,
    method text NOT NULL,
    amount numeric(14,0) NOT NULL,
    raw text,
    CONSTRAINT ops_ticket_payments_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'card'::text, 'visa'::text, 'qr'::text, 'transfer'::text, 'other'::text])))
);


--
-- Name: ops_ticket_payments_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ops_ticket_payments ALTER COLUMN payment_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ops_ticket_payments_payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ops_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_tickets (
    ticket_id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id smallint NOT NULL,
    source text NOT NULL,
    ticket_no text NOT NULL,
    sold_at date NOT NULL,
    seller text,
    seller_raw text,
    client_id text,
    card_no text,
    entered_by text,
    note text,
    fiscal_ref text,
    status text DEFAULT 'posted'::text NOT NULL,
    source_file text,
    loaded_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ops_tickets_source_check CHECK ((source = ANY (ARRAY['colibri'::text, 'delardi'::text]))),
    CONSTRAINT ops_tickets_status_check CHECK ((status = ANY (ARRAY['posted'::text, 'void'::text])))
);


--
-- Name: pillars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pillars (
    id smallint NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    sort_order smallint NOT NULL,
    accent text NOT NULL
);


--
-- Name: scoreboard; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scoreboard (
    id smallint NOT NULL,
    metric text NOT NULL,
    current_val text,
    direction text,
    note text,
    sort_order smallint NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    target_topic_id uuid,
    pillar_id smallint,
    title text,
    note text NOT NULL,
    owner text,
    status text,
    next_step text,
    source_meeting text NOT NULL,
    source_date date,
    evidence text,
    state text DEFAULT 'pending'::text NOT NULL,
    decided_by text,
    decided_at timestamp with time zone,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    supporting text,
    channel text DEFAULT 'zoom'::text NOT NULL,
    CONSTRAINT suggestions_channel_check CHECK ((channel = ANY (ARRAY['zoom'::text, 'email'::text]))),
    CONSTRAINT suggestions_kind_check CHECK ((kind = ANY (ARRAY['new'::text, 'update'::text]))),
    CONSTRAINT suggestions_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'accepted'::text, 'dismissed'::text]))),
    CONSTRAINT suggestions_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'blocked'::text, 'needs_decision'::text, 'decided'::text, 'done'::text, 'parked'::text]))),
    CONSTRAINT target_or_pillar CHECK ((((kind = 'update'::text) AND (target_topic_id IS NOT NULL)) OR ((kind = 'new'::text) AND (pillar_id IS NOT NULL) AND (title IS NOT NULL))))
);


--
-- Name: topic_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topic_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    topic_id uuid NOT NULL,
    week_start date NOT NULL,
    note text NOT NULL,
    status_at text,
    author text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_date date,
    entered_at timestamp with time zone
);


--
-- Name: COLUMN topic_updates.event_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.topic_updates.event_date IS 'Date the described event actually happened (from the source line or the original entry date). Use this for chronological ordering of a topic''s weekly record.';


--
-- Name: COLUMN topic_updates.entered_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.topic_updates.entered_at IS 'Original created_at value: when the row was actually written to the board. Preserved when created_at was normalised to event chronology on 2026-09-29.';


--
-- Name: topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pillar_id smallint NOT NULL,
    title text NOT NULL,
    detail text,
    owner text,
    status text DEFAULT 'not_started'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    next_step text,
    due_date date,
    first_raised_week date,
    last_discussed_week date,
    sort_order integer DEFAULT 0 NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    supporting text,
    sensitive boolean DEFAULT false NOT NULL,
    status_week date,
    CONSTRAINT topics_priority_check CHECK ((priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT topics_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'blocked'::text, 'needs_decision'::text, 'decided'::text, 'done'::text, 'parked'::text])))
);


--
-- Name: weeks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weeks (
    week_start date NOT NULL,
    label text,
    zoom_url text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    minutes_md text,
    finalized_by text,
    finalized_at timestamp with time zone
);


--
-- Name: write_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.write_log (
    id bigint NOT NULL,
    action text NOT NULL,
    actor text,
    target_id uuid,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: write_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.write_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: write_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.write_log_id_seq OWNED BY public.write_log.id;


--
-- Name: auth_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_attempts ALTER COLUMN id SET DEFAULT nextval('public.auth_attempts_id_seq'::regclass);


--
-- Name: cat_import_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_import_runs ALTER COLUMN id SET DEFAULT nextval('public.cat_import_runs_id_seq'::regclass);


--
-- Name: cat_photos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_photos ALTER COLUMN id SET DEFAULT nextval('public.cat_photos_id_seq'::regclass);


--
-- Name: cat_pieces id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_pieces ALTER COLUMN id SET DEFAULT nextval('public.cat_pieces_id_seq'::regclass);


--
-- Name: cat_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_reports ALTER COLUMN id SET DEFAULT nextval('public.cat_reports_id_seq'::regclass);


--
-- Name: crm_contacts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts ALTER COLUMN id SET DEFAULT nextval('public.crm_contacts_id_seq'::regclass);


--
-- Name: crm_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_events ALTER COLUMN id SET DEFAULT nextval('public.crm_events_id_seq'::regclass);


--
-- Name: crm_export_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_export_log ALTER COLUMN id SET DEFAULT nextval('public.crm_export_log_id_seq'::regclass);


--
-- Name: crm_import_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_import_batches ALTER COLUMN id SET DEFAULT nextval('public.crm_import_batches_id_seq'::regclass);


--
-- Name: crm_import_changes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_import_changes ALTER COLUMN id SET DEFAULT nextval('public.crm_import_changes_id_seq'::regclass);


--
-- Name: crm_important_dates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_important_dates ALTER COLUMN id SET DEFAULT nextval('public.crm_important_dates_id_seq'::regclass);


--
-- Name: crm_merge_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_merge_log ALTER COLUMN id SET DEFAULT nextval('public.crm_merge_log_id_seq'::regclass);


--
-- Name: crm_missed_demand id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_missed_demand ALTER COLUMN id SET DEFAULT nextval('public.crm_missed_demand_id_seq'::regclass);


--
-- Name: crm_recompute_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_recompute_runs ALTER COLUMN id SET DEFAULT nextval('public.crm_recompute_runs_id_seq'::regclass);


--
-- Name: crm_sales_reps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sales_reps ALTER COLUMN id SET DEFAULT nextval('public.crm_sales_reps_id_seq'::regclass);


--
-- Name: crm_telegram_chats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_telegram_chats ALTER COLUMN id SET DEFAULT nextval('public.crm_telegram_chats_id_seq'::regclass);


--
-- Name: crm_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_transactions ALTER COLUMN id SET DEFAULT nextval('public.crm_transactions_id_seq'::regclass);


--
-- Name: crm_value_mappings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_value_mappings ALTER COLUMN id SET DEFAULT nextval('public.crm_value_mappings_id_seq'::regclass);


--
-- Name: write_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.write_log ALTER COLUMN id SET DEFAULT nextval('public.write_log_id_seq'::regclass);


--
-- Name: auth_attempts auth_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_attempts
    ADD CONSTRAINT auth_attempts_pkey PRIMARY KEY (id);


--
-- Name: board_users board_users_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_users
    ADD CONSTRAINT board_users_name_key UNIQUE (name);


--
-- Name: board_users board_users_passcode_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_users
    ADD CONSTRAINT board_users_passcode_hash_key UNIQUE (passcode_hash);


--
-- Name: board_users board_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_users
    ADD CONSTRAINT board_users_pkey PRIMARY KEY (id);


--
-- Name: cat_article_alias cat_article_alias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_article_alias
    ADD CONSTRAINT cat_article_alias_pkey PRIMARY KEY (article);


--
-- Name: cat_attributes cat_attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_attributes
    ADD CONSTRAINT cat_attributes_pkey PRIMARY KEY (variant_id, key);


--
-- Name: cat_expected_keys cat_expected_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_expected_keys
    ADD CONSTRAINT cat_expected_keys_pkey PRIMARY KEY (category, key);


--
-- Name: cat_facet_revision cat_facet_revision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_facet_revision
    ADD CONSTRAINT cat_facet_revision_pkey PRIMARY KEY (singleton);


--
-- Name: cat_filter_candidates_v2 cat_filter_candidates_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_filter_candidates_v2
    ADD CONSTRAINT cat_filter_candidates_v2_pkey PRIMARY KEY (candidate_id);


--
-- Name: cat_filter_options_v2 cat_filter_options_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_filter_options_v2
    ADD CONSTRAINT cat_filter_options_v2_pkey PRIMARY KEY (group_key, value);


--
-- Name: cat_import_runs cat_import_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_import_runs
    ADD CONSTRAINT cat_import_runs_pkey PRIMARY KEY (id);


--
-- Name: cat_import_tokens cat_import_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_import_tokens
    ADD CONSTRAINT cat_import_tokens_pkey PRIMARY KEY (token_hash);


--
-- Name: cat_incoming cat_incoming_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_incoming
    ADD CONSTRAINT cat_incoming_pkey PRIMARY KEY (serial);


--
-- Name: cat_links cat_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_links
    ADD CONSTRAINT cat_links_pkey PRIMARY KEY (model_id, linked_model_id);


--
-- Name: cat_models cat_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_models
    ADD CONSTRAINT cat_models_pkey PRIMARY KEY (model_id);


--
-- Name: cat_overlay cat_overlay_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_overlay
    ADD CONSTRAINT cat_overlay_pkey PRIMARY KEY (variant_id, key);


--
-- Name: cat_photos cat_photos_model_id_source_file_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_photos
    ADD CONSTRAINT cat_photos_model_id_source_file_key UNIQUE (model_id, source_file);


--
-- Name: cat_photos cat_photos_path_full_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_photos
    ADD CONSTRAINT cat_photos_path_full_key UNIQUE (path_full);


--
-- Name: cat_photos cat_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_photos
    ADD CONSTRAINT cat_photos_pkey PRIMARY KEY (id);


--
-- Name: cat_piece_sizes cat_piece_sizes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_piece_sizes
    ADD CONSTRAINT cat_piece_sizes_pkey PRIMARY KEY (source_kind, source_id);


--
-- Name: cat_pieces cat_pieces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_pieces
    ADD CONSTRAINT cat_pieces_pkey PRIMARY KEY (id);


--
-- Name: cat_reports cat_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_reports
    ADD CONSTRAINT cat_reports_pkey PRIMARY KEY (id);


--
-- Name: cat_size_coded_brands cat_size_coded_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_size_coded_brands
    ADD CONSTRAINT cat_size_coded_brands_pkey PRIMARY KEY (brand);


--
-- Name: cat_size_options cat_size_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_size_options
    ADD CONSTRAINT cat_size_options_pkey PRIMARY KEY (size_key);


--
-- Name: cat_text_ru cat_text_ru_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_text_ru
    ADD CONSTRAINT cat_text_ru_pkey PRIMARY KEY (en);


--
-- Name: cat_variant_facets cat_variant_facets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_variant_facets
    ADD CONSTRAINT cat_variant_facets_pkey PRIMARY KEY (variant_id);


--
-- Name: cat_variants cat_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_variants
    ADD CONSTRAINT cat_variants_pkey PRIMARY KEY (variant_id);


--
-- Name: crm_clients crm_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_clients
    ADD CONSTRAINT crm_clients_pkey PRIMARY KEY (client_id);


--
-- Name: crm_contacts crm_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_pkey PRIMARY KEY (id);


--
-- Name: crm_events crm_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_events
    ADD CONSTRAINT crm_events_pkey PRIMARY KEY (id);


--
-- Name: crm_export_log crm_export_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_export_log
    ADD CONSTRAINT crm_export_log_pkey PRIMARY KEY (id);


--
-- Name: crm_health_snapshots crm_health_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_health_snapshots
    ADD CONSTRAINT crm_health_snapshots_pkey PRIMARY KEY (day);


--
-- Name: crm_import_batches crm_import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_import_batches
    ADD CONSTRAINT crm_import_batches_pkey PRIMARY KEY (id);


--
-- Name: crm_import_buyers crm_import_buyers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_import_buyers
    ADD CONSTRAINT crm_import_buyers_pkey PRIMARY KEY (batch_id, row_no);


--
-- Name: crm_import_cards crm_import_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_import_cards
    ADD CONSTRAINT crm_import_cards_pkey PRIMARY KEY (batch_id, row_no);


--
-- Name: crm_import_changes crm_import_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_import_changes
    ADD CONSTRAINT crm_import_changes_pkey PRIMARY KEY (id);


--
-- Name: crm_import_lines crm_import_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_import_lines
    ADD CONSTRAINT crm_import_lines_pkey PRIMARY KEY (batch_id, row_no);


--
-- Name: crm_import_sales crm_import_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_import_sales
    ADD CONSTRAINT crm_import_sales_pkey PRIMARY KEY (batch_id, row_no);


--
-- Name: crm_import_tokens crm_import_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_import_tokens
    ADD CONSTRAINT crm_import_tokens_pkey PRIMARY KEY (token_hash);


--
-- Name: crm_important_dates crm_important_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_important_dates
    ADD CONSTRAINT crm_important_dates_pkey PRIMARY KEY (id);


--
-- Name: crm_merge_log crm_merge_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_merge_log
    ADD CONSTRAINT crm_merge_log_pkey PRIMARY KEY (id);


--
-- Name: crm_missed_demand crm_missed_demand_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_missed_demand
    ADD CONSTRAINT crm_missed_demand_pkey PRIMARY KEY (id);


--
-- Name: crm_missed_demand crm_missed_demand_telegram_id_asked_at_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_missed_demand
    ADD CONSTRAINT crm_missed_demand_telegram_id_asked_at_kind_key UNIQUE (telegram_id, asked_at, kind);


--
-- Name: crm_personal crm_personal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_personal
    ADD CONSTRAINT crm_personal_pkey PRIMARY KEY (client_id);


--
-- Name: crm_recompute_runs crm_recompute_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_recompute_runs
    ADD CONSTRAINT crm_recompute_runs_pkey PRIMARY KEY (id);


--
-- Name: crm_rep_aliases crm_rep_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rep_aliases
    ADD CONSTRAINT crm_rep_aliases_pkey PRIMARY KEY (alias);


--
-- Name: crm_sales_reps crm_sales_reps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sales_reps
    ADD CONSTRAINT crm_sales_reps_pkey PRIMARY KEY (id);


--
-- Name: crm_sales_reps crm_sales_reps_source_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sales_reps
    ADD CONSTRAINT crm_sales_reps_source_name_key UNIQUE (source_name);


--
-- Name: crm_telegram_chats crm_telegram_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_telegram_chats
    ADD CONSTRAINT crm_telegram_chats_pkey PRIMARY KEY (id);


--
-- Name: crm_telegram_chats crm_telegram_chats_telegram_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_telegram_chats
    ADD CONSTRAINT crm_telegram_chats_telegram_id_key UNIQUE (telegram_id);


--
-- Name: crm_transactions crm_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_transactions
    ADD CONSTRAINT crm_transactions_pkey PRIMARY KEY (id);


--
-- Name: crm_value_mappings crm_value_mappings_field_raw_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_value_mappings
    ADD CONSTRAINT crm_value_mappings_field_raw_value_key UNIQUE (field, raw_value);


--
-- Name: crm_value_mappings crm_value_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_value_mappings
    ADD CONSTRAINT crm_value_mappings_pkey PRIMARY KEY (id);


--
-- Name: editor_sessions editor_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editor_sessions
    ADD CONSTRAINT editor_sessions_pkey PRIMARY KEY (token);


--
-- Name: email_cache email_cache_mailbox_email_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_cache
    ADD CONSTRAINT email_cache_mailbox_email_uid_key UNIQUE (mailbox, email_uid);


--
-- Name: email_cache email_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_cache
    ADD CONSTRAINT email_cache_pkey PRIMARY KEY (id);


--
-- Name: ops_piece_events ops_piece_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_piece_events
    ADD CONSTRAINT ops_piece_events_pkey PRIMARY KEY (event_id);


--
-- Name: ops_pieces ops_pieces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_pieces
    ADD CONSTRAINT ops_pieces_pkey PRIMARY KEY (piece_id);


--
-- Name: ops_review ops_review_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_review
    ADD CONSTRAINT ops_review_pkey PRIMARY KEY (review_id);


--
-- Name: ops_stores ops_stores_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_stores
    ADD CONSTRAINT ops_stores_code_key UNIQUE (code);


--
-- Name: ops_stores ops_stores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_stores
    ADD CONSTRAINT ops_stores_pkey PRIMARY KEY (store_id);


--
-- Name: ops_ticket_lines ops_ticket_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_ticket_lines
    ADD CONSTRAINT ops_ticket_lines_pkey PRIMARY KEY (line_id);


--
-- Name: ops_ticket_lines ops_ticket_lines_ticket_id_line_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_ticket_lines
    ADD CONSTRAINT ops_ticket_lines_ticket_id_line_no_key UNIQUE (ticket_id, line_no);


--
-- Name: ops_ticket_payments ops_ticket_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_ticket_payments
    ADD CONSTRAINT ops_ticket_payments_pkey PRIMARY KEY (payment_id);


--
-- Name: ops_tickets ops_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_tickets
    ADD CONSTRAINT ops_tickets_pkey PRIMARY KEY (ticket_id);


--
-- Name: ops_tickets ops_tickets_store_id_source_ticket_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_tickets
    ADD CONSTRAINT ops_tickets_store_id_source_ticket_no_key UNIQUE (store_id, source, ticket_no);


--
-- Name: pillars pillars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pillars
    ADD CONSTRAINT pillars_pkey PRIMARY KEY (id);


--
-- Name: pillars pillars_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pillars
    ADD CONSTRAINT pillars_slug_key UNIQUE (slug);


--
-- Name: scoreboard scoreboard_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoreboard
    ADD CONSTRAINT scoreboard_pkey PRIMARY KEY (id);


--
-- Name: suggestions suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suggestions
    ADD CONSTRAINT suggestions_pkey PRIMARY KEY (id);


--
-- Name: topic_updates topic_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_updates
    ADD CONSTRAINT topic_updates_pkey PRIMARY KEY (id);


--
-- Name: topics topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_pkey PRIMARY KEY (id);


--
-- Name: weeks weeks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weeks
    ADD CONSTRAINT weeks_pkey PRIMARY KEY (week_start);


--
-- Name: write_log write_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.write_log
    ADD CONSTRAINT write_log_pkey PRIMARY KEY (id);


--
-- Name: auth_attempts_ip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_attempts_ip_idx ON public.auth_attempts USING btree (ip, created_at DESC);


--
-- Name: cat_filter_candidates_model_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_filter_candidates_model_idx ON public.cat_filter_candidates_v2 USING btree (model_id);


--
-- Name: cat_filter_candidates_serial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_filter_candidates_serial_idx ON public.cat_filter_candidates_v2 USING btree (lower(serial));


--
-- Name: cat_filter_candidates_variant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_filter_candidates_variant_idx ON public.cat_filter_candidates_v2 USING btree (variant_id);


--
-- Name: cat_models_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_models_brand ON public.cat_models USING btree (brand);


--
-- Name: cat_models_cat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_models_cat ON public.cat_models USING btree (category, retail_category);


--
-- Name: cat_models_coll; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_models_coll ON public.cat_models USING btree (collection);


--
-- Name: cat_models_metal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_models_metal ON public.cat_models USING gin (metal_keys);


--
-- Name: cat_models_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_models_search ON public.cat_models USING gin (search_text extensions.gin_trgm_ops);


--
-- Name: cat_models_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_models_sort ON public.cat_models USING btree (in_stock DESC, latest_arrival_year DESC NULLS LAST);


--
-- Name: cat_models_stone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_models_stone ON public.cat_models USING gin (stone_keys);


--
-- Name: cat_photos_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_photos_model ON public.cat_photos USING btree (model_id, variant_id, ord);


--
-- Name: cat_piece_sizes_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_piece_sizes_key_idx ON public.cat_piece_sizes USING btree (size_key);


--
-- Name: cat_piece_sizes_variant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_piece_sizes_variant_idx ON public.cat_piece_sizes USING btree (variant_id);


--
-- Name: cat_pieces_serial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_pieces_serial ON public.cat_pieces USING btree (serial);


--
-- Name: cat_pieces_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_pieces_variant ON public.cat_pieces USING btree (variant_id);


--
-- Name: cat_variant_facets_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_variant_facets_case_idx ON public.cat_variant_facets USING btree (case_mm);


--
-- Name: cat_variant_facets_materials_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_variant_facets_materials_gin ON public.cat_variant_facets USING gin (materials);


--
-- Name: cat_variant_facets_movement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_variant_facets_movement_idx ON public.cat_variant_facets USING btree (movement);


--
-- Name: cat_variant_facets_stones_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_variant_facets_stones_gin ON public.cat_variant_facets USING gin (stone_types);


--
-- Name: cat_variants_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cat_variants_model ON public.cat_variants USING btree (model_id);


--
-- Name: crm_clients_flags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_clients_flags_idx ON public.crm_clients USING btree (name_flag, phone_flag, gender_flag, dob_flag);


--
-- Name: crm_clients_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_clients_state_idx ON public.crm_clients USING btree (record_state);


--
-- Name: crm_clients_telegram_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_clients_telegram_id_idx ON public.crm_clients USING btree (telegram_id);


--
-- Name: crm_contacts_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_contacts_client_idx ON public.crm_contacts USING btree (client_id, contacted_on DESC, id DESC);


--
-- Name: crm_events_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_events_client_idx ON public.crm_events USING btree (client_id, at DESC);


--
-- Name: crm_export_log_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_export_log_at_idx ON public.crm_export_log USING btree (at DESC);


--
-- Name: crm_import_lines_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_import_lines_key ON public.crm_import_lines USING btree (batch_id, name_key);


--
-- Name: crm_important_dates_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_important_dates_client_idx ON public.crm_important_dates USING btree (client_id);


--
-- Name: crm_missed_demand_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_missed_demand_client_idx ON public.crm_missed_demand USING btree (client_id);


--
-- Name: crm_telegram_chats_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_telegram_chats_client_idx ON public.crm_telegram_chats USING btree (client_id);


--
-- Name: crm_transactions_article_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_transactions_article_idx ON public.crm_transactions USING btree (article);


--
-- Name: crm_transactions_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_transactions_brand_idx ON public.crm_transactions USING btree (brand);


--
-- Name: crm_transactions_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_transactions_category_idx ON public.crm_transactions USING btree (category);


--
-- Name: crm_transactions_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_transactions_client_idx ON public.crm_transactions USING btree (client_id);


--
-- Name: crm_transactions_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_transactions_date_idx ON public.crm_transactions USING btree (sold_at DESC);


--
-- Name: crm_transactions_ticket_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_transactions_ticket_line ON public.crm_transactions USING btree (ticket_line_id) WHERE (ticket_line_id IS NOT NULL);


--
-- Name: crm_tx_client_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_tx_client_date_idx ON public.crm_transactions USING btree (client_id, sold_at DESC);


--
-- Name: ops_piece_events_piece; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ops_piece_events_piece ON public.ops_piece_events USING btree (piece_id, at);


--
-- Name: ops_pieces_live_serial; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ops_pieces_live_serial ON public.ops_pieces USING btree (brand, upper(btrim(serial))) WHERE (state <> ALL (ARRAY['sold'::text, 'not_received'::text]));


--
-- Name: ops_pieces_serial_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ops_pieces_serial_key ON public.ops_pieces USING btree (upper(btrim(serial)));


--
-- Name: ops_review_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ops_review_open ON public.ops_review USING btree (piece_id, kind) WHERE (status = 'open'::text);


--
-- Name: ops_ticket_lines_piece; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ops_ticket_lines_piece ON public.ops_ticket_lines USING btree (piece_id);


--
-- Name: ops_ticket_lines_serial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ops_ticket_lines_serial ON public.ops_ticket_lines USING btree (upper(btrim(serial_raw)));


--
-- Name: suggestions_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX suggestions_state_idx ON public.suggestions USING btree (state, sort_order);


--
-- Name: topic_updates_topic_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX topic_updates_topic_idx ON public.topic_updates USING btree (topic_id, created_at DESC);


--
-- Name: topic_updates_week_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX topic_updates_week_idx ON public.topic_updates USING btree (week_start);


--
-- Name: topics_pillar_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX topics_pillar_idx ON public.topics USING btree (pillar_id) WHERE (archived = false);


--
-- Name: topics_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX topics_status_idx ON public.topics USING btree (status) WHERE (archived = false);


--
-- Name: cat_photos cat_photos_relink; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cat_photos_relink AFTER INSERT OR UPDATE ON public.cat_photos FOR EACH ROW EXECUTE FUNCTION public.cat_photos_relink();


--
-- Name: crm_clients crm_clients_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_clients_touch BEFORE UPDATE ON public.crm_clients FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();


--
-- Name: crm_transactions crm_transactions_cat_link; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_transactions_cat_link BEFORE INSERT OR UPDATE OF article, item ON public.crm_transactions FOR EACH ROW EXECUTE FUNCTION public.crm_transactions_cat_link();


--
-- Name: ops_piece_events ops_piece_events_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ops_piece_events_immutable BEFORE DELETE OR UPDATE ON public.ops_piece_events FOR EACH ROW EXECUTE FUNCTION public.ops_piece_events_immutable();


--
-- Name: topics topics_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER topics_touch BEFORE UPDATE ON public.topics FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: cat_attributes cat_attributes_import_run_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_attributes
    ADD CONSTRAINT cat_attributes_import_run_fkey FOREIGN KEY (import_run) REFERENCES public.cat_import_runs(id);


--
-- Name: cat_attributes cat_attributes_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_attributes
    ADD CONSTRAINT cat_attributes_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.cat_variants(variant_id) ON DELETE CASCADE;


--
-- Name: cat_filter_candidates_v2 cat_filter_candidates_v2_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_filter_candidates_v2
    ADD CONSTRAINT cat_filter_candidates_v2_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.cat_models(model_id) ON DELETE CASCADE;


--
-- Name: cat_filter_candidates_v2 cat_filter_candidates_v2_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_filter_candidates_v2
    ADD CONSTRAINT cat_filter_candidates_v2_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.cat_variants(variant_id) ON DELETE CASCADE;


--
-- Name: cat_links cat_links_linked_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_links
    ADD CONSTRAINT cat_links_linked_model_id_fkey FOREIGN KEY (linked_model_id) REFERENCES public.cat_models(model_id) ON DELETE CASCADE;


--
-- Name: cat_links cat_links_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_links
    ADD CONSTRAINT cat_links_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.cat_models(model_id) ON DELETE CASCADE;


--
-- Name: cat_models cat_models_import_run_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_models
    ADD CONSTRAINT cat_models_import_run_fkey FOREIGN KEY (import_run) REFERENCES public.cat_import_runs(id);


--
-- Name: cat_photos cat_photos_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_photos
    ADD CONSTRAINT cat_photos_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.cat_models(model_id) ON DELETE CASCADE;


--
-- Name: cat_piece_sizes cat_piece_sizes_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_piece_sizes
    ADD CONSTRAINT cat_piece_sizes_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.cat_variants(variant_id) ON DELETE CASCADE;


--
-- Name: cat_pieces cat_pieces_import_run_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_pieces
    ADD CONSTRAINT cat_pieces_import_run_fkey FOREIGN KEY (import_run) REFERENCES public.cat_import_runs(id);


--
-- Name: cat_pieces cat_pieces_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_pieces
    ADD CONSTRAINT cat_pieces_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.cat_variants(variant_id) ON DELETE CASCADE;


--
-- Name: cat_reports cat_reports_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_reports
    ADD CONSTRAINT cat_reports_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.cat_models(model_id) ON DELETE CASCADE;


--
-- Name: cat_reports cat_reports_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_reports
    ADD CONSTRAINT cat_reports_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.cat_variants(variant_id) ON DELETE SET NULL;


--
-- Name: cat_variant_facets cat_variant_facets_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_variant_facets
    ADD CONSTRAINT cat_variant_facets_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.cat_variants(variant_id) ON DELETE CASCADE;


--
-- Name: cat_variants cat_variants_import_run_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_variants
    ADD CONSTRAINT cat_variants_import_run_fkey FOREIGN KEY (import_run) REFERENCES public.cat_import_runs(id);


--
-- Name: cat_variants cat_variants_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_variants
    ADD CONSTRAINT cat_variants_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.cat_models(model_id) ON DELETE CASCADE;


--
-- Name: crm_clients crm_clients_merged_into_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_clients
    ADD CONSTRAINT crm_clients_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES public.crm_clients(client_id);


--
-- Name: crm_contacts crm_contacts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.crm_clients(client_id);


--
-- Name: crm_import_buyers crm_import_buyers_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_import_buyers
    ADD CONSTRAINT crm_import_buyers_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.crm_import_batches(id) ON DELETE CASCADE;


--
-- Name: crm_import_cards crm_import_cards_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_import_cards
    ADD CONSTRAINT crm_import_cards_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.crm_import_batches(id) ON DELETE CASCADE;


--
-- Name: crm_import_changes crm_import_changes_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_import_changes
    ADD CONSTRAINT crm_import_changes_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.crm_import_batches(id) ON DELETE CASCADE;


--
-- Name: crm_import_lines crm_import_lines_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_import_lines
    ADD CONSTRAINT crm_import_lines_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.crm_import_batches(id) ON DELETE CASCADE;


--
-- Name: crm_import_sales crm_import_sales_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_import_sales
    ADD CONSTRAINT crm_import_sales_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.crm_import_batches(id) ON DELETE CASCADE;


--
-- Name: crm_important_dates crm_important_dates_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_important_dates
    ADD CONSTRAINT crm_important_dates_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.crm_clients(client_id);


--
-- Name: crm_missed_demand crm_missed_demand_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_missed_demand
    ADD CONSTRAINT crm_missed_demand_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.crm_clients(client_id);


--
-- Name: crm_personal crm_personal_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_personal
    ADD CONSTRAINT crm_personal_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.crm_clients(client_id);


--
-- Name: crm_telegram_chats crm_telegram_chats_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_telegram_chats
    ADD CONSTRAINT crm_telegram_chats_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.crm_clients(client_id);


--
-- Name: crm_transactions crm_transactions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_transactions
    ADD CONSTRAINT crm_transactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.crm_clients(client_id) ON DELETE RESTRICT;


--
-- Name: crm_transactions crm_transactions_ticket_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_transactions
    ADD CONSTRAINT crm_transactions_ticket_line_id_fkey FOREIGN KEY (ticket_line_id) REFERENCES public.ops_ticket_lines(line_id) ON DELETE SET NULL;


--
-- Name: email_cache email_cache_suggestion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_cache
    ADD CONSTRAINT email_cache_suggestion_id_fkey FOREIGN KEY (suggestion_id) REFERENCES public.suggestions(id) ON DELETE SET NULL;


--
-- Name: ops_piece_events ops_piece_events_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_piece_events
    ADD CONSTRAINT ops_piece_events_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES public.ops_pieces(piece_id);


--
-- Name: ops_pieces ops_pieces_hold_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_pieces
    ADD CONSTRAINT ops_pieces_hold_client_id_fkey FOREIGN KEY (hold_client_id) REFERENCES public.crm_clients(client_id);


--
-- Name: ops_pieces ops_pieces_sold_line_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_pieces
    ADD CONSTRAINT ops_pieces_sold_line_fkey FOREIGN KEY (sold_line_id) REFERENCES public.ops_ticket_lines(line_id);


--
-- Name: ops_pieces ops_pieces_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_pieces
    ADD CONSTRAINT ops_pieces_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.ops_stores(store_id);


--
-- Name: ops_review ops_review_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_review
    ADD CONSTRAINT ops_review_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES public.ops_pieces(piece_id);


--
-- Name: ops_ticket_lines ops_ticket_lines_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_ticket_lines
    ADD CONSTRAINT ops_ticket_lines_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES public.ops_pieces(piece_id);


--
-- Name: ops_ticket_lines ops_ticket_lines_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_ticket_lines
    ADD CONSTRAINT ops_ticket_lines_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.ops_tickets(ticket_id) ON DELETE CASCADE;


--
-- Name: ops_ticket_payments ops_ticket_payments_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_ticket_payments
    ADD CONSTRAINT ops_ticket_payments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.ops_tickets(ticket_id) ON DELETE CASCADE;


--
-- Name: ops_tickets ops_tickets_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_tickets
    ADD CONSTRAINT ops_tickets_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.crm_clients(client_id);


--
-- Name: ops_tickets ops_tickets_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_tickets
    ADD CONSTRAINT ops_tickets_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.ops_stores(store_id);


--
-- Name: suggestions suggestions_pillar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suggestions
    ADD CONSTRAINT suggestions_pillar_id_fkey FOREIGN KEY (pillar_id) REFERENCES public.pillars(id);


--
-- Name: suggestions suggestions_target_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suggestions
    ADD CONSTRAINT suggestions_target_topic_id_fkey FOREIGN KEY (target_topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;


--
-- Name: topic_updates topic_updates_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_updates
    ADD CONSTRAINT topic_updates_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;


--
-- Name: topic_updates topic_updates_week_start_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_updates
    ADD CONSTRAINT topic_updates_week_start_fkey FOREIGN KEY (week_start) REFERENCES public.weeks(week_start);


--
-- Name: topics topics_pillar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_pillar_id_fkey FOREIGN KEY (pillar_id) REFERENCES public.pillars(id);


--
-- Name: auth_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: board_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.board_users ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_article_alias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_article_alias ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_attributes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_attributes ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_expected_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_expected_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_facet_revision; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_facet_revision ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_filter_candidates_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_filter_candidates_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_filter_options_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_filter_options_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_import_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_import_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_import_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_import_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_incoming; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_incoming ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_links ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_models; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_models ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_overlay; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_overlay ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_piece_sizes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_piece_sizes ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_pieces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_pieces ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_size_coded_brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_size_coded_brands ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_size_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_size_options ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_text_ru; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_text_ru ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_variant_facets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_variant_facets ENABLE ROW LEVEL SECURITY;

--
-- Name: cat_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cat_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_clients ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_export_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_export_log ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_health_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_health_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_import_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_import_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_import_buyers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_import_buyers ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_import_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_import_cards ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_import_changes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_import_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_import_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_import_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_import_sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_import_sales ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_import_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_import_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_important_dates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_important_dates ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_merge_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_merge_log ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_missed_demand; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_missed_demand ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_personal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_personal ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_recompute_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_recompute_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_rep_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_rep_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_sales_reps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_sales_reps ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_telegram_chats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_telegram_chats ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_value_mappings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_value_mappings ENABLE ROW LEVEL SECURITY;

--
-- Name: editor_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.editor_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: email_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_piece_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_piece_events ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_pieces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_pieces ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_review; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_review ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_stores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_stores ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_ticket_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_ticket_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_ticket_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_ticket_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: pillars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pillars ENABLE ROW LEVEL SECURITY;

--
-- Name: scoreboard; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scoreboard ENABLE ROW LEVEL SECURITY;

--
-- Name: suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: topic_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.topic_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: topics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

--
-- Name: weeks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weeks ENABLE ROW LEVEL SECURITY;

--
-- Name: write_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.write_log ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 0YQWGODP9ZgQ4DAIojEK3ow6oGWZJUxmwBBBtWTCxmnLD5HGMd3yT9ceY2khFTU

