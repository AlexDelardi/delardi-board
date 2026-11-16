-- POS 7 (16 Nov 2026): the receipt in English or Russian.
-- 1. pos_settings.shop_address_ru: the shop address as printed on Russian receipts.
-- 2. pos_key_label_ru: Russian words for the catalogue's category and metal keys
--    (falls back to the English label for a key it does not know).
-- 3. pos_receipt_text(ticket, lang): 'ru' prints every fixed word in Russian; anything
--    else prints English. The one-argument call still means English, so pos_post_sale
--    keeps storing the English copy exactly as before; the till asks for the language
--    it shows when it displays or reprints a receipt.

alter table public.pos_settings add column if not exists shop_address_ru text;
update public.pos_settings set shop_address_ru = 'Узбекистан, Ташкент, ул. Бухара, 26 · +998 95 145 08 88'
 where id = 1 and shop_address_ru is null;

create or replace function public.pos_key_label_ru(p text) returns text
language sql immutable security definer set search_path = public, pg_temp as $$
  select case lower(btrim(coalesce(p, '')))
    when '' then null
    when 'ring' then 'Кольцо'
    when 'watch' then 'Часы'
    when 'necklace' then 'Колье'
    when 'earrings' then 'Серьги'
    when 'bracelet' then 'Браслет'
    when 'strap' then 'Ремешок'
    when 'clasp' then 'Застёжка'
    when 'bracelet_element' then 'Элемент браслета'
    when 'cufflinks' then 'Запонки'
    when 'pendant' then 'Подвеска'
    when 'brooch' then 'Брошь'
    when 'white_gold' then 'Белое золото'
    when 'rose_gold' then 'Розовое золото'
    when 'yellow_gold' then 'Жёлтое золото'
    when 'gold' then 'Золото'
    when 'steel' then 'Сталь'
    when 'rubber' then 'Каучук'
    when 'leather' then 'Кожа'
    when 'titanium' then 'Титан'
    when 'ceramic' then 'Керамика'
    when 'silver' then 'Серебро'
    when 'aluminium' then 'Алюминий'
    when 'carbon' then 'Карбон'
    when 'platinum' then 'Платина'
    else pos_key_label(p) end
$$;
revoke execute on function public.pos_key_label_ru(text) from public, anon, authenticated;

drop function if exists public.pos_receipt_text(uuid);
create or replace function public.pos_receipt_text(p_ticket uuid, p_lang text default 'en') returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t ops_tickets%rowtype; v text[] := '{}'; r record; v_total numeric; ru boolean := (p_lang = 'ru');
begin
  select * into t from ops_tickets where ticket_id = p_ticket;
  if not found then raise exception 'ticket % not found', p_ticket; end if;
  if t.source = 'training' then
    v := array_append(v, case when ru then 'УЧЕБНЫЙ ЧЕК — НЕ ПРОДАЖА' else 'TRAINING — NOT A SALE' end);
  end if;
  v := array_append(v, 'DELARDI'::text);
  v := array_append(v, coalesce((select case when ru then coalesce(nullif(btrim(shop_address_ru), ''), shop_address)
                                             else shop_address end from pos_settings where id = 1), ''));
  v := array_append(v, format(case when ru then 'Чек %s · %s' else 'Ticket %s · %s' end, t.ticket_no,
                              to_char(t.loaded_at at time zone 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI')));
  v := array_append(v, (case when ru then 'Продавец: ' else 'Seller: ' end)
                       || coalesce((select label from crm_sales_reps where source_name = t.seller), ''));
  v := array_append(v, (case when ru then 'Клиент: ' else 'Client: ' end)
                       || case when t.client_id is null then (case when ru then 'Без карты клиента' else 'Walk-in' end)
                               else coalesce((select display_name from crm_queue where client_id = t.client_id), t.client_id) end);
  for r in select l.*, m.retail_category,
                  (select string_agg(case when ru then pos_key_label_ru(k) else pos_key_label(k) end, ', ')
                     from unnest(m.metal_keys) k) metals
             from ops_ticket_lines l left join cat_models m on m.model_id = l.model_id
            where l.ticket_id = p_ticket order by l.line_no loop
    v := array_append(v, coalesce(nullif(concat_ws(' · ', r.brand_raw, r.item_name), ''), '—'));
    v := array_append(v, concat_ws(' · ', (case when ru then 'Арт. ' else 'Ref. ' end) || coalesce(nullif(btrim(r.article), ''), '—'),
                                   case when ru then pos_key_label_ru(r.retail_category) else pos_key_label(r.retail_category) end,
                                   nullif(r.metals, ''),
                                   (case when ru then 'Размер ' else 'Size ' end) || nullif(btrim(r.size), '')));
    if nullif(btrim(r.serial_raw), '') is not null then
      v := array_append(v, (case when ru then 'С/Н ' else 'S/N ' end) || btrim(r.serial_raw));
    end if;
    v := array_append(v, format('%s −%s%% = %s', pos_fmt_uzs(r.price_current), trim_scale(coalesce(r.discount_pct, 0)),
                     pos_fmt_uzs(r.net)));
  end loop;
  select coalesce(sum(net), 0) into v_total from ops_ticket_lines where ticket_id = p_ticket;
  v := array_append(v, (case when ru then 'Итого ' else 'Total ' end) || pos_fmt_uzs(v_total));
  for r in select * from ops_ticket_payments where ticket_id = p_ticket order by payment_id loop
    v := array_append(v, (case when r.method = 'cash' then (case when ru then 'Наличные' else 'Cash' end)
                    when r.method = 'transfer' then (case when ru then 'Перевод' else 'Transfer' end)
                    when r.card_type = 'uzcard' then 'Uzcard' when r.card_type = 'humo' then 'Humo'
                    when r.card_type = 'visa' or r.method = 'visa' then 'Visa' else initcap(r.method) end
               || ' ' || pos_fmt_uzs(r.amount)));
  end loop;
  return array_to_string(v, E'\n');
end $$;
revoke execute on function public.pos_receipt_text(uuid, text) from public, anon, authenticated;
