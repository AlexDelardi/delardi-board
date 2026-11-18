-- Stock enrichment, slice 4: Training mode and transfers.
-- Training lives in tables of its own (stk_train_*): a fixed set of made-up pieces in two made-up stores. Nothing here
-- reads or writes ops_pieces, so no training action can touch a real piece and no real list, total, export, till or
-- catalogue query can return a training piece. The state rules are the same as ops_move_state, plus the transfer:
-- in stock → in transfer (to another store) → in stock there; or called back to the store it left.
-- Only the stock-api edge function (service role) calls these.

create table public.stk_train_stores (
  store_id  smallint primary key,
  code      text not null unique,
  name      text not null
);
insert into public.stk_train_stores(store_id, code, name)
values (1, 'TRN-A', 'Training store A'), (2, 'TRN-B', 'Training store B');

create table public.stk_train_pieces (
  piece_id       uuid primary key,
  store_id       smallint not null references public.stk_train_stores(store_id),
  to_store_id    smallint references public.stk_train_stores(store_id),
  brand          text not null,
  serial         text not null unique,
  barcode        text,
  article        text,
  collection     text,
  model_name     text,
  colour         text,
  size           text,
  category       text,
  metal_keys     text[] not null default '{}',
  stone_keys     text[] not null default '{}',
  price_uzs      numeric(14,0),
  state          text not null default 'in_stock' check (state in ('in_stock', 'reserved', 'booked_out', 'damaged', 'in_transfer')),
  state_since    timestamptz not null default now(),
  hold_client_id text,
  hold_until     date,
  state_note     text,
  first_seen_at  timestamptz not null default now(),
  check ((state = 'in_transfer') = (to_store_id is not null)),
  check (to_store_id is null or to_store_id <> store_id)
);
create table public.stk_train_events (
  event_id      bigint generated always as identity primary key,
  piece_id      uuid not null references public.stk_train_pieces(piece_id) on delete cascade,
  at            timestamptz not null default now(),
  from_state    text,
  to_state      text not null,
  reason        text not null,
  from_store_id smallint references public.stk_train_stores(store_id),
  to_store_id   smallint references public.stk_train_stores(store_id),
  actor         text not null,
  note          text
);
create index stk_train_events_piece on public.stk_train_events(piece_id);
alter table public.stk_train_stores enable row level security;
alter table public.stk_train_pieces enable row level security;
alter table public.stk_train_events enable row level security;
revoke all on table public.stk_train_stores, public.stk_train_pieces, public.stk_train_events from public, anon, authenticated;

-- The set as it starts: twelve pieces, eight in store A and four in store B, all in stock. Piece references are fixed,
-- so a panel open on a piece survives a reset.
create function public.stk_train_seed() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  delete from stk_train_pieces;
  insert into stk_train_pieces(piece_id, store_id, brand, serial, barcode, article, collection, model_name, colour, size, category,
                               metal_keys, stone_keys, price_uzs)
  select ('00000000-0000-4000-9000-' || lpad(v.i::text, 12, '0'))::uuid, v.store, v.brand, 'TRN-' || lpad(v.i::text, 4, '0'),
         '29000000' || lpad(v.i::text, 5, '0'), v.article, v.collection, v.model_name, v.colour, v.size, v.category,
         v.metal, v.stone, v.price
    from (values
      (1,  1, 'Training Jeweller',   'TJ-R-101', 'Aurora',   'Aurora ring',          'WG', '52', 'ring',     '{white_gold}'::text[],  '{diamond}'::text[], 18500000),
      (2,  1, 'Training Jeweller',   'TJ-R-101', 'Aurora',   'Aurora ring',          'WG', '54', 'ring',     '{white_gold}',  '{diamond}', 18500000),
      (3,  1, 'Training Jeweller',   'TJ-N-205', 'Aurora',   'Aurora necklace',      'YG', null, 'necklace', '{yellow_gold}', '{}',        42000000),
      (4,  1, 'Training Jeweller',   'TJ-E-310', 'Meridian', 'Meridian earrings',    'RG', null, 'earrings', '{rose_gold}',   '{diamond}', 27300000),
      (5,  1, 'Training Jeweller',   'TJ-B-412', 'Meridian', 'Meridian bracelet',    'WG', '17', 'bracelet', '{white_gold}',  '{sapphire}', 61000000),
      (6,  1, 'Training Watchmaker', 'TW-4001',  'Navigator', 'Navigator 40 mm',     null, '40', 'watch',    '{steel}',       '{}',        96000000),
      (7,  1, 'Training Watchmaker', 'TW-4001',  'Navigator', 'Navigator 40 mm',     null, '40', 'watch',    '{steel}',       '{}',        96000000),
      (8,  1, 'Training Watchmaker', 'TW-3602',  'Soirée',   'Soirée 36 mm',         'RG', '36', 'watch',    '{rose_gold}',   '{diamond}', 248000000),
      (9,  2, 'Training Jeweller',   'TJ-R-101', 'Aurora',   'Aurora ring',          'WG', '56', 'ring',     '{white_gold}',  '{diamond}', 18500000),
      (10, 2, 'Training Jeweller',   'TJ-N-205', 'Aurora',   'Aurora necklace',      'YG', null, 'necklace', '{yellow_gold}', '{}',        42000000),
      (11, 2, 'Training Watchmaker', 'TW-4001',  'Navigator', 'Navigator 40 mm',     null, '40', 'watch',    '{steel}',       '{}',        96000000),
      (12, 2, 'Training Watchmaker', 'TW-S-01',  'Navigator', 'Navigator strap',     null, null, 'strap',    '{}',            '{}',        3200000)
    ) as v(i, store, brand, article, collection, model_name, colour, size, category, metal, stone, price);
  get diagnostics n = row_count;
  insert into stk_train_events(piece_id, to_state, reason, to_store_id, actor)
  select piece_id, 'in_stock', 'training_set', store_id, 'system' from stk_train_pieces;
  return n;
