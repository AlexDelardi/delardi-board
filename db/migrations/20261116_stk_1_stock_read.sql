-- Stock tool v1, task 1: the view-stock right and the read functions behind the stock page.
-- Nothing here is reachable from the API roles; the stock-api edge function (service role) is the only caller.
-- No function selects a cost, purchase price, landed price or margin. The retail price is the latest cat_pieces price
-- for the piece's variant and serial, exactly as pos_search_pieces derives it. Writes stay in ops_set_state and
-- ops_resolve_review (unchanged).

-- Rights: Alex views stock; a stock session carries can_use_stock.
alter table public.board_users add column can_view_stock boolean not null default false;
update public.board_users set can_view_stock = true where name = 'Alex';
alter table public.editor_sessions add column can_use_stock boolean not null default false;

create or replace function public.ops_has_right(p_actor text, p_right text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case p_right when 'manage_stock' then u.can_manage_stock
                        when 'view_stock' then u.can_view_stock
                        else false end
      from board_users u
     where u.name = p_actor and u.active
     limit 1), false);
$$;
revoke execute on function public.ops_has_right(text, text) from public, anon, authenticated;

-- Internal: every piece that matches the filters except `states` (the totals cards need all states), with its row fields.
create type public.stk_row as (
  piece_id uuid, serial text, barcode text, brand text, article text, collection text, model_name text,
  colour text, size text, category text, state text, state_since timestamptz, price_uzs numeric);

create function public.stk_base(p jsonb) returns setof public.stk_row
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_q     text := btrim(coalesce(p->>'q', ''));
  v_words text[];
  v_brand text := nullif(btrim(coalesce(p->>'brand', '')), '');
  v_cat   text := nullif(btrim(coalesce(p->>'category', '')), '');
  v_min   numeric := nullif(btrim(coalesce(p->>'price_min', '')), '')::numeric;
  v_max   numeric := nullif(btrim(coalesce(p->>'price_max', '')), '')::numeric;
