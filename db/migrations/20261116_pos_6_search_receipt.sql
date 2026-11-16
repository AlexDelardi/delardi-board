-- POS fix 1 (16 Nov 2026, after Alex's first training sale):
-- 1. pos_search_pieces: a piece whose catalogue field was empty (null collection, model name or article) matched every
--    word search, because `null ilike w` is null and `not (… or null)` never excluded it. Every field is now coalesced,
--    and the English and Russian catalogue names are searched too. Test: db/tests/pos_t7_search_receipt.sql.
-- 2. pos_receipt_text: each item shows brand · model name, then "Ref. <article> · <category> · <metal> · Size <size>"
--    (empty parts left out) and "S/N <serial>", then the price line. Tickets posted before keep the receipt they got.
-- 3, 4: from the Codex review of PR #5, below.

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

-- 3. (Codex review, PR #5) one suspended sale per mode, enforced by the database.
create unique index pos_drafts_one_per_mode on public.pos_drafts (mode);

-- 4. (Codex review, PR #5) pos_post_sale: a prospect becomes a client with its first live purchase.
--    pos_suspend: a concurrent second suspend gets the same sentence as the check, not a server error.
create or replace function public.pos_post_sale(p jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_mode     text;
  v_dmode    text;
  v_notice   bigint;
  v_lines    jsonb := case when jsonb_typeof(p->'lines') = 'array' then p->'lines' else '[]'::jsonb end;
  v_pays     jsonb := case when jsonb_typeof(p->'payments') = 'array' then p->'payments' else '[]'::jsonb end;
  v_client   text := nullif(btrim(p->>'client_id'), '');
  v_walk     boolean := coalesce((p->>'walk_in')::boolean, false);
  v_draft    bigint := nullif(btrim(p->>'draft_id'), '')::bigint;
  v_seller   text;
  v_label    text;
  l          jsonb;
  pay        jsonb;
  v_src      text;
  v_line_src text[] := '{}';
  v_price    numeric;
  v_disc     numeric;
  v_net      numeric;
  v_total    numeric := 0;
  v_paid     numeric := 0;
  v_cash     numeric := 0;
  v_amount   numeric;
  v_ct       text;
  pc         record;
  v_held     bigint;
  v_tid      uuid;
  v_tno      text;
  v_line     uuid;
  v_txn      bigint;
  i          int;
  d          record;
begin
  -- shape
  if jsonb_array_length(v_lines) = 0 then raise exception 'no lines'; end if;
  if exists (select 1 from jsonb_array_elements(v_lines) e where nullif(e->>'piece_id', '') is null) then
    raise exception 'no lines: a line has no piece';
  end if;
  if (select count(distinct (e->>'piece_id')::uuid) from jsonb_array_elements(v_lines) e) <> jsonb_array_length(v_lines) then
    raise exception 'piece listed twice';
  end if;
  if (v_client is null and not v_walk) or (v_client is not null and v_walk) then
    raise exception 'choose a client or walk-in';
  end if;
  if v_client is not null and not exists (select 1 from crm_clients where client_id = v_client
                                                                       and record_state not in ('merged', 'deleted')) then
    raise exception 'choose a client or walk-in: client % not found', v_client;
  end if;

  -- sellers: label → source_name, current reps only
  v_label := nullif(btrim(p->>'seller'), '');
  if v_label is null then raise exception 'choose a seller'; end if;
  select min(source_name), count(*) into v_seller, i from crm_sales_reps where label = v_label and active;
  if i <> 1 then raise exception 'choose a seller: % is not a current sales rep', v_label; end if;
  for l in select e from jsonb_array_elements(v_lines) e loop
    v_label := nullif(btrim(l->>'seller'), '');
    if v_label is null then
      v_line_src := v_line_src || v_seller;
    else
      select min(source_name), count(*) into v_src, i from crm_sales_reps where label = v_label and active;
      if i <> 1 then raise exception 'choose a seller: % is not a current sales rep', v_label; end if;
      v_line_src := v_line_src || v_src;
    end if;
  end loop;

  -- prices and discounts
  for l in select e from jsonb_array_elements(v_lines) e loop
    v_disc := coalesce((l->>'discount_pct')::numeric, 0);
    if v_disc < 0 or v_disc > 100 then raise exception 'discount must be 0 to 100'; end if;
    -- the line and CRM columns are numeric(6,4): at most 99.9999, four decimals
    if v_disc >= 100 then raise exception 'discount must be 0 to 100, and below 100 (it cannot be stored)'; end if;
    if v_disc <> round(v_disc, 4) then raise exception 'discount must be 0 to 100 with at most 4 decimals'; end if;
    v_price := (l->>'price_uzs')::numeric;
    if v_price is null or v_price <= 0 then raise exception 'price must be positive'; end if;
    if v_price <> trunc(v_price) then raise exception 'price must be positive whole so''m'; end if;
    v_total := v_total + round(v_price * (1 - v_disc / 100));
  end loop;

  -- mode (held steady against a switch while posting); the screen says which mode it shows, and a till
  -- switched since the page last heard is refused, so a post is never real while the page says training
  select mode, cash_notice_uzs into v_mode, v_notice from pos_settings where id = 1 for share;
  if p ? 'expect_mode' and (p->>'expect_mode') is distinct from v_mode then
    raise exception 'the till was switched to % — reload', v_mode;
  end if;

  -- pieces: locked in piece_id order, then checked
  perform 1 from ops_pieces
   where piece_id in (select (e->>'piece_id')::uuid from jsonb_array_elements(v_lines) e)
   order by piece_id for update;
  -- the suspended sale being posted: locked after the pieces (as pos_suspend does), so a cancel or a
  -- re-suspend from another device waits for this post, and a draft gone or of the other mode is refused
  if v_draft is not null then
    select mode into v_dmode from pos_drafts where draft_id = v_draft for update;
    if not found then raise exception 'suspended sale % no longer exists', v_draft; end if;
    if v_dmode <> v_mode then raise exception 'suspended sale % belongs to the other mode', v_draft; end if;
  end if;
  for pc in select o.piece_id, o.serial, o.state
              from jsonb_array_elements(v_lines) e
              left join ops_pieces o on o.piece_id = (e->>'piece_id')::uuid
             order by (e->>'piece_id')::uuid loop
    if pc.piece_id is null then raise exception 'piece not found'; end if;
    if pc.state <> 'in_stock' then raise exception 'piece % is not in stock', pc.serial; end if;
    select min(draft_id) into v_held from pos_draft_lines
     where mode = v_mode and piece_id = pc.piece_id and draft_id is distinct from v_draft;
    if v_held is not null then raise exception 'piece % is in suspended sale %', pc.serial, v_held; end if;
  end loop;
  if exists (select 1 from pos_drafts where mode = v_mode and draft_id is distinct from v_draft) then
    raise exception 'another sale is suspended';
  end if;

  -- payments
  for pay in select e from jsonb_array_elements(v_pays) e loop
    v_amount := (pay->>'amount')::numeric;
    if coalesce(pay->>'method', '') not in ('cash', 'card', 'transfer') then
      raise exception 'payment method must be cash, card or transfer';
    end if;
    if pay->>'method' = 'card' and coalesce(pay->>'card_type', '') not in ('uzcard', 'humo', 'visa') then
      raise exception 'card payment needs a card type';
    end if;
    if v_amount is null or v_amount <= 0 or v_amount <> trunc(v_amount) then
      raise exception 'payment amount must be a positive whole sum';
    end if;
    v_paid := v_paid + v_amount;
    if pay->>'method' = 'cash' then v_cash := v_cash + v_amount; end if;
  end loop;
  if v_paid <> v_total then raise exception 'payments % do not match total %', v_paid, v_total; end if;

  -- ticket
  v_tno := case when v_mode = 'live' then 'D-' || lpad(nextval('pos_ticket_no_seq')::text, 6, '0')
                else 'T-' || lpad(nextval('pos_training_no_seq')::text, 6, '0') end;
  insert into ops_tickets(store_id, source, ticket_no, sold_at, seller, client_id, walk_in, entered_by, fiscal_ref, status)
  values (1, case when v_mode = 'live' then 'delardi' else 'training' end, v_tno,
          (now() at time zone 'Asia/Tashkent')::date, v_seller, v_client, v_walk, p_actor,
          nullif(btrim(p->>'fiscal_ref'), ''), 'posted')
  returning ticket_id into v_tid;

  -- lines, in the order given
  i := 0;
  for l in select e from jsonb_array_elements(v_lines) e loop
    i := i + 1;
    v_price := (l->>'price_uzs')::numeric;
    v_disc  := coalesce((l->>'discount_pct')::numeric, 0);
    v_net   := round(v_price * (1 - v_disc / 100));
    select o.piece_id, o.serial, o.brand, coalesce(o.article, m.article) article, o.size, o.model_id, o.variant_id,
           v.colour_code, m.model_name, m.category,
           (select cp.price_uzs from cat_pieces cp
             where cp.variant_id = o.variant_id and upper(btrim(cp.serial)) = upper(btrim(o.serial))
             order by cp.id desc limit 1) price_list
      into pc
      from ops_pieces o
      left join cat_models m on m.model_id = o.model_id
      left join cat_variants v on v.variant_id = o.variant_id
     where o.piece_id = (l->>'piece_id')::uuid;
    insert into ops_ticket_lines(ticket_id, line_no, kind, qty, article, colour, item_name, size, model_id, variant_id,
                                 serial_raw, brand_raw, price_list, price_current, discount_pct, discount_amt, net,
                                 extra, piece_id)
    values (v_tid, i, 'sale', 1, pc.article, pc.colour_code, pc.model_name, pc.size, pc.model_id, pc.variant_id,
            pc.serial, pc.brand, pc.price_list, v_price, v_disc, v_price - v_net, v_net,
            case when v_line_src[i] is distinct from v_seller then jsonb_build_object('seller', v_line_src[i]) end,
            case when v_mode = 'live' then pc.piece_id end)
    returning line_id into v_line;

    if v_mode = 'live' then
      perform ops_apply_ticket_line(v_line, p_actor);
      if not exists (select 1 from ops_pieces where piece_id = pc.piece_id and state = 'sold' and sold_line_id = v_line) then
        raise exception 'piece % could not be marked sold', pc.serial;
      end if;
      if v_client is not null then
        insert into crm_transactions(client_id, sold_at, brand, category, item, qty, gross_uzs, discount_pct, net_uzs,
                                     advisor, article, cat_model_id, cat_variant_id, ticket_line_id)
        values (v_client, (now() at time zone 'Asia/Tashkent')::date, pc.brand, pc.category, pc.model_name, 1,
                v_price, v_disc, v_net, v_line_src[i], pc.article, pc.model_id, pc.variant_id, v_line)
        returning id into v_txn;
        -- the insert trigger links by article; the till knows the exact model and variant, so they win
        if pc.model_id is not null then
          select * into d from cat_txn_display(pc.model_id, pc.variant_id, pc.model_name);
          update crm_transactions
             set cat_model_id = pc.model_id, cat_variant_id = coalesce(pc.variant_id, d.variant_id),
                 cat_name_ru = d.name_ru, cat_name_en = d.name_en, cat_thumb_url = d.thumb_url
           where id = v_txn;
        end if;
      end if;
    end if;
  end loop;

  -- payments: a Visa card is stored as method 'visa' (as Colibri does); the card type is kept either way
  for pay in select e from jsonb_array_elements(v_pays) e loop
    v_ct := case when pay->>'method' = 'card' then pay->>'card_type' end;
    insert into ops_ticket_payments(ticket_id, method, amount, raw, card_type)
    values (v_tid, case when v_ct = 'visa' then 'visa' else pay->>'method' end, (pay->>'amount')::numeric,
            case when v_ct = 'visa' then 'visa' else pay->>'method' end, v_ct);
  end loop;

  if v_mode = 'live' and v_client is not null then
    -- a prospect (e.g. added with "+ New" at the till) becomes a client with its first purchase,
    -- as crm_import_apply does for Colibri sales (which the till replaces after go-live)
    update crm_clients set record_type = 'client' where client_id = v_client and record_type = 'prospect';
    if found then
      insert into crm_events (client_id, actor, action, note)
      values (v_client, coalesce(nullif(btrim(p_actor), ''), 'unknown'), 'became_client',
              'First purchase at the till, ticket ' || v_tno || '.');
    end if;
    perform crm_recompute_purchases(array[v_client]);
  end if;

  update ops_tickets set receipt_text = pos_receipt_text(v_tid) where ticket_id = v_tid;
  if v_draft is not null then
    delete from pos_drafts where draft_id = v_draft and mode = v_mode;
    insert into pos_settings_log(actor, field, new_value)
    values (coalesce(nullif(btrim(p_actor), ''), 'unknown'), 'draft_posted', v_draft || ' → ' || v_tno);
  end if;

  return jsonb_build_object('ticket_id', v_tid, 'ticket_no', v_tno, 'mode', v_mode, 'total', v_total,
                            'cash_notice', v_cash > v_notice);
end $$;
revoke execute on function public.pos_post_sale(jsonb, text) from public, anon, authenticated;

create or replace function public.pos_suspend(p jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_mode   text;
  v_lines  jsonb := case when jsonb_typeof(p->'lines') = 'array' then p->'lines' else '[]'::jsonb end;
  v_client text := nullif(btrim(p->>'client_id'), '');
  v_walk   boolean := coalesce((p->>'walk_in')::boolean, false);
  v_draft  bigint := nullif(btrim(p->>'draft_id'), '')::bigint;
  v_seller text;
  v_srcs   text[] := '{}';
  l        jsonb;
  v_price  numeric;
  v_disc   numeric;
  pc       record;
  v_held   bigint;
  i        int;
begin
  -- shape
  if jsonb_array_length(v_lines) = 0 then raise exception 'no lines'; end if;
  if exists (select 1 from jsonb_array_elements(v_lines) e where nullif(e->>'piece_id', '') is null) then
    raise exception 'no lines: a line has no piece';
  end if;
  if (select count(distinct (e->>'piece_id')::uuid) from jsonb_array_elements(v_lines) e) <> jsonb_array_length(v_lines) then
    raise exception 'piece listed twice';
  end if;
  if v_client is not null and v_walk then raise exception 'choose a client or walk-in'; end if;
  if v_client is not null and not exists (select 1 from crm_clients where client_id = v_client
                                                                       and record_state not in ('merged', 'deleted')) then
    raise exception 'choose a client or walk-in: client % not found', v_client;
  end if;

  -- sellers (optional while suspended)
  if nullif(btrim(p->>'seller'), '') is not null then v_seller := pos_rep_source(p->>'seller'); end if;
  for l in select e from jsonb_array_elements(v_lines) e loop
    v_srcs := v_srcs || case when nullif(btrim(l->>'seller'), '') is not null then pos_rep_source(l->>'seller') end;
  end loop;

  -- prices (optional) and discounts, as pos_post_sale checks them
  for l in select e from jsonb_array_elements(v_lines) e loop
    v_disc := coalesce((l->>'discount_pct')::numeric, 0);
    if v_disc < 0 or v_disc >= 100 then raise exception 'discount must be 0 to 100, and below 100'; end if;
    if v_disc <> round(v_disc, 4) then raise exception 'discount must be 0 to 100 with at most 4 decimals'; end if;
    v_price := (l->>'price_uzs')::numeric;
    if v_price is not null and (v_price <= 0 or v_price <> trunc(v_price)) then
      raise exception 'price must be positive whole so''m';
    end if;
  end loop;

  -- mode (held steady against a switch); as pos_post_sale, a page showing another mode is refused
  select mode into v_mode from pos_settings where id = 1 for share;
  if p ? 'expect_mode' and (p->>'expect_mode') is distinct from v_mode then
    raise exception 'the till was switched to % — reload', v_mode;
  end if;

  -- pieces: locked in piece_id order, then checked under the lock; the draft row after them,
  -- the same order as pos_post_sale (pieces, then deleting its draft), so the two cannot deadlock
  perform 1 from ops_pieces
   where piece_id in (select (e->>'piece_id')::uuid from jsonb_array_elements(v_lines) e)
   order by piece_id for update;
  if v_draft is not null then
    perform 1 from pos_drafts where draft_id = v_draft and mode = v_mode for update;
    if not found then raise exception 'suspended sale % not found', v_draft; end if;
  end if;
  for pc in select o.piece_id, o.serial, o.state
              from jsonb_array_elements(v_lines) e
              left join ops_pieces o on o.piece_id = (e->>'piece_id')::uuid
             order by (e->>'piece_id')::uuid loop
    if pc.piece_id is null then raise exception 'piece not found'; end if;
    if pc.state <> 'in_stock' then raise exception 'piece % is not in stock', pc.serial; end if;
    select min(draft_id) into v_held from pos_draft_lines
     where mode = v_mode and piece_id = pc.piece_id and draft_id is distinct from v_draft;
    if v_held is not null then raise exception 'piece % is in suspended sale %', pc.serial, v_held; end if;
  end loop;
  -- one till: a new suspended sale only while none of this mode exists (pos_post_sale refuses every post
  -- while another draft exists, so two would block each other); checked after the holds
  if v_draft is null and exists (select 1 from pos_drafts where mode = v_mode) then
    raise exception 'another sale is suspended';
  end if;

  if v_draft is null then
    -- pos_drafts_one_per_mode makes the one-till rule atomic: two devices suspending at the same moment
    -- cannot both pass the check above and both insert
    begin
      insert into pos_drafts(mode, client_id, walk_in, seller, fiscal_ref, created_by)
      values (v_mode, v_client, v_walk, v_seller, nullif(btrim(p->>'fiscal_ref'), ''),
              coalesce(nullif(btrim(p_actor), ''), 'unknown'))
      returning draft_id into v_draft;
    exception when unique_violation then
      raise exception 'another sale is suspended';
    end;
  else
    update pos_drafts
       set client_id = v_client, walk_in = v_walk, seller = v_seller, fiscal_ref = nullif(btrim(p->>'fiscal_ref'), ''),
           updated_at = now()
     where draft_id = v_draft;
    delete from pos_draft_lines where draft_id = v_draft;
  end if;

  i := 0;
  for l in select e from jsonb_array_elements(v_lines) e loop
    i := i + 1;
    insert into pos_draft_lines(draft_id, line_no, piece_id, price_uzs, discount_pct, seller, mode)
    values (v_draft, i, (l->>'piece_id')::uuid, (l->>'price_uzs')::bigint, coalesce((l->>'discount_pct')::numeric, 0),
            v_srcs[i], v_mode);
  end loop;

  return jsonb_build_object('draft_id', v_draft);
end $$;
revoke execute on function public.pos_suspend(jsonb, text) from public, anon, authenticated;
