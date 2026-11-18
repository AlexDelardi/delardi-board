-- Stock enrichment, slice 3: import of the upload file (Colibri columns A–AK + our columns from AL) with a preview.
-- stk_import(p, actor, apply): the same checks and the same answer whether it previews (apply = false) or applies.
-- A file with any row in error is not applied at all. Rows whose piece is not in stock yet wait in
-- ops_upload_pending and are applied when the piece appears.

-- What our own columns say about a piece (category, metal, stones, certificate, Uzbek name, store ...).
create table public.ops_piece_extra (
  piece_id     uuid primary key references public.ops_pieces(piece_id) on delete cascade,
  data         jsonb not null check (jsonb_typeof(data) = 'object'),
  source_file  text,
  loaded_at    timestamptz not null default now()
);
-- Upload rows whose piece has not reached stock yet.
create table public.ops_upload_pending (
  brand_key   text not null,
  serial_key  text not null,
  brand       text not null,
  serial      text not null,
  row         jsonb not null,
  file_name   text,
  actor       text,
  created_at  timestamptz not null default now(),
  primary key (brand_key, serial_key)
);
alter table public.ops_piece_extra enable row level security;
alter table public.ops_upload_pending enable row level security;
revoke all on table public.ops_piece_extra, public.ops_upload_pending from public, anon, authenticated;

alter table public.ops_receipts add column invoice_key text;   -- supplier + invoice number, for documents that come from an upload file
create unique index ops_receipts_invoice_key on public.ops_receipts(invoice_key) where invoice_key is not null;

