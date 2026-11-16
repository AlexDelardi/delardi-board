-- Stock enrichment, slice 1 (design: docs/specs/2026-11-17-stock-enrichment-design.md).
-- Holds, per piece: the Colibri record as Colibri has it, its codes, the arrival document, and its cost.
-- Cost is read by its own function behind its own right (view_cost); no other stk_* function returns it.

-- Rights: view cost is separate from view stock. Alex only.
alter table public.board_users add column can_view_cost boolean not null default false;
update public.board_users set can_view_cost = true where name = 'Alex';

create or replace function public.ops_has_right(p_actor text, p_right text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case p_right when 'manage_stock' then u.can_manage_stock
                        when 'view_stock' then u.can_view_stock
                        when 'view_cost' then u.can_view_cost
                        else false end
      from board_users u
     where u.name = p_actor and u.active
     limit 1), false);
$$;
revoke execute on function public.ops_has_right(text, text) from public, anon, authenticated;

-- The arrival document a piece came on.
create table public.ops_receipts (
  receipt_id    bigint generated always as identity primary key,
  supplier      text,
  contract      text,
  invoice_no    text,
  invoice_date  date,
  currency      text,
  arrival_date  date,
  customs_decl  text,
  source_file   text,
  created_at    timestamptz not null default now()
);
alter table public.ops_pieces add column receipt_id bigint references public.ops_receipts(receipt_id);
create index ops_pieces_receipt_idx on public.ops_pieces(receipt_id);

-- The piece as Colibri has it: every Colibri column under its own heading, verbatim. Loaded from files, never edited by hand.
create table public.ops_piece_colibri (
  piece_id     uuid primary key references public.ops_pieces(piece_id) on delete cascade,
  data         jsonb not null,
  source_file  text,
  loaded_at    timestamptz not null default now(),
  constraint ops_piece_colibri_data_object check (jsonb_typeof(data) = 'object')
);

-- Every code a piece carries or carried. Colibri's barcode is shared by pieces of the same reference, colour and size,
-- so a code is unique per piece and kind, not globally.
create table public.ops_piece_codes (
  code_id     bigint generated always as identity primary key,
  piece_id    uuid not null references public.ops_pieces(piece_id) on delete cascade,
  code        text not null check (btrim(code) <> ''),
  kind        text not null check (kind in ('colibri', 'era', 'brand', 'delardi')),
  active      boolean not null default true,
  added_at    timestamptz not null default now(),
  retired_at  timestamptz,
  unique (piece_id, kind, code)
);
create index ops_piece_codes_code_idx on public.ops_piece_codes(upper(code));

-- Cost of a piece. No row means the cost is not known yet (TBD). 'estimated' = matched by the shipment's figures, not line for line.
create table public.ops_piece_costs (
  piece_id         uuid primary key references public.ops_pieces(piece_id) on delete cascade,
  invoice_price    numeric,
  currency         text,
  fx_rate          numeric,
  invoice_uzs      numeric,
  customs_vat_uzs  numeric,
  clearance_uzs    numeric,
  assay_uzs        numeric,
  customs_fee_uzs  numeric,
  other_uzs        numeric,
  landed_uzs       numeric,
  match_quality    text not null check (match_quality in ('exact', 'estimated')),
  source_file      text,
  updated_at       timestamptz not null default now()
);

alter table public.ops_receipts enable row level security;
alter table public.ops_piece_colibri enable row level security;
alter table public.ops_piece_codes enable row level security;
alter table public.ops_piece_costs enable row level security;
revoke all on table public.ops_receipts, public.ops_piece_colibri, public.ops_piece_codes, public.ops_piece_costs from public, anon, authenticated;

-- Customs and fiscal classification, per model.
alter table public.cat_models add column hs_code text, add column ikpu text;

-- The VAT share inside a shelf price, for the estimated margin. Separate from pos_settings.vat_pct, which drives the receipt.
alter table public.pos_settings add column shelf_vat_pct numeric(5,2) not null default 12;