end $$;
revoke execute on function public.stk_train_seed() from public, anon, authenticated;
select public.stk_train_seed();

create function public.stk_train_reset(p_actor text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not ops_has_right(p_actor, 'manage_stock') then raise exception 'Your account cannot change stock.'; end if;
  return jsonb_build_object('pieces', stk_train_seed());
end $$;
revoke execute on function public.stk_train_reset(text) from public, anon, authenticated;

-- One page of the filtered list and the totals by state, in the shape of stk_piece_list, plus the store of each piece.
-- p: {q?, brand?, category?, store? (code), states?, price_min?, price_max?, page?}. A piece in transfer is listed under
-- the store it left until it is received.
create function public.stk_train_list(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_q      text := btrim(coalesce(p->>'q', ''));
  v_words  text[];
  v_brand  text := nullif(btrim(coalesce(p->>'brand', '')), '');
  v_cat    text := nullif(btrim(coalesce(p->>'category', '')), '');
  v_store  text := nullif(upper(btrim(coalesce(p->>'store', ''))), '');
  v_min    numeric := nullif(btrim(coalesce(p->>'price_min', '')), '')::numeric;
  v_max    numeric := nullif(btrim(coalesce(p->>'price_max', '')), '')::numeric;
  v_states text[] := case when jsonb_typeof(p->'states') = 'array' then array(select jsonb_array_elements_text(p->'states')) end;
  v_page   int := greatest(coalesce(nullif(p->>'page', '')::int, 1), 1);
  v_count  int; v_rows jsonb; v_totals jsonb;
begin
  if v_q <> '' then
    select array_agg('%' || regexp_replace(w, '([\\%_])', '\\\1', 'g') || '%') into v_words
      from regexp_split_to_table(v_q, '\s+') w where w <> '';
  end if;
  with base as (
    select t.*, s.name store_name, s.code store_code, d.name to_store_name
      from stk_train_pieces t
      join stk_train_stores s on s.store_id = t.store_id
      left join stk_train_stores d on d.store_id = t.to_store_id
     where (v_words is null or not exists (
              select 1 from unnest(v_words) w
               where not (t.serial ilike w escape '\' or coalesce(t.barcode ilike w escape '\', false)
                          or coalesce(t.article ilike w escape '\', false) or t.brand ilike w escape '\'
                          or coalesce(t.collection ilike w escape '\', false) or coalesce(t.model_name ilike w escape '\', false))))
       and (v_brand is null or t.brand = v_brand)
       and (v_cat is null or t.category = v_cat)
       and (v_store is null or s.code = v_store)
       and (v_min is null or t.price_uzs >= v_min) and (v_max is null or t.price_uzs <= v_max)
  ), hit as (
    select * from base b where v_states is null or b.state = any(v_states)
  )
  select (select count(*) from hit),
         (select coalesce(jsonb_agg(jsonb_build_object('piece_id', r.piece_id, 'serial', r.serial, 'barcode', r.barcode, 'brand', r.brand,
                    'article', r.article, 'collection', r.collection, 'model_name', r.model_name, 'colour', r.colour, 'size', r.size,
                    'category', r.category, 'state', r.state, 'state_since', r.state_since, 'price_uzs', r.price_uzs,
                    'store', r.store_name, 'store_code', r.store_code, 'to_store', r.to_store_name)
                    order by r.brand, r.article nulls last, r.serial), '[]'::jsonb)
            from (select * from hit order by brand, article nulls last, serial limit 50 offset (v_page - 1) * 50) r),
         (select coalesce(jsonb_agg(jsonb_build_object('state', t.state, 'pieces', t.pieces, 'value', t.value, 'unpriced', t.unpriced)
                    order by t.state), '[]'::jsonb)
            from (select b.state, count(*) pieces, coalesce(sum(b.price_uzs), 0) value, count(*) filter (where b.price_uzs is null) unpriced
                    from base b group by b.state) t)
    into v_count, v_rows, v_totals;
  return jsonb_build_object('count', v_count, 'page', v_page, 'page_size', 50, 'rows', v_rows, 'totals', v_totals);
end $$;
revoke execute on function public.stk_train_list(jsonb) from public, anon, authenticated;

create function public.stk_train_facets() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'brands', coalesce((select jsonb_agg(b order by b) from (select distinct brand b from stk_train_pieces) s), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(c order by c) from (select distinct category c from stk_train_pieces where category is not null) s), '[]'::jsonb),
    'stores', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', name) order by store_id) from stk_train_stores), '[]'::jsonb));
$$;
revoke execute on function public.stk_train_facets() from public, anon, authenticated;

-- One training piece in the shape of stk_piece_detail (reviews and sales are always empty). Null for an unknown piece.
create function public.stk_train_piece(p_piece uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t stk_train_pieces%rowtype; v_client text;
begin
  select * into t from stk_train_pieces where piece_id = p_piece;
  if not found then return null; end if;
  select q.display_name into v_client from crm_queue q where q.client_id = t.hold_client_id;
  return jsonb_build_object(
    'piece', jsonb_build_object('piece_id', t.piece_id, 'serial', t.serial, 'barcode', t.barcode, 'brand', t.brand, 'article', t.article,
               'collection', t.collection, 'model_name', t.model_name, 'colour', t.colour, 'size', t.size, 'category', t.category,
               'state', t.state, 'state_since', t.state_since, 'price_uzs', t.price_uzs,
               'hold_client_id', t.hold_client_id, 'hold_until', t.hold_until, 'state_note', t.state_note, 'first_seen_at', t.first_seen_at,
               'store', (select name from stk_train_stores where store_id = t.store_id),
               'store_code', (select code from stk_train_stores where store_id = t.store_id),
               'to_store', (select name from stk_train_stores where store_id = t.to_store_id)),
    'model', jsonb_build_object('metal_keys', to_jsonb(t.metal_keys), 'stone_keys', to_jsonb(t.stone_keys), 'gender', null, 'subcategory', null),
    'client_name', v_client,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('at', e.at, 'from_state', e.from_state, 'to_state', e.to_state, 'reason', e.reason,
                'actor', e.actor, 'note', e.note, 'from_store', fs.name, 'to_store', ts.name) order by e.at desc, e.event_id desc)
        from stk_train_events e
        left join stk_train_stores fs on fs.store_id = e.from_store_id
        left join stk_train_stores ts on ts.store_id = e.to_store_id
       where e.piece_id = p_piece), '[]'::jsonb),
    'reviews', '[]'::jsonb,
    'sales', '[]'::jsonb);
end $$;
revoke execute on function public.stk_train_piece(uuid) from public, anon, authenticated;

-- Reserve, book out, damaged, back in stock: the rules of ops_move_state.
create function public.stk_train_set_state(p_piece uuid, p_state text, p_actor text, p_note text default null,
                                           p_client text default null, p_until date default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_from text;
begin
  if not ops_has_right(p_actor, 'manage_stock') then raise exception 'Your account cannot change stock.'; end if;
  select state into v_from from stk_train_pieces where piece_id = p_piece for update;
  if not found then raise exception 'No piece with that reference.'; end if;
  if not ((v_from = 'in_stock' and p_state in ('reserved', 'booked_out', 'damaged'))
       or (v_from in ('reserved', 'booked_out', 'damaged') and p_state = 'in_stock')) then
    raise exception 'That change is not possible: the piece has moved meanwhile.';
  end if;
  update stk_train_pieces
     set state = p_state, state_since = now(),
         hold_client_id = case when p_state in ('reserved', 'booked_out') then p_client end,
         hold_until     = case when p_state in ('reserved', 'booked_out') then p_until end,
         state_note     = case when p_state = 'in_stock' then null else p_note end
   where piece_id = p_piece;
  insert into stk_train_events(piece_id, from_state, to_state, reason, actor, note)
  values (p_piece, v_from, p_state, case when p_state = 'reserved' then 'reserved' when p_state = 'booked_out' then 'booked_out'
            when p_state = 'damaged' then 'damaged' when v_from = 'reserved' then 'released'
            when v_from = 'booked_out' then 'returned_from_loan' else 'repaired' end, p_actor, p_note);
end $$;
revoke execute on function public.stk_train_set_state(uuid, text, text, text, text, date) from public, anon, authenticated;

-- Send a piece that is in stock to another store. It stays under the store it left, in transfer, until it is received.
create function public.stk_train_send(p_piece uuid, p_to_store text, p_actor text, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare t stk_train_pieces%rowtype; v_to smallint;
begin
  if not ops_has_right(p_actor, 'manage_stock') then raise exception 'Your account cannot change stock.'; end if;
  select * into t from stk_train_pieces where piece_id = p_piece for update;
  if not found then raise exception 'No piece with that reference.'; end if;
  select store_id into v_to from stk_train_stores where code = upper(btrim(coalesce(p_to_store, '')));
  if v_to is null then raise exception 'No store with that code.'; end if;
  if t.state <> 'in_stock' then raise exception 'Only a piece that is in stock can be sent to another store.'; end if;
  if v_to = t.store_id then raise exception 'The piece is already in that store.'; end if;
  update stk_train_pieces set state = 'in_transfer', state_since = now(), to_store_id = v_to, state_note = nullif(btrim(coalesce(p_note, '')), ''),
         hold_client_id = null, hold_until = null
   where piece_id = p_piece;
  insert into stk_train_events(piece_id, from_state, to_state, reason, from_store_id, to_store_id, actor, note)
  values (p_piece, 'in_stock', 'in_transfer', 'transfer_sent', t.store_id, v_to, p_actor, nullif(btrim(coalesce(p_note, '')), ''));
end $$;
revoke execute on function public.stk_train_send(uuid, text, text, text) from public, anon, authenticated;

-- The receiving store confirms the piece arrived: it is in stock there.
create function public.stk_train_receive(p_piece uuid, p_actor text, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare t stk_train_pieces%rowtype;
begin
  if not ops_has_right(p_actor, 'manage_stock') then raise exception 'Your account cannot change stock.'; end if;
  select * into t from stk_train_pieces where piece_id = p_piece for update;
  if not found then raise exception 'No piece with that reference.'; end if;
  if t.state <> 'in_transfer' then raise exception 'This piece is not in transfer.'; end if;
  update stk_train_pieces set state = 'in_stock', state_since = now(), store_id = t.to_store_id, to_store_id = null, state_note = null
   where piece_id = p_piece;
  insert into stk_train_events(piece_id, from_state, to_state, reason, from_store_id, to_store_id, actor, note)
  values (p_piece, 'in_transfer', 'in_stock', 'transfer_received', t.store_id, t.to_store_id, p_actor, nullif(btrim(coalesce(p_note, '')), ''));
end $$;
revoke execute on function public.stk_train_receive(uuid, text, text) from public, anon, authenticated;

-- Call a transfer back before it is received: the piece is in stock again in the store it left.
create function public.stk_train_cancel(p_piece uuid, p_actor text, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare t stk_train_pieces%rowtype;
begin
  if not ops_has_right(p_actor, 'manage_stock') then raise exception 'Your account cannot change stock.'; end if;
  select * into t from stk_train_pieces where piece_id = p_piece for update;
  if not found then raise exception 'No piece with that reference.'; end if;
  if t.state <> 'in_transfer' then raise exception 'This piece is not in transfer.'; end if;
  update stk_train_pieces set state = 'in_stock', state_since = now(), to_store_id = null, state_note = null where piece_id = p_piece;
  insert into stk_train_events(piece_id, from_state, to_state, reason, from_store_id, to_store_id, actor, note)
  values (p_piece, 'in_transfer', 'in_stock', 'transfer_cancelled', t.store_id, t.to_store_id, p_actor, nullif(btrim(coalesce(p_note, '')), ''));
end $$;
revoke execute on function public.stk_train_cancel(uuid, text, text) from public, anon, authenticated;
