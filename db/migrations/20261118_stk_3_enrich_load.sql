-- Stock enrichment, slice 2: the loader behind the Colibri / 1C backfill (tools/stock_enrich_parse.py makes the payload).
-- Re-runnable: the same payload twice changes nothing the second time. Writes only to the enrichment tables,
-- plus ops_pieces.receipt_id and ops_pieces.barcode. Called by the crm-import function (service role) only.

alter table public.ops_receipts add column colibri_no text;
create unique index ops_receipts_colibri_no_key on public.ops_receipts(colibri_no) where colibri_no is not null;

create function public.stk_load_enrichment(p jsonb, p_source text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  x jsonb; v_piece uuid; v_n int; v_rc bigint; v_old jsonb; v_code text;
  n_in int := 0; n_found int := 0; n_missing int := 0; n_ambiguous int := 0;
  n_new int := 0; n_changed int := 0; n_same int := 0; n_codes int := 0; n_retired int := 0;
  n_rc_new int := 0; n_rc_upd int := 0; n_cost int := 0; n_cost_missing int := 0;
  v_missing jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p->'pieces') is distinct from 'array' then raise exception 'pieces must be a list'; end if;

  -- arrival documents, by Colibri's number; a value the payload does not know never erases one on file
  for x in select * from jsonb_array_elements(coalesce(p->'receipts', '[]'::jsonb)) loop
    continue when nullif(btrim(x->>'colibri_no'), '') is null;
    select receipt_id into v_rc from ops_receipts where colibri_no = btrim(x->>'colibri_no');
    if not found then
      insert into ops_receipts(colibri_no, supplier, contract, currency, arrival_date, source_file)
        values (btrim(x->>'colibri_no'), nullif(x->>'supplier', ''), nullif(x->>'contract', ''), nullif(x->>'currency', ''),
                nullif(x->>'arrival_date', '')::date, p_source);
      n_rc_new := n_rc_new + 1;
    else
      update ops_receipts r set supplier = coalesce(nullif(x->>'supplier', ''), r.supplier),
             contract = coalesce(nullif(x->>'contract', ''), r.contract), currency = coalesce(nullif(x->>'currency', ''), r.currency),
             arrival_date = coalesce(nullif(x->>'arrival_date', '')::date, r.arrival_date)
       where r.receipt_id = v_rc
         and (r.supplier, r.contract, r.currency, r.arrival_date) is distinct from
             (coalesce(nullif(x->>'supplier', ''), r.supplier), coalesce(nullif(x->>'contract', ''), r.contract),
              coalesce(nullif(x->>'currency', ''), r.currency), coalesce(nullif(x->>'arrival_date', '')::date, r.arrival_date));
      if found then n_rc_upd := n_rc_upd + 1; end if;
    end if;
  end loop;

  -- pieces: found by brand and serial; a serial that names two pieces is skipped, not guessed
  for x in select * from jsonb_array_elements(p->'pieces') loop
    n_in := n_in + 1;
    select count(*), (array_agg(o.piece_id))[1] into v_n, v_piece from ops_pieces o
     where ops_brand_key(o.brand) = ops_brand_key(x->>'brand') and upper(btrim(o.serial)) = upper(btrim(x->>'serial'));
    if v_n = 0 then
      n_missing := n_missing + 1;
      if jsonb_array_length(v_missing) < 50 then v_missing := v_missing || jsonb_build_array((x->>'brand') || ' ' || (x->>'serial')); end if;
      continue;
    elsif v_n > 1 or (select count(*) from jsonb_array_elements(p->'pieces') y
                       where ops_brand_key(y->>'brand') = ops_brand_key(x->>'brand') and upper(btrim(y->>'serial')) = upper(btrim(x->>'serial'))) > 1 then
      n_ambiguous := n_ambiguous + 1; continue;
    end if;
    n_found := n_found + 1;

    if jsonb_typeof(x->'data') = 'object' then
      select c.data into v_old from ops_piece_colibri c where c.piece_id = v_piece;
      if not found then
        insert into ops_piece_colibri(piece_id, data, source_file) values (v_piece, x->'data', p_source); n_new := n_new + 1;
      elsif v_old is distinct from x->'data' then
        update ops_piece_colibri set data = x->'data', source_file = p_source, loaded_at = now() where piece_id = v_piece; n_changed := n_changed + 1;
      else n_same := n_same + 1;
      end if;
    end if;

    v_code := nullif(btrim(x->>'barcode'), '');
    if v_code is not null then
      insert into ops_piece_codes(piece_id, code, kind) values (v_piece, v_code, 'colibri') on conflict (piece_id, kind, code) do nothing;
      if found then n_codes := n_codes + 1; end if;
      update ops_piece_codes set active = true, retired_at = null where piece_id = v_piece and kind = 'colibri' and code = v_code and not active;
      update ops_piece_codes set active = false, retired_at = now() where piece_id = v_piece and kind = 'colibri' and code <> v_code and active;
      get diagnostics v_n = row_count; n_retired := n_retired + v_n;
      update ops_pieces set barcode = v_code where piece_id = v_piece and barcode is distinct from v_code;
    end if;

    if nullif(btrim(x->>'receipt_no'), '') is not null then
      update ops_pieces o set receipt_id = r.receipt_id from ops_receipts r
       where o.piece_id = v_piece and r.colibri_no = btrim(x->>'receipt_no') and o.receipt_id is distinct from r.receipt_id;
    end if;
  end loop;

  -- costs: one per piece, replaced whole
  for x in select * from jsonb_array_elements(coalesce(p->'costs', '[]'::jsonb)) loop
    select count(*), (array_agg(o.piece_id))[1] into v_n, v_piece from ops_pieces o
     where ops_brand_key(o.brand) = ops_brand_key(x->>'brand') and upper(btrim(o.serial)) = upper(btrim(x->>'serial'));
    if v_n <> 1 then n_cost_missing := n_cost_missing + 1; continue; end if;
    insert into ops_piece_costs(piece_id, invoice_price, currency, fx_rate, invoice_uzs, customs_vat_uzs, clearance_uzs, assay_uzs,
                                customs_fee_uzs, other_uzs, landed_uzs, match_quality, source_file)
      values (v_piece, (x->>'invoice_price')::numeric, nullif(x->>'currency', ''), (x->>'fx_rate')::numeric, (x->>'invoice_uzs')::numeric,
              (x->>'customs_vat_uzs')::numeric, (x->>'clearance_uzs')::numeric, (x->>'assay_uzs')::numeric,
              (x->>'customs_fee_uzs')::numeric, (x->>'other_uzs')::numeric, (x->>'landed_uzs')::numeric, x->>'match_quality', x->>'source_file')
    on conflict (piece_id) do update set invoice_price = excluded.invoice_price, currency = excluded.currency, fx_rate = excluded.fx_rate,
      invoice_uzs = excluded.invoice_uzs, customs_vat_uzs = excluded.customs_vat_uzs, clearance_uzs = excluded.clearance_uzs,
      assay_uzs = excluded.assay_uzs, customs_fee_uzs = excluded.customs_fee_uzs, other_uzs = excluded.other_uzs,
      landed_uzs = excluded.landed_uzs, match_quality = excluded.match_quality, source_file = excluded.source_file, updated_at = now();
    n_cost := n_cost + 1;
  end loop;

  return jsonb_build_object('pieces_in', n_in, 'pieces_found', n_found, 'pieces_not_in_stock_tool', n_missing, 'pieces_ambiguous', n_ambiguous,
    'not_found_sample', v_missing, 'colibri_new', n_new, 'colibri_changed', n_changed, 'colibri_same', n_same,
    'codes_added', n_codes, 'codes_retired', n_retired, 'receipts_new', n_rc_new, 'receipts_updated', n_rc_upd,
    'costs_set', n_cost, 'costs_without_piece', n_cost_missing);
end $$;
revoke execute on function public.stk_load_enrichment(jsonb, text) from public, anon, authenticated;
