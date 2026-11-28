-- One register, step 5: the Stock upload creates pieces and sets retail prices.
--   * Retail price: Colibri's template carries the selling price in dollars ("Цена продажи, долл"); Colibri turns it
--     into the shelf price in UZS at one fixed rate. We keep the same logic and the same rate: 12 500, held as a
--     setting (pos_settings.usd_shelf_rate), not in code. A blank cell changes nothing.
--   * A row whose serial we do not hold creates the piece (in stock) when its design is in the catalogue and its
--     colour is clear: the design has one colour, or the row's colour code or colour name picks one. Otherwise the
--     row waits for the piece to arrive from Colibri, as before, and says why (no_design, design_unclear, colour_unclear).
--   * A row for a piece we hold reprices it when the file's price differs; a piece that has left stock is not repriced.
--     Every price set here is written to ops_piece_changes (source upload).
--   A waiting row applied later (stk_apply_pending) sets the price too, and a reference that is another reference
--   of the piece's own design (an alias) is accepted, so a file that created a piece can be loaded again.
--   stk_import from 20261118_stk_7_import_fixes.sql: preview rows gain status "create" and a "price" {old, new};
--   the summary gains "create" and "repriced".

alter table public.pos_settings add column usd_shelf_rate numeric(12,2) not null default 12500 check (usd_shelf_rate > 0);
comment on column public.pos_settings.usd_shelf_rate is 'UZS per dollar for turning a selling price in dollars into the shelf price. 12 500 is the rate Colibri uses.';

-- The row's retail price in UZS, or null when the cell is blank. Raises when it is not a positive number.
create function public.stk_row_price(r jsonb) returns bigint
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c text := stk_cell(r->'colibri'->>'Цена продажи, долл'); v numeric;
begin
  if c is null then return null; end if;
  v := replace(regexp_replace(c, '[\s\u00a0]', '', 'g'), ',', '.')::numeric;
  if v <= 0 then raise exception 'not a price'; end if;
  return round(v * (select usd_shelf_rate from pos_settings where id = 1))::bigint;
end $$;
revoke execute on function public.stk_row_price(jsonb) from public, anon, authenticated;