-- Search also matches any code of the piece, active or retired.
create or replace function public.stk_base(p jsonb) returns setof public.stk_row
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
                          or coalesce(m.model_name ilike w escape '\', false)
                          or exists (select 1 from ops_piece_codes c where c.piece_id = o.piece_id and c.code ilike w escape '\'))))
       and (v_brand is null or o.brand = v_brand)
       and (v_cat is null or m.retail_category = v_cat)
  ) x
  where (v_min is null or x.price_uzs >= v_min) and (v_max is null or x.price_uzs <= v_max);
end $$;
revoke execute on function public.stk_base(jsonb) from public, anon, authenticated;

-- Where a piece came from and how it is identified. No money. Null for an unknown piece.
create function public.stk_piece_origin(p_piece uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare o ops_pieces%rowtype;
begin
  select * into o from ops_pieces where piece_id = p_piece;
  if not found then return null; end if;
  return jsonb_build_object(
    'colibri', (select jsonb_build_object('data', c.data, 'source_file', c.source_file, 'loaded_at', c.loaded_at)
                  from ops_piece_colibri c where c.piece_id = p_piece),
    'receipt', (select jsonb_build_object('supplier', r.supplier, 'contract', r.contract, 'invoice_no', r.invoice_no,
                         'invoice_date', r.invoice_date, 'currency', r.currency, 'arrival_date', r.arrival_date,
                         'customs_decl', r.customs_decl, 'source_file', r.source_file)
                  from ops_receipts r where r.receipt_id = o.receipt_id),
    'codes', coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'kind', c.kind, 'active', c.active,
                         'added_at', c.added_at, 'retired_at', c.retired_at) order by c.active desc, c.kind, c.code)
                  from ops_piece_codes c where c.piece_id = p_piece), '[]'::jsonb),
    'hs_code', (select m.hs_code from cat_models m where m.model_id = o.model_id),
    'ikpu', (select m.ikpu from cat_models m where m.model_id = o.model_id));
end $$;
revoke execute on function public.stk_piece_origin(uuid) from public, anon, authenticated;

-- The money of a piece: cost parts, landed cost, shelf price, and the estimated margin on the price without VAT.
-- match_quality is 'tbd' when no cost is recorded. Null for an unknown piece. The caller checks the view_cost right.
create function public.stk_piece_cost(p_piece uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare o ops_pieces%rowtype; c ops_piece_costs%rowtype; v_shelf numeric; v_vat numeric; v_net numeric; v_margin numeric;
begin
  select * into o from ops_pieces where piece_id = p_piece;
  if not found then return null; end if;
  select * into c from ops_piece_costs where piece_id = p_piece;
  select cp.price_uzs::numeric into v_shelf from cat_pieces cp
   where cp.variant_id = o.variant_id and upper(btrim(cp.serial)) = upper(btrim(o.serial)) order by cp.id desc limit 1;
  select s.shelf_vat_pct into v_vat from pos_settings s where s.id = 1;
  v_vat := coalesce(v_vat, 12);
  v_net := round(v_shelf / (1 + v_vat / 100));
  v_margin := v_net - c.landed_uzs;
  return jsonb_build_object(
    'match_quality', coalesce(c.match_quality, 'tbd'), 'source_file', c.source_file,
    'invoice_price', c.invoice_price, 'currency', c.currency, 'fx_rate', c.fx_rate, 'invoice_uzs', c.invoice_uzs,
    'customs_vat_uzs', c.customs_vat_uzs, 'clearance_uzs', c.clearance_uzs, 'assay_uzs', c.assay_uzs,
    'customs_fee_uzs', c.customs_fee_uzs, 'other_uzs', c.other_uzs, 'landed_uzs', c.landed_uzs,
    'shelf_price_uzs', v_shelf, 'vat_pct', v_vat, 'net_price_uzs', v_net,
    'margin_uzs', v_margin, 'margin_pct', case when v_net > 0 then round(v_margin / v_net * 100, 1) end);
end $$;
revoke execute on function public.stk_piece_cost(uuid) from public, anon, authenticated;
