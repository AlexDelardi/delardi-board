-- Stock import: fixes after the Codex review of #18.
--  1. A waiting row is applied only to a piece of the same reference (as a direct import already requires).
--  2. Attaching a piece to an arrival document that needs no edit is reported as a change ('link'), so it can be loaded.

create or replace function public.stk_import_row(p_piece uuid, r jsonb, p_file text, p_apply boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o ops_pieces%rowtype; x jsonb := coalesce(r->'extra', '{}'::jsonb); v_old jsonb; v_in jsonb; v_new int := 0; v_chg int := 0;
  v_details jsonb; v_det_n int := 0; v_rc text; v_code boolean := false; v_hs boolean := false; v_ikpu boolean := false;
  v_warn jsonb := '[]'::jsonb; rc ops_receipts%rowtype; m cat_models%rowtype; v_key text; v_rid bigint; k text;
  v_fields jsonb; v_fill boolean := false;
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
      -- the piece is not on this document yet: attaching it is a change even when the document needs no edit
      if o.receipt_id is null then v_rc := 'link'; end if;
      -- a value on file stays; the file fills what is empty, and a different value is reported
      for k in select jsonb_object_keys(v_fields) loop
        if (to_jsonb(rc)->>k) is null then v_fill := true; if v_rc is null then v_rc := 'fill'; end if;
        elsif (to_jsonb(rc)->>k) <> (v_fields->>k) then
          v_warn := v_warn || jsonb_build_array(jsonb_build_object('code', 'receipt_differs', 'field', k, 'on_file', to_jsonb(rc)->>k));
        end if;
      end loop;
      if p_apply and v_fill then
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

create or replace function public.stk_apply_pending() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare u record; v_piece uuid; v_n int; n int := 0; v_have text; v_want text;
begin
  for u in select * from ops_upload_pending loop
    select count(*), (array_agg(o.piece_id))[1], (array_agg(o.article))[1] into v_n, v_piece, v_have from ops_pieces o
     where ops_brand_key(o.brand) = u.brand_key and upper(btrim(o.serial)) = u.serial_key;
    continue when v_n <> 1;
    -- the same rule as a direct import: never onto a piece of another reference; the row keeps waiting
    v_want := stk_cell(u.row->'colibri'->>'Артикул');
    continue when v_want is not null and v_have is not null
      and regexp_replace(upper(v_have), '[^0-9A-ZА-Я]', '', 'g') <> regexp_replace(upper(v_want), '[^0-9A-ZА-Я]', '', 'g');
    perform stk_import_row(v_piece, u.row, u.file_name, true);
    delete from ops_upload_pending where brand_key = u.brand_key and serial_key = u.serial_key;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.stk_apply_pending() from public, anon, authenticated;