-- A cell of the upload file: blank and "TBD" both mean "not known".
create function public.stk_cell(v text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when btrim(coalesce(v, '')) = '' or upper(btrim(v)) = 'TBD' then null else btrim(v) end;
$$;
revoke execute on function public.stk_cell(text) from public, anon, authenticated;

-- What applying one upload row to one piece changes; with p_apply it also makes the changes.
create function public.stk_import_row(p_piece uuid, r jsonb, p_file text, p_apply boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o ops_pieces%rowtype; x jsonb := coalesce(r->'extra', '{}'::jsonb); v_old jsonb; v_in jsonb; v_new int := 0; v_chg int := 0;
  v_details jsonb; v_det_n int := 0; v_rc text; v_code boolean := false; v_hs boolean := false; v_ikpu boolean := false;
  v_warn jsonb := '[]'::jsonb; rc ops_receipts%rowtype; m cat_models%rowtype; v_key text; v_rid bigint; k text;
  v_fields jsonb;
begin
  select * into o from ops_pieces where piece_id = p_piece;

  -- the Colibri columns: merged, blanks never erase
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_in
    from jsonb_each(coalesce(r->'colibri', '{}'::jsonb)) e
   where e.value <> 'null'::jsonb and stk_cell(e.value #>> '{}') is not null;
  select c.data into v_old from ops_piece_colibri c where c.piece_id = p_piece;
  select count(*) filter (where v_old is null or not v_old ? e.key), count(*) filter (where v_old ? e.key and v_old->e.key is distinct from e.value)
    into v_new, v_chg from jsonb_each(v_in) e;
  if p_apply and v_new + v_chg > 0 then
    insert into ops_piece_colibri(piece_id, data, source_file) values (p_piece, v_in, p_file)
    on conflict (piece_id) do update set data = ops_piece_colibri.data || excluded.data, source_file = excluded.source_file, loaded_at = now();
  end if;

  -- our own descriptive columns
  select coalesce(jsonb_object_agg(e.key, stk_cell(e.value #>> '{}')), '{}'::jsonb) into v_details
    from jsonb_each(x) e
   where e.key in ('category', 'subcategory', 'metal', 'metal_purity', 'metal_weight_g', 'stones', 'certificate_no', 'name_uz', 'store')
     and stk_cell(e.value #>> '{}') is not null;
  select data into v_old from ops_piece_extra where piece_id = p_piece;
  select count(*) into v_det_n from jsonb_each(v_details) e where v_old is null or v_old->e.key is distinct from e.value;
  if p_apply and v_det_n > 0 then
    insert into ops_piece_extra(piece_id, data, source_file) values (p_piece, v_details, p_file)
    on conflict (piece_id) do update set data = ops_piece_extra.data || excluded.data, source_file = excluded.source_file, loaded_at = now();
  end if;

  -- brand barcode
  if stk_cell(x->>'brand_barcode') is not null
     and not exists (select 1 from ops_piece_codes c where c.piece_id = p_piece and c.kind = 'brand' and c.code = stk_cell(x->>'brand_barcode')) then
    v_code := true;
    if p_apply then insert into ops_piece_codes(piece_id, code, kind) values (p_piece, stk_cell(x->>'brand_barcode'), 'brand'); end if;
  end if;

  -- the arrival document: fill the piece's own one, or find / open one by supplier and invoice number
  v_fields := jsonb_strip_nulls(jsonb_build_object('supplier', stk_cell(x->>'supplier'), 'contract', stk_cell(x->>'contract'),
    'invoice_no', stk_cell(x->>'invoice_no'), 'invoice_date', stk_cell(x->>'invoice_date'), 'currency', stk_cell(x->>'currency'),
    'arrival_date', stk_cell(x->>'arrival_date'), 'customs_decl', stk_cell(x->>'customs_decl')));
  if v_fields <> '{}'::jsonb then
    v_rid := o.receipt_id;
    if v_rid is null and v_fields ? 'supplier' and v_fields ? 'invoice_no' then
      v_key := lower(v_fields->>'supplier') || '|' || lower(v_fields->>'invoice_no');
      select receipt_id into v_rid from ops_receipts where invoice_key = v_key;
    end if;
    if v_rid is null then
      v_rc := 'new';
      if p_apply then
        insert into ops_receipts(supplier, contract, invoice_no, invoice_date, currency, arrival_date, customs_decl, source_file, invoice_key)
          values (v_fields->>'supplier', v_fields->>'contract', v_fields->>'invoice_no', (v_fields->>'invoice_date')::date, v_fields->>'currency',
                  (v_fields->>'arrival_date')::date, v_fields->>'customs_decl', p_file, v_key)
          returning receipt_id into v_rid;
      end if;
    else
      select * into rc from ops_receipts where receipt_id = v_rid;
      -- a value on file stays; the file fills what is empty, and a different value is reported
      for k in select jsonb_object_keys(v_fields) loop
        if (to_jsonb(rc)->>k) is null then v_rc := coalesce(v_rc, 'fill');
        elsif (to_jsonb(rc)->>k) <> (v_fields->>k) then
          v_warn := v_warn || jsonb_build_array(jsonb_build_object('code', 'receipt_differs', 'field', k, 'on_file', to_jsonb(rc)->>k));
        end if;
      end loop;
      if p_apply and v_rc = 'fill' then
        update ops_receipts set supplier = coalesce(supplier, v_fields->>'supplier'), contract = coalesce(contract, v_fields->>'contract'),
          invoice_no = coalesce(invoice_no, v_fields->>'invoice_no'), invoice_date = coalesce(invoice_date, (v_fields->>'invoice_date')::date),
          currency = coalesce(currency, v_fields->>'currency'), arrival_date = coalesce(arrival_date, (v_fields->>'arrival_date')::date),
          customs_decl = coalesce(customs_decl, v_fields->>'customs_decl')
         where receipt_id = v_rid;
      end if;
    end if;
    if p_apply and o.receipt_id is null and v_rid is not null then update ops_pieces set receipt_id = v_rid where piece_id = p_piece; end if;
  end if;

  -- HS code and ИКПУ sit on the model
  if o.model_id is not null then
    select * into m from cat_models where model_id = o.model_id;
    if stk_cell(x->>'hs_code') is not null then
      if m.hs_code is null then v_hs := true;
      elsif m.hs_code <> stk_cell(x->>'hs_code') then v_warn := v_warn || jsonb_build_array(jsonb_build_object('code', 'hs_differs', 'on_file', m.hs_code)); end if;
    end if;
    if stk_cell(x->>'ikpu') is not null then
      if m.ikpu is null then v_ikpu := true;
      elsif m.ikpu <> stk_cell(x->>'ikpu') then v_warn := v_warn || jsonb_build_array(jsonb_build_object('code', 'ikpu_differs', 'on_file', m.ikpu)); end if;
    end if;
    if p_apply and (v_hs or v_ikpu) then
      update cat_models set hs_code = coalesce(hs_code, stk_cell(x->>'hs_code')), ikpu = coalesce(ikpu, stk_cell(x->>'ikpu')) where model_id = o.model_id;
    end if;
  elsif stk_cell(x->>'hs_code') is not null or stk_cell(x->>'ikpu') is not null then
    v_warn := v_warn || jsonb_build_array(jsonb_build_object('code', 'no_model'));
  end if;

  return jsonb_build_object('changes', jsonb_build_object('colibri_new', v_new, 'colibri_changed', v_chg, 'details', v_det_n,
           'receipt', v_rc, 'brand_code', v_code, 'hs_code', v_hs, 'ikpu', v_ikpu), 'warnings', v_warn);
end $$;
revoke execute on function public.stk_import_row(uuid, jsonb, text, boolean) from public, anon, authenticated;

-- Pending rows whose piece has arrived are applied and removed. Returns how many.
create function public.stk_apply_pending() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare u record; v_piece uuid; v_n int; n int := 0;
begin
  for u in select * from ops_upload_pending loop
    select count(*), (array_agg(o.piece_id))[1] into v_n, v_piece from ops_pieces o
     where ops_brand_key(o.brand) = u.brand_key and upper(btrim(o.serial)) = u.serial_key;
    continue when v_n <> 1;
    perform stk_import_row(v_piece, u.row, u.file_name, true);
    delete from ops_upload_pending where brand_key = u.brand_key and serial_key = u.serial_key;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.stk_apply_pending() from public, anon, authenticated;

create function public.stk_import(p jsonb, p_actor text, p_apply boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r jsonb; x jsonb; v_brand text; v_serial text; v_article text; v_n int; v_piece uuid; v_have text; v_err jsonb; v_res jsonb;
  v_rows jsonb := '[]'::jsonb; n_update int := 0; n_pending int := 0; n_error int := 0; n_same int := 0; v_file text := left(coalesce(p->>'file_name', 'upload'), 200);
  v_applied boolean := false; v_from_pending int := 0; k text; v_d date;
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
            and regexp_replace(upper(v_have), '[^0-9A-ZА-Я]', '', 'g') <> regexp_replace(upper(v_article), '[^0-9A-ZА-Я]', '', 'g') then
        -- the serial is already on a piece of another reference: almost always a typing error in the file
        v_err := v_err || jsonb_build_array(jsonb_build_object('code', 'serial_other_reference', 'on_file', v_have));
      end if;
    end if;

    if jsonb_array_length(v_err) > 0 then
      n_error := n_error + 1;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('row', r->'row', 'brand', v_brand, 'serial', v_serial, 'article', v_article, 'status', 'error', 'errors', v_err));
    elsif v_piece is null then
      n_pending := n_pending + 1;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('row', r->'row', 'brand', v_brand, 'serial', v_serial, 'article', v_article, 'status', 'pending'));
    else
      v_res := stk_import_row(v_piece, r, v_file, false);
      if v_res->'changes' = '{"colibri_new":0,"colibri_changed":0,"details":0,"receipt":null,"brand_code":false,"hs_code":false,"ikpu":false}'::jsonb then
        n_same := n_same + 1;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object('row', r->'row', 'brand', v_brand, 'serial', v_serial, 'article', v_article, 'status', 'same', 'piece_id', v_piece, 'warnings', v_res->'warnings'));
      else
        n_update := n_update + 1;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object('row', r->'row', 'brand', v_brand, 'serial', v_serial, 'article', v_article, 'status', 'update', 'piece_id', v_piece)
                                              || v_res);
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
      if v_piece is not null then
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
    'summary', jsonb_build_object('rows', jsonb_array_length(p->'rows'), 'update', n_update, 'same', n_same, 'pending', n_pending, 'error', n_error),
    'waiting', (select count(*) from ops_upload_pending));
end $$;
revoke execute on function public.stk_import(jsonb, text, boolean) from public, anon, authenticated;

-- The Origin answer also carries our own descriptive columns.
create or replace function public.stk_piece_origin(p_piece uuid, p_with_cost boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare o ops_pieces%rowtype;
begin
  select * into o from ops_pieces where piece_id = p_piece;
  if not found then return null; end if;
  return jsonb_build_object(
    'colibri', (select jsonb_build_object('data', case when p_with_cost then c.data else c.data - stk_colibri_cost_columns() end, 'source_file', c.source_file, 'loaded_at', c.loaded_at)
                  from ops_piece_colibri c where c.piece_id = p_piece),
    'receipt', (select jsonb_build_object('supplier', r.supplier, 'contract', r.contract, 'invoice_no', r.invoice_no,
                         'invoice_date', r.invoice_date, 'currency', r.currency, 'arrival_date', r.arrival_date,
                         'customs_decl', r.customs_decl, 'source_file', r.source_file)
                  from ops_receipts r where r.receipt_id = o.receipt_id),
    'codes', coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'kind', c.kind, 'active', c.active,
                         'added_at', c.added_at, 'retired_at', c.retired_at) order by c.active desc, c.kind, c.code)
                  from ops_piece_codes c where c.piece_id = p_piece), '[]'::jsonb),
    'details', (select e.data from ops_piece_extra e where e.piece_id = p_piece),
    'hs_code', (select m.hs_code from cat_models m where m.model_id = o.model_id),
    'ikpu', (select m.ikpu from cat_models m where m.model_id = o.model_id));
end $$;
revoke execute on function public.stk_piece_origin(uuid, boolean) from public, anon, authenticated;
