-- POS fix 1 (16 Nov 2026, after Alex's first training sale):
-- 1. pos_search_pieces: a piece whose catalogue field was empty (null collection, model name or article) matched every
--    word search, because `null ilike w` is null and `not (… or null)` never excluded it. Every field is now coalesced,
--    and the English and Russian catalogue names are searched too. Test: db/tests/pos_t7_search_receipt.sql.
-- 2. pos_receipt_text: each item shows brand · model name, then "Ref. <article> · <category> · <metal> · Size <size>"
--    (empty parts left out) and "S/N <serial>", then the price line. Tickets posted before keep the receipt they got.

create or replace function public.pos_search_pieces(p_q text, p_mode text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_q    text := btrim(coalesce(p_q, ''));
  v_mode text := coalesce(p_mode, (select mode from pos_settings where id = 1));
  v_ids  uuid[];
  v_words text[];
begin
  if v_q = '' then return '[]'::jsonb; end if;
  if v_mode not in ('training', 'live') then raise exception 'mode must be training or live'; end if;

  select array_agg(piece_id) into v_ids from ops_pieces where barcode = v_q;
  if v_ids is null then
    select array_agg(piece_id) into v_ids from ops_pieces
     where upper(regexp_replace(serial, '\s', '', 'g')) = upper(regexp_replace(v_q, '\s', '', 'g'));
  end if;
  if v_ids is null then
    -- each word with \ % _ escaped, so it matches literally; every word must be found in one of the fields
    select array_agg('%' || regexp_replace(w, '([\\%_])', '\\\1', 'g') || '%') into v_words
      from regexp_split_to_table(v_q, '\s+') w where w <> '';
    select array_agg(o.piece_id) into v_ids
      from ops_pieces o
      left join cat_models m on m.model_id = o.model_id
     where not exists (select 1 from unnest(v_words) w
                        where not (coalesce(o.serial, '') ilike w escape '\'
                                   or coalesce(o.article, m.article, '') ilike w escape '\'
                                   or coalesce(o.brand, '') ilike w escape '\'
                                   or coalesce(m.collection, '') ilike w escape '\'
                                   or coalesce(m.model_name, '') ilike w escape '\'
                                   or coalesce(m.name_en, '') ilike w escape '\'
                                   or coalesce(m.name_ru, '') ilike w escape '\'));
  end if;
  if v_ids is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(x.j order by x.sellable desc, x.brand, x.article nulls last, x.serial)
      from (select r.*, jsonb_build_object(
                     'piece_id', r.piece_id, 'serial', r.serial, 'barcode', r.barcode, 'brand', r.brand,
                     'article', r.article, 'collection', r.collection, 'model_name', r.model_name,
                     'colour', r.colour, 'size', r.size, 'metal_keys', to_jsonb(r.metal_keys),
                     'stone_keys', to_jsonb(r.stone_keys), 'price_uzs', r.price_uzs, 'state', r.state,
                     'held', case when r.held_by is not null then jsonb_build_object('draft_id', r.held_by) end,
                     'sellable', r.sellable) j
              from (select o.piece_id, o.serial, o.barcode, o.brand, coalesce(o.article, m.article) article,
                           m.collection, m.model_name, v.colour_code colour, o.size,
                           coalesce(m.metal_keys, '{}') metal_keys, coalesce(m.stone_keys, '{}') stone_keys,
                           (select cp.price_uzs from cat_pieces cp
                             where cp.variant_id = o.variant_id and upper(btrim(cp.serial)) = upper(btrim(o.serial))
                             order by cp.id desc limit 1) price_uzs,
                           o.state, h.draft_id held_by,
                           (o.state = 'in_stock' and h.draft_id is null) sellable
                      from ops_pieces o
                      left join cat_models m on m.model_id = o.model_id
                      left join cat_variants v on v.variant_id = o.variant_id
                      left join pos_draft_lines h on h.piece_id = o.piece_id and h.mode = v_mode
                     where o.piece_id = any(v_ids)
                     order by (o.state = 'in_stock' and h.draft_id is null) desc, o.brand,
                              coalesce(o.article, m.article) nulls last, o.serial
                     limit 20) r) x), '[]'::jsonb);
end $$;
revoke execute on function public.pos_search_pieces(text, text) from public, anon, authenticated;

-- 'white_gold' → 'White gold'
create function public.pos_key_label(p text) returns text
language sql immutable security definer set search_path = public, pg_temp as $$
  select case when nullif(btrim(p), '') is null then null
              else upper(left(replace(btrim(p), '_', ' '), 1)) || lower(substr(replace(btrim(p), '_', ' '), 2)) end
$$;
revoke execute on function public.pos_key_label(text) from public, anon, authenticated;

create or replace function public.pos_receipt_text(p_ticket uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t ops_tickets%rowtype; v text[] := '{}'; r record; v_total numeric;
begin
  select * into t from ops_tickets where ticket_id = p_ticket;
  if not found then raise exception 'ticket % not found', p_ticket; end if;
  if t.source = 'training' then v := array_append(v, 'TRAINING — NOT A SALE'::text); end if;
  v := array_append(v, 'DELARDI'::text);
  v := array_append(v, coalesce((select shop_address from pos_settings where id = 1), ''));
  v := array_append(v, format('Ticket %s · %s', t.ticket_no, to_char(t.loaded_at at time zone 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI')));
  v := array_append(v, ('Seller: ' || coalesce((select label from crm_sales_reps where source_name = t.seller), '')));
  v := array_append(v, ('Client: ' || case when t.client_id is null then 'Walk-in'
                                else coalesce((select display_name from crm_queue where client_id = t.client_id), t.client_id) end));
  for r in select l.*, m.retail_category,
                  (select string_agg(pos_key_label(k), ', ') from unnest(m.metal_keys) k) metals
             from ops_ticket_lines l left join cat_models m on m.model_id = l.model_id
            where l.ticket_id = p_ticket order by l.line_no loop
    v := array_append(v, coalesce(nullif(concat_ws(' · ', r.brand_raw, r.item_name), ''), '—'));
    v := array_append(v, concat_ws(' · ', 'Ref. ' || coalesce(nullif(btrim(r.article), ''), '—'),
                                   pos_key_label(r.retail_category), nullif(r.metals, ''),
                                   'Size ' || nullif(btrim(r.size), '')));
    if nullif(btrim(r.serial_raw), '') is not null then v := array_append(v, 'S/N ' || btrim(r.serial_raw)); end if;
    v := array_append(v, format('%s −%s%% = %s', pos_fmt_uzs(r.price_current), trim_scale(coalesce(r.discount_pct, 0)),
                     pos_fmt_uzs(r.net)));
  end loop;
  select coalesce(sum(net), 0) into v_total from ops_ticket_lines where ticket_id = p_ticket;
  v := array_append(v, ('Total ' || pos_fmt_uzs(v_total)));
  for r in select * from ops_ticket_payments where ticket_id = p_ticket order by payment_id loop
    v := array_append(v, (case when r.method = 'cash' then 'Cash' when r.method = 'transfer' then 'Transfer'
                    when r.card_type = 'uzcard' then 'Uzcard' when r.card_type = 'humo' then 'Humo'
                    when r.card_type = 'visa' or r.method = 'visa' then 'Visa' else initcap(r.method) end
               || ' ' || pos_fmt_uzs(r.amount)));
  end loop;
  return array_to_string(v, E'\n');
end $$;
revoke execute on function public.pos_receipt_text(uuid) from public, anon, authenticated;