begin
  if v_q <> '' then
    -- each word with \ % _ escaped, so it matches literally; every word must match somewhere
    select array_agg('%' || regexp_replace(w, '([\\%_])', '\\\1', 'g') || '%') into v_words
      from regexp_split_to_table(v_q, '\s+') w where w <> '';
  end if;
  return query
  select x.* from (
    select o.piece_id, o.serial, o.barcode, o.brand, coalesce(o.article, m.article) article, m.collection, m.model_name,
           v.colour_code colour, o.size, m.retail_category category, o.state, o.state_since,
           (select cp.price_uzs::numeric from cat_pieces cp
             where cp.variant_id = o.variant_id and upper(btrim(cp.serial)) = upper(btrim(o.serial))
             order by cp.id desc limit 1) price_uzs
      from ops_pieces o
      left join cat_models m on m.model_id = o.model_id
      left join cat_variants v on v.variant_id = o.variant_id
     where (v_words is null or not exists (
              select 1 from unnest(v_words) w
               where not (coalesce(o.serial ilike w escape '\', false) or coalesce(o.barcode ilike w escape '\', false)
                          or coalesce(coalesce(o.article, m.article) ilike w escape '\', false)
                          or coalesce(o.brand ilike w escape '\', false) or coalesce(m.collection ilike w escape '\', false)
                          or coalesce(m.model_name ilike w escape '\', false))))
       and (v_brand is null or o.brand = v_brand)
       and (v_cat is null or m.retail_category = v_cat)
  ) x
  where (v_min is null or x.price_uzs >= v_min) and (v_max is null or x.price_uzs <= v_max);
end $$;
revoke execute on function public.stk_base(jsonb) from public, anon, authenticated;

create function public.stk_row_json(r public.stk_row) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('piece_id', r.piece_id, 'serial', r.serial, 'barcode', r.barcode, 'brand', r.brand,
           'article', r.article, 'collection', r.collection, 'model_name', r.model_name, 'colour', r.colour,
           'size', r.size, 'category', r.category, 'state', r.state, 'state_since', r.state_since,
           'price_uzs', r.price_uzs);
$$;
revoke execute on function public.stk_row_json(public.stk_row) from public, anon, authenticated;

-- One page of the filtered list, plus totals by state over the whole filtered set (ignoring states and page).
create function public.stk_piece_list(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_states text[] := case when jsonb_typeof(p->'states') = 'array'
                          then array(select jsonb_array_elements_text(p->'states')) end;
  v_page   int := greatest(coalesce(nullif(p->>'page', '')::int, 1), 1);
  v_count  int;
  v_rows   jsonb;
  v_totals jsonb;
begin
  select count(*) into v_count from stk_base(p) b where v_states is null or b.state = any(v_states);
  select coalesce(jsonb_agg(stk_row_json(r) order by r.brand, r.article nulls last, r.serial), '[]'::jsonb) into v_rows
    from (select b.* from stk_base(p) b where v_states is null or b.state = any(v_states)
           order by b.brand, b.article nulls last, b.serial
           limit 50 offset (v_page - 1) * 50) r;
  select coalesce(jsonb_agg(jsonb_build_object('state', t.state, 'pieces', t.pieces, 'value', t.value, 'unpriced', t.unpriced)
                            order by t.state), '[]'::jsonb) into v_totals
    from (select b.state, count(*) pieces, coalesce(sum(b.price_uzs), 0) value,
                 count(*) filter (where b.price_uzs is null) unpriced
            from stk_base(p) b group by b.state) t;
  return jsonb_build_object('count', v_count, 'page', v_page, 'page_size', 50, 'rows', v_rows, 'totals', v_totals);
end $$;
revoke execute on function public.stk_piece_list(jsonb) from public, anon, authenticated;

-- One piece with its history, review items and sales (training tickets included, marked by source). Null for an unknown piece.
create function public.stk_piece_detail(p_piece uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare o ops_pieces%rowtype; b stk_row; m cat_models%rowtype; v_client text;
begin
  select * into o from ops_pieces where piece_id = p_piece;
  if not found then return null; end if;
  select * into b from stk_base('{}'::jsonb) x where x.piece_id = p_piece;
  select * into m from cat_models where model_id = o.model_id;
  select q.display_name into v_client from crm_queue q where q.client_id = o.hold_client_id;
  return jsonb_build_object(
    'piece', stk_row_json(b) || jsonb_build_object('hold_client_id', o.hold_client_id, 'hold_until', o.hold_until,
               'state_note', o.state_note, 'shipped_on', o.shipped_on, 'first_seen_at', o.first_seen_at),
    'model', jsonb_build_object('metal_keys', to_jsonb(m.metal_keys), 'stone_keys', to_jsonb(m.stone_keys),
               'gender', m.gender, 'subcategory', m.subcategory),
    'client_name', v_client,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('at', e.at, 'from_state', e.from_state, 'to_state', e.to_state,
                'reason', e.reason, 'ref_kind', e.ref_kind, 'ref_id', e.ref_id, 'actor', e.actor, 'note', e.note,
                'ticket_id', t.ticket_id, 'ticket_no', t.ticket_no) order by e.at desc, e.event_id desc)
        from ops_piece_events e
        left join ops_ticket_lines l on e.ref_kind = 'ticket_line' and l.line_id::text = e.ref_id
        left join ops_tickets t on t.ticket_id = l.ticket_id
       where e.piece_id = p_piece), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object('review_id', r.review_id, 'kind', r.kind, 'status', r.status,
                'raised_at', r.raised_at, 'resolution', r.resolution, 'resolved_by', r.resolved_by,
                'resolved_at', r.resolved_at, 'note', r.note) order by r.raised_at desc, r.review_id desc)
        from ops_review r where r.piece_id = p_piece), '[]'::jsonb),
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object('ticket_id', t.ticket_id, 'ticket_no', t.ticket_no, 'source', t.source,
                'sold_at', t.sold_at, 'kind', l.kind, 'net', l.net, 'status', t.status)
                order by t.sold_at desc, t.ticket_no desc, l.line_no)
        from ops_ticket_lines l join ops_tickets t on t.ticket_id = l.ticket_id
       where l.piece_id = p_piece), '[]'::jsonb));
end $$;
revoke execute on function public.stk_piece_detail(uuid) from public, anon, authenticated;

-- Open review items, oldest first.
create function public.stk_review_list() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('review_id', r.review_id, 'kind', r.kind, 'raised_at', r.raised_at,
           'note', r.note, 'piece', jsonb_build_object('piece_id', o.piece_id, 'serial', o.serial, 'brand', o.brand,
             'article', coalesce(o.article, m.article), 'model_name', m.model_name, 'state', o.state))
           order by r.raised_at, r.review_id), '[]'::jsonb)
    from ops_review r
    join ops_pieces o on o.piece_id = r.piece_id
    left join cat_models m on m.model_id = o.model_id
   where r.status = 'open';
$$;
revoke execute on function public.stk_review_list() from public, anon, authenticated;

-- Distinct brands and categories present on pieces, sorted.
create function public.stk_facets() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'brands', coalesce((select jsonb_agg(b order by b) from (select distinct brand b from ops_pieces) s), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(c order by c) from (
        select distinct m.retail_category c from ops_pieces o join cat_models m on m.model_id = o.model_id
         where m.retail_category is not null) s), '[]'::jsonb));
$$;
revoke execute on function public.stk_facets() from public, anon, authenticated;

-- The rows of stk_piece_list for the same filters, every page, at most 5 000.
create function public.stk_export(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_states text[] := case when jsonb_typeof(p->'states') = 'array'
                          then array(select jsonb_array_elements_text(p->'states')) end;
  v_count  int;
begin
  select count(*) into v_count from stk_base(p) b where v_states is null or b.state = any(v_states);
  if v_count > 5000 then
    raise exception 'too many rows to export (%); narrow the filters', v_count;
  end if;
  return coalesce((select jsonb_agg(stk_row_json(r) order by r.brand, r.article nulls last, r.serial)
                     from (select b.* from stk_base(p) b where v_states is null or b.state = any(v_states)) r),
                  '[]'::jsonb);
end $$;
revoke execute on function public.stk_export(jsonb) from public, anon, authenticated;