-- Sets the piece's retail price from the row when the row has one and it differs; never on a piece that has left
-- stock. Writes the piece's history. True when the price changed. Used by a direct upload and by a waiting row.
create function public.stk_apply_row_price(p_piece uuid, r jsonb, p_actor text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_price bigint; v_old bigint; v_state text;
begin
  begin v_price := stk_row_price(r); exception when others then return false; end;   -- a waiting row with a bad price: left as it is
  if v_price is null then return false; end if;
  select o.price_uzs, o.state into v_old, v_state from ops_pieces o where o.piece_id = p_piece for update;
  if not found or v_state in ('sold', 'not_received') or v_price is not distinct from v_old then return false; end if;
  insert into ops_piece_changes(piece_id, field, old_value, new_value, source, actor) values (p_piece, 'price', v_old::text, v_price::text, 'upload', p_actor);
  update ops_pieces set price_uzs = v_price, updated_at = now() where piece_id = p_piece;
  return true;
end $$;
revoke execute on function public.stk_apply_row_price(uuid, jsonb, text) from public, anon, authenticated;

-- Which design and colour a row means: {model_id, variant_id}, or {reason} when it cannot be told.
create function public.stk_row_design(p_brand text, p_article text, r jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_models text[]; v_model text; v_vars text[]; v_code text := stk_cell(r->'colibri'->>'Код цвета'); v_name text := stk_cell(r->'colibri'->>'Наименование цвета');
  norm constant text := '[^0-9A-ZА-Я]'; v_alias text[];
begin
  if p_brand is null or p_article is null then return jsonb_build_object('reason', 'no_design'); end if;
  select array_agg(distinct x.model_id) into v_models from (
    select m.model_id from cat_models m
     where ops_brand_key(m.brand) = ops_brand_key(p_brand) and regexp_replace(upper(m.article), norm, '', 'g') = regexp_replace(upper(p_article), norm, '', 'g')
    union
    select a.model_id from cat_article_alias a join cat_models m on m.model_id = a.model_id
     where ops_brand_key(m.brand) = ops_brand_key(p_brand) and regexp_replace(upper(a.article), norm, '', 'g') = regexp_replace(upper(p_article), norm, '', 'g')) x;
  if v_models is null then return jsonb_build_object('reason', 'no_design'); end if;
  if array_length(v_models, 1) > 1 then return jsonb_build_object('reason', 'design_unclear'); end if;
  v_model := v_models[1];
  select array_agg(variant_id) into v_vars from cat_variants where model_id = v_model;
  if v_vars is null then return jsonb_build_object('reason', 'colour_unclear'); end if;
  if array_length(v_vars, 1) > 1 and v_code is not null then
    select array_agg(variant_id) into v_vars from cat_variants where model_id = v_model and upper(btrim(colour_code)) = upper(v_code);
  end if;
  if coalesce(array_length(v_vars, 1), 0) <> 1 and v_name is not null then
    select array_agg(variant_id) into v_vars from cat_variants
     where model_id = v_model and lower(v_name) in (lower(btrim(colour_name_ru)), lower(btrim(colour_name_en)));
  end if;
  if coalesce(array_length(v_vars, 1), 0) <> 1 then
    -- a reference that is itself the alias of one colour
    select array_agg(distinct a.variant_id) into v_alias from cat_article_alias a
     where a.model_id = v_model and a.variant_id is not null and regexp_replace(upper(a.article), norm, '', 'g') = regexp_replace(upper(p_article), norm, '', 'g');
    if coalesce(array_length(v_alias, 1), 0) = 1 then v_vars := v_alias; end if;
  end if;
  if coalesce(array_length(v_vars, 1), 0) <> 1 then return jsonb_build_object('reason', 'colour_unclear', 'model_id', v_model); end if;
  return jsonb_build_object('model_id', v_model, 'variant_id', v_vars[1]);
end $$;
revoke execute on function public.stk_row_design(text, text, jsonb) from public, anon, authenticated;

-- Is the row's reference the piece's own? The same reference letter for letter, or another reference of the same
-- design (a size-coded reference the catalogue folds into it), so a file that created a piece can be loaded again.
create function public.stk_same_reference(p_piece uuid, p_brand text, p_article text, r jsonb) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(regexp_replace(upper(o.article), '[^0-9A-ZА-Я]', '', 'g') = regexp_replace(upper(p_article), '[^0-9A-ZА-Я]', '', 'g'), false)
      or coalesce(o.model_id = stk_row_design(p_brand, p_article, r)->>'model_id', false)
    from ops_pieces o where o.piece_id = p_piece;
$$;
revoke execute on function public.stk_same_reference(uuid, text, text, jsonb) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.stk_import(p jsonb, p_actor text, p_apply boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r jsonb; x jsonb; v_brand text; v_serial text; v_article text; v_n int; v_piece uuid; v_have text; v_err jsonb; v_res jsonb;
  v_rows jsonb := '[]'::jsonb; n_update int := 0; n_pending int := 0; n_error int := 0; n_same int := 0; v_file text := left(coalesce(p->>'file_name', 'upload'), 200);
  v_applied boolean := false; v_from_pending int := 0; k text; v_d date;
  v_price bigint; v_old bigint; v_state text; v_pc jsonb; v_des jsonb; n_create int := 0; n_reprice int := 0;
begin
  if not ops_has_right(p_actor, 'manage_stock') then raise exception 'Your account cannot change stock.'; end if;
  if jsonb_typeof(p->'rows') is distinct from 'array' or jsonb_array_length(p->'rows') = 0 then raise exception 'The file has no rows.'; end if;
  if jsonb_array_length(p->'rows') > 2000 then raise exception 'The file has more than 2 000 rows. Split it.'; end if;

  -- pass 1: check every row (pass 2 applies only when none is in error)
  for r in select * from jsonb_array_elements(p->'rows') loop
    x := coalesce(r->'extra', '{}'::jsonb);
    v_brand := stk_cell(r->'colibri'->>'Бренд'); v_serial := stk_cell(r->'colibri'->>'Серийный номер'); v_article := stk_cell(r->'colibri'->>'Артикул');
    v_err := '[]'::jsonb; v_res := null; v_piece := null;
    if v_brand is null then v_err := v_err || '[{"code":"no_brand"}]'::jsonb; end if;
    if v_serial is null then v_err := v_err || '[{"code":"no_serial"}]'::jsonb; end if;
    if v_article is null then v_err := v_err || '[{"code":"no_article"}]'::jsonb; end if;
    if stk_cell(x->>'hs_code') is not null and stk_cell(x->>'hs_code') !~ '^\d{10}$' then v_err := v_err || '[{"code":"bad_hs"}]'::jsonb; end if;
    if stk_cell(x->>'ikpu') is not null and stk_cell(x->>'ikpu') !~ '^\d{17}$' then v_err := v_err || '[{"code":"bad_ikpu"}]'::jsonb; end if;
    foreach k in array array['invoice_date', 'arrival_date'] loop
      if stk_cell(x->>k) is not null then
        begin
          if stk_cell(x->>k) !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'x'; end if;
          v_d := stk_cell(x->>k)::date;
        exception when others then v_err := v_err || jsonb_build_array(jsonb_build_object('code', 'bad_date', 'field', k));
        end;
      end if;
    end loop;
    v_price := null;
    begin v_price := stk_row_price(r);
    exception when others then v_err := v_err || '[{"code":"bad_price"}]'::jsonb;
    end;
    if v_brand is not null and v_serial is not null then
      if (select count(*) from jsonb_array_elements(p->'rows') y
           where ops_brand_key(stk_cell(y->'colibri'->>'Бренд')) = ops_brand_key(v_brand)
             and upper(stk_cell(y->'colibri'->>'Серийный номер')) = upper(v_serial)) > 1 then
        v_err := v_err || '[{"code":"serial_repeated"}]'::jsonb;
      end if;
      select count(*), (array_agg(o.piece_id))[1], (array_agg(o.article))[1] into v_n, v_piece, v_have from ops_pieces o
       where ops_brand_key(o.brand) = ops_brand_key(v_brand) and upper(btrim(o.serial)) = upper(v_serial);
      if v_n > 1 then v_err := v_err || '[{"code":"serial_ambiguous"}]'::jsonb; v_piece := null;
      elsif v_n = 1 and v_article is not null and v_have is not null
            and not stk_same_reference(v_piece, v_brand, v_article, r) then
        -- the serial is already on a piece of another reference: almost always a typing error in the file
        v_err := v_err || jsonb_build_array(jsonb_build_object('code', 'serial_other_reference', 'on_file', v_have));
      end if;
    end if;

    if jsonb_array_length(v_err) > 0 then
      n_error := n_error + 1;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('row', r->'row', 'brand', v_brand, 'serial', v_serial, 'article', v_article, 'status', 'error', 'errors', v_err));
    elsif v_piece is null then
      -- a serial we do not hold. A design we know, with its colour clear: the row creates the piece.
      -- Otherwise it waits for the piece to arrive from Colibri, as before, and says why.
      v_des := stk_row_design(v_brand, v_article, r);
      if v_des ? 'variant_id' then
        n_create := n_create + 1;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object('row', r->'row', 'brand', v_brand, 'serial', v_serial, 'article', v_article, 'status', 'create',
                                                'model_id', v_des->>'model_id', 'variant_id', v_des->>'variant_id', 'price_uzs', v_price));
      else
        n_pending := n_pending + 1;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object('row', r->'row', 'brand', v_brand, 'serial', v_serial, 'article', v_article, 'status', 'pending', 'reason', v_des->>'reason'));
      end if;
    else
      v_res := stk_import_row(v_piece, r, v_file, false);
      -- a retail price in the file that differs from the piece's: the piece is repriced (never one that has left stock)
      select o.price_uzs, o.state into v_old, v_state from ops_pieces o where o.piece_id = v_piece;
      v_pc := case when v_price is not null and v_state not in ('sold', 'not_received') and v_price is distinct from v_old
                   then jsonb_build_object('old', v_old, 'new', v_price) end;
      if v_pc is not null then n_reprice := n_reprice + 1; end if;
      if v_pc is null and v_res->'changes' = '{"colibri_new":0,"colibri_changed":0,"details":0,"receipt":null,"brand_code":false,"hs_code":false,"ikpu":false}'::jsonb then
        n_same := n_same + 1;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object('row', r->'row', 'brand', v_brand, 'serial', v_serial, 'article', v_article, 'status', 'same', 'piece_id', v_piece, 'warnings', v_res->'warnings'));
      else
        n_update := n_update + 1;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object('row', r->'row', 'brand', v_brand, 'serial', v_serial, 'article', v_article, 'status', 'update', 'piece_id', v_piece)
                                              || v_res || case when v_pc is not null then jsonb_build_object('price', v_pc) else '{}'::jsonb end);
      end if;
    end if;
  end loop;

  -- pass 2
  if p_apply then
    if n_error > 0 then raise exception 'The file has % row(s) with errors. Nothing was loaded: fix them and upload again.', n_error; end if;
    for r in select * from jsonb_array_elements(p->'rows') loop
      v_brand := stk_cell(r->'colibri'->>'Бренд'); v_serial := stk_cell(r->'colibri'->>'Серийный номер');
      select (array_agg(o.piece_id))[1] into v_piece from ops_pieces o
       where ops_brand_key(o.brand) = ops_brand_key(v_brand) and upper(btrim(o.serial)) = upper(v_serial);
      v_price := stk_row_price(r);
      v_des := case when v_piece is null then stk_row_design(v_brand, stk_cell(r->'colibri'->>'Артикул'), r) end;
      if v_piece is not null then
        perform stk_import_row(v_piece, r, v_file, true);
        perform stk_apply_row_price(v_piece, r, p_actor);
      elsif v_des ? 'variant_id' then
        insert into ops_pieces(store_id, brand, serial, article, model_id, variant_id, size, state, barcode, price_uzs)
        select 1, m.brand, v_serial, m.article, m.model_id, v_des->>'variant_id', stk_cell(r->'colibri'->>'Размер'), 'in_stock',
               stk_cell(r->'colibri'->>'Штрих Код'), v_price
          from cat_models m where m.model_id = v_des->>'model_id'
        returning piece_id into v_piece;
        insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor)
          values (v_piece, null, 'in_stock', 'arrived', 'manual', v_file, p_actor);
        if v_price is not null then
          insert into ops_piece_changes(piece_id, field, old_value, new_value, source, actor) values (v_piece, 'price', null, v_price::text, 'upload', p_actor);
        end if;
        perform stk_import_row(v_piece, r, v_file, true);
      else
        insert into ops_upload_pending(brand_key, serial_key, brand, serial, row, file_name, actor)
          values (ops_brand_key(v_brand), upper(v_serial), v_brand, v_serial, r, v_file, p_actor)
        on conflict (brand_key, serial_key) do update set row = excluded.row, file_name = excluded.file_name, actor = excluded.actor, created_at = now(),
          brand = excluded.brand, serial = excluded.serial;
      end if;
    end loop;
    v_applied := true;
    v_from_pending := stk_apply_pending();
  end if;

  return jsonb_build_object('applied', v_applied, 'file_name', v_file, 'rows', v_rows,
    'summary', jsonb_build_object('rows', jsonb_array_length(p->'rows'), 'update', n_update, 'same', n_same, 'pending', n_pending, 'error', n_error,
                                   'create', n_create, 'repriced', n_reprice),
    'waiting', (select count(*) from ops_upload_pending));
end $function$;
revoke execute on function public.stk_import(jsonb, text, boolean) from public, anon, authenticated;

-- A waiting row applied later follows the same two rules: the reference may be another reference of the piece's
-- design, and its retail price is applied (by the person who uploaded the file).
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.stk_apply_pending()'::regprocedure);
  n := replace(d, 'continue when v_want is not null and v_have is not null
      and regexp_replace(upper(v_have), ''[^0-9A-ZА-Я]'', '''', ''g'') <> regexp_replace(upper(v_want), ''[^0-9A-ZА-Я]'', '''', ''g'');',
                  'continue when v_want is not null and v_have is not null
      and not stk_same_reference(v_piece, u.brand, v_want, u.row);');
  n := replace(n, 'perform stk_import_row(v_piece, u.row, u.file_name, true);',
                  'perform stk_import_row(v_piece, u.row, u.file_name, true);
    perform stk_apply_row_price(v_piece, u.row, coalesce(u.actor, ''upload''));');
  if n !~ 'stk_same_reference' or n !~ 'stk_apply_row_price' then raise exception 'reg_5: stk_apply_pending not patched as expected'; end if;
  execute n;
end $do$;
