-- Stock table tools, as on the CRM list: sort by a column, choose several values of a column at once, and see each
-- value's count under the other filters (the column checklists).
--   p.sort    "<column>.<asc|desc>"; columns serial, brand, article, state, since, price (training also: store).
--             Anything else is the usual order: brand, reference, serial. Pieces without the sorted value come last.
--   p.brands  a list of brands (the single p.brand still works); training also p.stores, a list of store codes.
-- stk_base is untouched. stk_rows / stk_train_rows are the one place the filters are applied; p_skip leaves one
-- column's own filter out, which is what the totals (state) and the checklists (their own column) need.

create function public.stk_sort_text(p_col text, p_serial text, p_brand text, p_article text, p_store text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case p_col when 'serial' then p_serial when 'brand' then p_brand when 'article' then p_article when 'store' then p_store end;
$$;
-- States sort in the order the page lists them, not by their keys.
create function public.stk_sort_num(p_col text, p_state text, p_price numeric, p_since timestamptz) returns numeric
language sql immutable set search_path = public, pg_temp as $$
  select case p_col
    when 'state' then array_position(array['in_stock','reserved','booked_out','in_transit','in_transfer','damaged','not_received','sold'], p_state)::numeric
    when 'price' then p_price
    when 'since' then extract(epoch from p_since)::numeric end;
$$;
revoke execute on function public.stk_sort_text(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.stk_sort_num(text, text, numeric, timestamptz) from public, anon, authenticated;

create function public.stk_rows(p jsonb, p_skip text default null) returns setof public.stk_row
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_skip   text := coalesce(p_skip, '');
  v_brands text[] := case when jsonb_typeof(p->'brands') = 'array' and jsonb_array_length(p->'brands') > 0
                          then array(select jsonb_array_elements_text(p->'brands')) end;
  v_states text[] := case when jsonb_typeof(p->'states') = 'array' then array(select jsonb_array_elements_text(p->'states')) end;
begin
  return query
  select b.* from stk_base(case when v_skip = 'brand' then p - 'brand' else p end) b
   where (v_skip = 'brand' or v_brands is null or b.brand = any(v_brands))
     and (v_skip = 'state' or v_states is null or b.state = any(v_states));
end $$;
revoke execute on function public.stk_rows(jsonb, text) from public, anon, authenticated;

create or replace function public.stk_piece_list(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_page   int := greatest(coalesce(nullif(p->>'page', '')::int, 1), 1);
  v_col    text := split_part(coalesce(p->>'sort', ''), '.', 1);
  v_dir    text := case when split_part(coalesce(p->>'sort', ''), '.', 2) = 'desc' then 'desc' else 'asc' end;
  v_count  int;
  v_rows   jsonb;
  v_totals jsonb;
begin
  if v_col not in ('serial', 'brand', 'article', 'state', 'since', 'price') then v_col := null; end if;
  select count(*) into v_count from stk_rows(p) b;
  select coalesce(jsonb_agg(r.j order by r.rn), '[]'::jsonb) into v_rows
    from (select stk_row_json(b) j, row_number() over (order by
                   case when v_dir = 'asc'  then stk_sort_text(v_col, b.serial, b.brand, b.article, null) end asc nulls last,
                   case when v_dir = 'desc' then stk_sort_text(v_col, b.serial, b.brand, b.article, null) end desc nulls last,
                   case when v_dir = 'asc'  then stk_sort_num(v_col, b.state, b.price_uzs, b.state_since) end asc nulls last,
                   case when v_dir = 'desc' then stk_sort_num(v_col, b.state, b.price_uzs, b.state_since) end desc nulls last,
                   b.brand, b.article nulls last, b.serial) rn
            from stk_rows(p) b
           order by rn limit 50 offset (v_page - 1) * 50) r;
  select coalesce(jsonb_agg(jsonb_build_object('state', t.state, 'pieces', t.pieces, 'value', t.value, 'unpriced', t.unpriced)
                            order by t.state), '[]'::jsonb) into v_totals
    from (select b.state, count(*) pieces, coalesce(sum(b.price_uzs), 0) value,
                 count(*) filter (where b.price_uzs is null) unpriced
            from stk_rows(p, 'state') b group by b.state) t;
  return jsonb_build_object('count', v_count, 'page', v_page, 'page_size', 50, 'rows', v_rows, 'totals', v_totals);
end $$;
revoke execute on function public.stk_piece_list(jsonb) from public, anon, authenticated;

create or replace function public.stk_export(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_col    text := split_part(coalesce(p->>'sort', ''), '.', 1);
  v_dir    text := case when split_part(coalesce(p->>'sort', ''), '.', 2) = 'desc' then 'desc' else 'asc' end;
  v_count  int;
begin
  if v_col not in ('serial', 'brand', 'article', 'state', 'since', 'price') then v_col := null; end if;
  select count(*) into v_count from stk_rows(p) b;
  if v_count > 5000 then
    raise exception 'too many rows to export (%); narrow the filters', v_count;
  end if;
  return coalesce((select jsonb_agg(r.j order by r.rn)
                     from (select stk_row_json(b) j, row_number() over (order by
                                    case when v_dir = 'asc'  then stk_sort_text(v_col, b.serial, b.brand, b.article, null) end asc nulls last,
                                    case when v_dir = 'desc' then stk_sort_text(v_col, b.serial, b.brand, b.article, null) end desc nulls last,
                                    case when v_dir = 'asc'  then stk_sort_num(v_col, b.state, b.price_uzs, b.state_since) end asc nulls last,
                                    case when v_dir = 'desc' then stk_sort_num(v_col, b.state, b.price_uzs, b.state_since) end desc nulls last,
                                    b.brand, b.article nulls last, b.serial) rn
                             from stk_rows(p) b) r),
                  '[]'::jsonb);
end $$;
revoke execute on function public.stk_export(jsonb) from public, anon, authenticated;

-- The values of one column among the pieces the other filters leave, with how many pieces each has.
create function public.stk_facet_values(p jsonb, p_col text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_col = 'brand' then
    return coalesce((select jsonb_agg(jsonb_build_object('value', t.brand, 'count', t.n) order by t.brand)
                       from (select b.brand, count(*) n from stk_rows(p, 'brand') b where b.brand is not null group by b.brand) t), '[]'::jsonb);
  elsif p_col = 'state' then
    return coalesce((select jsonb_agg(jsonb_build_object('value', t.state, 'count', t.n) order by stk_sort_num('state', t.state, null, null))
                       from (select b.state, count(*) n from stk_rows(p, 'state') b group by b.state) t), '[]'::jsonb);
  end if;
  raise exception 'That column has no checklist.';
end $$;
revoke execute on function public.stk_facet_values(jsonb, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ training
create function public.stk_train_rows(p jsonb, p_skip text default null)
returns table (piece_id uuid, serial text, barcode text, brand text, article text, collection text, model_name text, colour text, size text,
               category text, state text, state_since timestamptz, price_uzs numeric, store text, store_code text, to_store text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_skip   text := coalesce(p_skip, '');
  v_q      text := btrim(coalesce(p->>'q', ''));
  v_words  text[];
  v_brand  text := nullif(btrim(coalesce(p->>'brand', '')), '');
  v_brands text[] := case when jsonb_typeof(p->'brands') = 'array' and jsonb_array_length(p->'brands') > 0
                          then array(select jsonb_array_elements_text(p->'brands')) end;
  v_cat    text := nullif(btrim(coalesce(p->>'category', '')), '');
  v_store  text := nullif(upper(btrim(coalesce(p->>'store', ''))), '');
  v_stores text[] := case when jsonb_typeof(p->'stores') = 'array' and jsonb_array_length(p->'stores') > 0
                          then array(select upper(x) from jsonb_array_elements_text(p->'stores') x) end;
  v_min    numeric := nullif(btrim(coalesce(p->>'price_min', '')), '')::numeric;
  v_max    numeric := nullif(btrim(coalesce(p->>'price_max', '')), '')::numeric;
  v_states text[] := case when jsonb_typeof(p->'states') = 'array' then array(select jsonb_array_elements_text(p->'states')) end;
begin
  if v_q <> '' then
    select array_agg('%' || regexp_replace(w, '([\\%_])', '\\\1', 'g') || '%') into v_words
      from regexp_split_to_table(v_q, '\s+') w where w <> '';
  end if;
  return query
  select t.piece_id, t.serial, t.barcode, t.brand, t.article, t.collection, t.model_name, t.colour, t.size, t.category, t.state, t.state_since,
         t.price_uzs::numeric, s.name, s.code, d.name
    from stk_train_pieces t
    join stk_train_stores s on s.store_id = t.store_id
    left join stk_train_stores d on d.store_id = t.to_store_id
   where (v_words is null or not exists (
            select 1 from unnest(v_words) w
             where not (t.serial ilike w escape '\' or coalesce(t.barcode ilike w escape '\', false)
                        or coalesce(t.article ilike w escape '\', false) or t.brand ilike w escape '\'
                        or coalesce(t.collection ilike w escape '\', false) or coalesce(t.model_name ilike w escape '\', false))))
     and (v_skip = 'brand' or ((v_brand is null or t.brand = v_brand) and (v_brands is null or t.brand = any(v_brands))))
     and (v_cat is null or t.category = v_cat)
     and (v_skip = 'store' or ((v_store is null or s.code = v_store) and (v_stores is null or s.code = any(v_stores))))
     and (v_min is null or t.price_uzs >= v_min) and (v_max is null or t.price_uzs <= v_max)
     and (v_skip = 'state' or v_states is null or t.state = any(v_states));
end $$;
revoke execute on function public.stk_train_rows(jsonb, text) from public, anon, authenticated;

create or replace function public.stk_train_list(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_page   int := greatest(coalesce(nullif(p->>'page', '')::int, 1), 1);
  v_col    text := split_part(coalesce(p->>'sort', ''), '.', 1);
  v_dir    text := case when split_part(coalesce(p->>'sort', ''), '.', 2) = 'desc' then 'desc' else 'asc' end;
  v_count  int; v_rows jsonb; v_totals jsonb;
begin
  if v_col not in ('serial', 'brand', 'article', 'state', 'since', 'price', 'store') then v_col := null; end if;
  select count(*) into v_count from stk_train_rows(p) b;
  select coalesce(jsonb_agg(r.j order by r.rn), '[]'::jsonb) into v_rows
    from (select jsonb_build_object('piece_id', b.piece_id, 'serial', b.serial, 'barcode', b.barcode, 'brand', b.brand,
                   'article', b.article, 'collection', b.collection, 'model_name', b.model_name, 'colour', b.colour, 'size', b.size,
                   'category', b.category, 'state', b.state, 'state_since', b.state_since, 'price_uzs', b.price_uzs,
                   'store', b.store, 'store_code', b.store_code, 'to_store', b.to_store) j,
                 row_number() over (order by
                   case when v_dir = 'asc'  then stk_sort_text(v_col, b.serial, b.brand, b.article, b.store_code) end asc nulls last,
                   case when v_dir = 'desc' then stk_sort_text(v_col, b.serial, b.brand, b.article, b.store_code) end desc nulls last,
                   case when v_dir = 'asc'  then stk_sort_num(v_col, b.state, b.price_uzs, b.state_since) end asc nulls last,
                   case when v_dir = 'desc' then stk_sort_num(v_col, b.state, b.price_uzs, b.state_since) end desc nulls last,
                   b.brand, b.article nulls last, b.serial) rn
            from stk_train_rows(p) b
           order by rn limit 50 offset (v_page - 1) * 50) r;
  select coalesce(jsonb_agg(jsonb_build_object('state', t.state, 'pieces', t.pieces, 'value', t.value, 'unpriced', t.unpriced)
                            order by t.state), '[]'::jsonb) into v_totals
    from (select b.state, count(*) pieces, coalesce(sum(b.price_uzs), 0) value, count(*) filter (where b.price_uzs is null) unpriced
            from stk_train_rows(p, 'state') b group by b.state) t;
  return jsonb_build_object('count', v_count, 'page', v_page, 'page_size', 50, 'rows', v_rows, 'totals', v_totals);
end $$;
revoke execute on function public.stk_train_list(jsonb) from public, anon, authenticated;

create function public.stk_train_facet_values(p jsonb, p_col text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_col = 'brand' then
    return coalesce((select jsonb_agg(jsonb_build_object('value', t.brand, 'count', t.n) order by t.brand)
                       from (select b.brand, count(*) n from stk_train_rows(p, 'brand') b group by b.brand) t), '[]'::jsonb);
  elsif p_col = 'state' then
    return coalesce((select jsonb_agg(jsonb_build_object('value', t.state, 'count', t.n) order by stk_sort_num('state', t.state, null, null))
                       from (select b.state, count(*) n from stk_train_rows(p, 'state') b group by b.state) t), '[]'::jsonb);
  elsif p_col = 'store' then
    return coalesce((select jsonb_agg(jsonb_build_object('value', t.store_code, 'label', t.store, 'count', t.n) order by t.store_code)
                       from (select b.store_code, b.store, count(*) n from stk_train_rows(p, 'store') b group by b.store_code, b.store) t), '[]'::jsonb);
  end if;
  raise exception 'That column has no checklist.';
end $$;
revoke execute on function public.stk_train_facet_values(jsonb, text) from public, anon, authenticated;
