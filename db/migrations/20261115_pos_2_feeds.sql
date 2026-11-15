-- POS 2: Colibri feeds. The stock load carries barcodes; once the sales tool is live (pos_settings.go_live_date) the
-- ticket loader and the CRM purchase import refuse what the tool owns, and a serial the tool sold is not re-created
-- from the stock load. Spec: docs/specs (sales tool design); plan Task 2. Test: db/tests/pos_t2_feeds.sql.
-- Each function is re-created whole from its latest definition; only the changes below differ:
--   cat_load            from 20261112_s2_cat_load_v2.sql: pieces recordset gains barcode, written to cat_pieces.barcode
--   ops_sync_pieces     from 20261113_s3_4_sync_ticket_rule.sql: barcode carried to ops_pieces (kept when a load has none);
--                       a loaded serial that a Delardi-tool ticket sold is not created, raises a ticket_conflict review
--                       on the sold piece (once), and is counted in the new result key sold_by_us_in_load
--   ops_load_tickets    from 20261114_s3_5_loader_polish.sql: tickets dated on or after go_live_date are skipped and
--                       listed in the new result key refused_after_go_live
--   crm_import_apply    from db/schema.sql: staged purchase lines dated on or after go_live_date are not applied; the
--                       result gains refused_after_go_live (count)

create or replace function public.cat_load(p jsonb, p_source text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
 set statement_timeout to '120s'
as $function$
declare run_id bigint; c jsonb; v_models_removed int; v_photos_unlinked int; v_variants_removed int;
  v_variants_kept int; v_ops jsonb;
begin
  perform set_config('cat.skip_v2', 'on', true);  -- one v2 rebuild at load end, not inside the mid-load overlay
  insert into cat_import_runs(source_file, source_built, notes)
    values (p_source, p->>'built', 'full load') returning id into run_id;

  create temp table _load_variant_ids on commit drop as
    select distinct e->>'variant_id' variant_id from jsonb_array_elements(p->'variants') e;

  delete from cat_links where true;
  delete from cat_attributes a where a.variant_id in (select variant_id from _load_variant_ids);
  delete from cat_pieces where true;
  delete from cat_expected_keys where true;

  -- models still shipping (cat_incoming) are kept, with their photos, until Colibri has them
  create temp table _load_models_gone on commit drop as
    select model_id from cat_models
     where model_id not in (select e->>'model_id' from jsonb_array_elements(p->'models') e)
       and model_id not in (select model_id from cat_incoming);
  v_models_removed := (select count(*) from _load_models_gone);
  v_photos_unlinked := (select count(*) from cat_photos where model_id in (select model_id from _load_models_gone));
  delete from cat_models where model_id in (select model_id from _load_models_gone);

  insert into cat_models
    select (r).* from (select jsonb_populate_record(null::cat_models,
      e || jsonb_build_object('import_run', run_id, 'updated_at', now(), 'search_text', '')) r
      from jsonb_array_elements(p->'models') e) s
  on conflict (model_id) do update set
    article = excluded.article, brand = excluded.brand, brand_raw = excluded.brand_raw, category = excluded.category,
    retail_category = excluded.retail_category, subcategory = excluded.subcategory, collection = excluded.collection,
    model_name = excluded.model_name, gender = excluded.gender, material = excluded.material,
    name_en = excluded.name_en, name_ru = excluded.name_ru, in_stock = excluded.in_stock,
    qty_stock = excluded.qty_stock, price_min_uzs = excluded.price_min_uzs, price_max_uzs = excluded.price_max_uzs,
    latest_arrival_year = excluded.latest_arrival_year, arrival_years = excluded.arrival_years,
    variant_count = excluded.variant_count, completeness = excluded.completeness,
    missing_crucial = excluded.missing_crucial, has_unconfirmed = excluded.has_unconfirmed,
    import_run = excluded.import_run, updated_at = excluded.updated_at;

  insert into cat_variants
    select (r).* from (select jsonb_populate_record(null::cat_variants,
      e || jsonb_build_object('import_run', run_id, 'updated_at', now())) r
      from jsonb_array_elements(p->'variants') e) s
  on conflict (variant_id) do update set
    model_id = excluded.model_id, colour_code = excluded.colour_code, colour_name_en = excluded.colour_name_en,
    colour_name_ru = excluded.colour_name_ru, material = excluded.material, in_stock = excluded.in_stock,
    qty_stock = excluded.qty_stock, qty_in = excluded.qty_in, qty_sold = excluded.qty_sold,
    price_uzs = excluded.price_uzs, arrival_years = excluded.arrival_years,
    description_ru = excluded.description_ru, description_en = excluded.description_en,
    found_online = excluded.found_online, confidence = excluded.confidence, sources = excluded.sources,
    conflicts = excluded.conflicts, notes = excluded.notes, sort_order = excluded.sort_order,
    import_run = excluded.import_run, updated_at = excluded.updated_at, qty_transit = excluded.qty_transit;

  insert into cat_pieces(serial, variant_id, size, price_uzs, import_run, barcode)
    select x.serial, x.variant_id, x.size, x.price_uzs, run_id, nullif(btrim(x.barcode), '')
    from jsonb_to_recordset(p->'pieces') as x(serial text, variant_id text, size text, price_uzs bigint, barcode text);

  -- variants Colibri no longer sends: removed if nothing points at them, else kept and out of stock
  delete from cat_variants v
   where v.variant_id not in (select variant_id from _load_variant_ids)
     and not exists (select 1 from cat_pieces x where x.variant_id = v.variant_id)
     and not exists (select 1 from cat_incoming x where x.variant_id = v.variant_id)
     and not exists (select 1 from cat_reports x where x.variant_id = v.variant_id)
     and not exists (select 1 from cat_overlay x where x.variant_id = v.variant_id);
  get diagnostics v_variants_removed = row_count;
  update cat_variants v set in_stock = false, qty_stock = 0
   where v.variant_id not in (select variant_id from _load_variant_ids)
     and not exists (select 1 from cat_incoming x where x.variant_id = v.variant_id)
     and (v.in_stock or v.qty_stock <> 0);
  v_variants_kept := (select count(*) from cat_variants where variant_id not in (select variant_id from _load_variant_ids));

  insert into cat_attributes(variant_id, key, value, value_num, flag, import_run)
    select x.variant_id, x.key, x.value, x.value_num, x.flag, run_id
    from jsonb_to_recordset(p->'attributes') as x(variant_id text, key text, value text, value_num numeric, flag text);
  insert into cat_links select * from jsonb_populate_recordset(null::cat_links, p->'links');
  insert into cat_expected_keys select * from jsonb_populate_recordset(null::cat_expected_keys, p->'expected');
  perform cat_merge_sizes();       -- one model per design: size-coded references fold into it
  perform cat_apply_incoming();    -- pieces shipped but not in Colibri yet: "in transit"
  perform cat_apply_overlay();     -- brand-catalogue values (brand wins) survive every reload
  perform cat_rebuild_search();
  perform cat_rebuild_facets();
  perform cat_rebuild_facets_v2_safe();   -- keep the v2 filter cache in step with this load
  perform cat_link_transactions();   -- CRM purchase lines follow the new catalogue
  v_ops := ops_sync_pieces(run_id);  -- piece register follows the new catalogue (S2 §7)
  c := jsonb_build_object(
    'models', (select count(*) from cat_models), 'variants', (select count(*) from cat_variants),
    'pieces', (select count(*) from cat_pieces), 'attributes', (select count(*) from cat_attributes),
    'links', (select count(*) from cat_links), 'expected', (select count(*) from cat_expected_keys),
    'overlay', (select count(*) from cat_overlay),
    'in_transit', (select coalesce(sum(qty_transit),0) from cat_variants),
    'models_removed', v_models_removed, 'photos_unlinked', v_photos_unlinked,
    'variants_removed', v_variants_removed, 'variants_kept_not_in_load', v_variants_kept,
    'ops', v_ops);
  update cat_import_runs set counts = c where id = run_id;
  drop table _load_variant_ids;
  drop table _load_models_gone;
  return c || jsonb_build_object('run', run_id);
end $function$;

CREATE OR REPLACE FUNCTION public.ops_sync_pieces(p_run bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_arrived int := 0; v_transit int := 0; v_refreshed int := 0; v_raised int := 0; v_closed int := 0; n int;
  v_ours int := 0;
begin
  -- this load: stock first, then incoming serials that are not in stock
  create temp table ops_sync_load on commit drop as
  select distinct on (l.brand, l.k) l.*
    from (
      select m.brand, upper(btrim(p.serial)) k, btrim(p.serial) serial, m.article, m.model_id,
             p.variant_id, p.size, null::date shipped_on, 'in_stock' src, 1 pri, p.barcode
        from cat_pieces p
        join cat_variants v on v.variant_id = p.variant_id
        join cat_models   m on m.model_id   = v.model_id
      union all
      select m.brand, upper(btrim(i.serial)), btrim(i.serial), coalesce(i.article, m.article), m.model_id,
             i.variant_id, i.size, i.shipped_on, 'in_transit', 2, null::text
        from cat_incoming i
        left join cat_variants v on v.variant_id = i.variant_id
        join cat_models m on m.model_id = coalesce(i.model_id, v.model_id)
       where not exists (select 1 from cat_pieces s where upper(btrim(s.serial)) = upper(btrim(i.serial)))
    ) l
   order by l.brand, l.k, l.pri;

  -- 1. in transit, now in stock → arrived
  with moved as (
    update ops_pieces o set state = 'in_stock', state_since = now(), updated_at = now()
      from ops_sync_load l
     where o.state = 'in_transit' and l.src = 'in_stock'
       and o.brand = l.brand and upper(btrim(o.serial)) = l.k
    returning o.piece_id)
  insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor)
  select piece_id, 'in_transit', 'in_stock', 'arrived', 'cat_run', p_run::text, 'catalogue load' from moved;
  get diagnostics v_arrived = row_count;

  -- 2. refresh every live piece in this load (never its state)
  update ops_pieces o
     set article = l.article, model_id = l.model_id, variant_id = l.variant_id, size = l.size,
         shipped_on = coalesce(l.shipped_on, o.shipped_on), barcode = coalesce(l.barcode, o.barcode),
         last_seen_run = p_run, last_seen_at = now()
    from ops_sync_load l
   where o.state not in ('sold', 'not_received') and o.brand = l.brand and upper(btrim(o.serial)) = l.k;
  get diagnostics v_refreshed = row_count;

  -- 3. auto-close reviews that no longer apply
  update ops_review r
     set status = 'auto_closed', resolved_at = now(), resolved_by = 'catalogue load'
    from ops_pieces o
   where r.piece_id = o.piece_id and r.status = 'open'
     and o.state not in ('sold', 'not_received')
     and ((r.kind in ('missing_from_export', 'dropped_from_incoming')
           and exists (select 1 from ops_sync_load l where l.brand = o.brand and l.k = upper(btrim(o.serial))))
       or (r.kind = 'overdue_in_transit' and o.state <> 'in_transit'));
  get diagnostics v_closed = row_count;

  -- 4. new pieces (no live piece with this brand + serial)
  -- a loaded serial whose piece the Delardi sales tool sold (and no live piece holds it): not created, not re-opened
  create temp table ops_sync_ours on commit drop as
  select distinct on (l.brand, l.k) l.brand, l.k, l.serial, o.piece_id, t.ticket_no
    from ops_sync_load l
    join ops_pieces o on o.state = 'sold' and o.brand = l.brand and upper(btrim(o.serial)) = l.k
    join ops_ticket_lines tl on tl.line_id = o.sold_line_id
    join ops_tickets t on t.ticket_id = tl.ticket_id and t.source = 'delardi'
   where not exists (select 1 from ops_pieces x
                      where x.state not in ('sold', 'not_received') and x.brand = l.brand and upper(btrim(x.serial)) = l.k)
   order by l.brand, l.k, o.state_since desc nulls last;
  v_ours := (select count(*) from ops_sync_ours);
  insert into ops_review(piece_id, kind, raised_run, note)
  select u.piece_id, 'ticket_conflict', p_run, format('serial %s is in the stock load but was sold on %s', u.serial, u.ticket_no)
    from ops_sync_ours u
   where not exists (select 1 from ops_review r where r.piece_id = u.piece_id and r.kind = 'ticket_conflict' and r.status = 'open');
  get diagnostics n = row_count;
  v_raised := v_raised + n;

  create temp table ops_sync_new on commit drop as
  select l.* from ops_sync_load l
   where not exists (select 1 from ops_pieces o
                      where o.state not in ('sold', 'not_received') and o.brand = l.brand and upper(btrim(o.serial)) = l.k)
     and not exists (select 1 from ops_sync_ours u where u.brand = l.brand and u.k = l.k);
  v_raised := v_raised + (select count(*) from ops_sync_new l
                           where exists (select 1 from ops_pieces o where o.state in ('sold', 'not_received')
                                            and o.brand = l.brand and upper(btrim(o.serial)) = l.k));
  with ins as (
    insert into ops_pieces(store_id, brand, serial, article, model_id, variant_id, size, state, shipped_on,
                           last_seen_run, last_seen_at, barcode)
    select 1, brand, serial, article, model_id, variant_id, size, src, shipped_on, p_run, now(), barcode from ops_sync_new
    returning piece_id, state, brand, serial)
  , ev as (
    insert into ops_piece_events(piece_id, from_state, to_state, reason, ref_kind, ref_id, actor)
    select piece_id, null, state, case when state = 'in_stock' then 'arrived' else 'initial_load' end,
           'cat_run', p_run::text, 'catalogue load' from ins
    returning piece_id)
  insert into ops_review(piece_id, kind, raised_run, note)
  select i.piece_id, 'serial_reused', p_run, 'serial was sold or not received before'
    from ins i
   where exists (select 1 from ops_pieces o where o.state in ('sold', 'not_received') and o.brand = i.brand
                                              and upper(btrim(o.serial)) = upper(btrim(i.serial)));
  v_arrived := v_arrived + (select count(*) from ops_sync_new where src = 'in_stock');
  v_transit := (select count(*) from ops_sync_new where src = 'in_transit');

  -- 5. live pieces on the floor not in this load and held by no ticket line → review (once)
  insert into ops_review(piece_id, kind, raised_run)
  select o.piece_id, 'missing_from_export', p_run
    from ops_pieces o
   where o.state in ('in_stock', 'reserved', 'booked_out', 'damaged')
     and not exists (select 1 from ops_sync_load l where l.brand = o.brand and l.k = upper(btrim(o.serial)))
     and not exists (select 1 from ops_ticket_lines t where t.piece_id = o.piece_id)
     and not exists (select 1 from ops_review r
                      where r.piece_id = o.piece_id and r.kind = 'missing_from_export' and r.status = 'open');
  get diagnostics n = row_count;
  v_raised := v_raised + n;

  -- 6. in transit but gone from the incoming list without arriving → review (once)
  insert into ops_review(piece_id, kind, raised_run)
  select o.piece_id, 'dropped_from_incoming', p_run
    from ops_pieces o
   where o.state = 'in_transit'
     and not exists (select 1 from ops_sync_load l where l.brand = o.brand and l.k = upper(btrim(o.serial)))
     and not exists (select 1 from ops_review r
                      where r.piece_id = o.piece_id and r.kind = 'dropped_from_incoming' and r.status = 'open');
  get diagnostics n = row_count;
  v_raised := v_raised + n;

  -- 7. in transit > 60 days after shipment (or first sighting) → review; after "still coming", 60 days after the answer
  insert into ops_review(piece_id, kind, raised_run)
  select o.piece_id, 'overdue_in_transit', p_run
    from ops_pieces o
   where o.state = 'in_transit'
     and coalesce(o.shipped_on, o.first_seen_at::date) < current_date - 60
     and not exists (select 1 from ops_review r
                      where r.piece_id = o.piece_id and r.kind in ('overdue_in_transit', 'dropped_from_incoming')
                        and (r.status = 'open' or r.resolved_at > now() - interval '60 days'));
  get diagnostics n = row_count;
  v_raised := v_raised + n;

  drop table ops_sync_load;
  drop table ops_sync_new;
  drop table ops_sync_ours;
  return jsonb_build_object('arrived', v_arrived, 'in_transit', v_transit, 'refreshed', v_refreshed,
                            'review_raised', v_raised, 'review_closed', v_closed,
                            'sold_by_us_in_load', v_ours);
end $$;

revoke execute on function public.ops_sync_pieces(bigint) from public, anon, authenticated;

create or replace function public.ops_load_tickets(p jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp set statement_timeout to '120s' as $$
declare
  v_t jsonb; v_l jsonb; v_no text; v_tid uuid; v_status text; v_sold_at date;
  v_seller_raw text; v_seller text; v_new ops_ticket_lines; v_old ops_ticket_lines;
  v_same boolean; v_n int; v_model text; v_variant text; v_pieces uuid[]; v_line record;
  v_old_sold_at date; v_remap boolean; v_piece uuid;
  n_new int := 0; n_changed int := 0; n_same int := 0; n_lines int := 0; n_pay int := 0; n_sold int := 0;
  n_crm int := 0; n_remap int := 0;
  v_unmapped text[] := '{}'; v_mixed text[] := '{}'; v_changed text[] := '{}'; v_unmatched text[] := '{}';
  v_ambiguous text[] := '{}';
  v_match jsonb := '{}'; v_last_run date; v_golive date; v_refused text[] := '{}';
begin
  if p_actor is null or btrim(p_actor) = '' then raise exception 'actor required'; end if;
  v_last_run := (select (max(run_at) at time zone 'Asia/Tashkent')::date from cat_import_runs);
  v_golive := (select go_live_date from pos_settings where id = 1);

  for v_t in select value from jsonb_array_elements(coalesce(p->'tickets', '[]'::jsonb)) loop
    v_no := v_t->>'ticket_no';
    v_sold_at := (v_t->>'sold_at')::date;
    -- from the go-live date the Delardi sales tool owns the tickets: the Colibri export may not write them
    if v_golive is not null and v_sold_at >= v_golive then
      v_refused := v_refused || v_no;
      continue;
    end if;

    -- seller: the lowest line_no's seller when lines carry one, else the ticket's; mapped alias first, then a rep's name
    v_seller_raw := coalesce(
      (select x->>'seller_raw' from jsonb_array_elements(coalesce(v_t->'lines', '[]'::jsonb)) x
        order by (x->>'line_no')::int limit 1),
      v_t->>'seller_raw');
    v_seller := coalesce(
      (select a.source_name from crm_rep_aliases a where lower(btrim(a.alias)) = lower(btrim(v_seller_raw))
        order by a.alias limit 1),
      (select s.source_name from crm_sales_reps s where s.source_name = btrim(v_seller_raw)));
    if v_seller is null and v_seller_raw is not null and not (btrim(v_seller_raw) = any (v_unmapped)) then
      v_unmapped := v_unmapped || btrim(v_seller_raw);
    end if;
    if (select count(distinct lower(btrim(x->>'seller_raw')))
          from jsonb_array_elements(coalesce(v_t->'lines', '[]'::jsonb)) x) > 1 then
      v_mixed := v_mixed || v_no;
    end if;

    select ticket_id, status, sold_at into v_tid, v_status, v_old_sold_at
      from ops_tickets where store_id = 1 and source = 'colibri' and ticket_no = v_no;

    if v_tid is null then
      insert into ops_tickets(store_id, source, ticket_no, sold_at, seller, seller_raw, client_raw, note, source_file)
      values (1, 'colibri', v_no, v_sold_at, v_seller, v_seller_raw, v_t->>'client_raw', v_t->>'note', v_t->>'source_file')
      returning ticket_id, status into v_tid, v_status;
      n_new := n_new + 1;
      v_same := false;
    else
      -- same content? A sold line that the export now shows with another serial or kind, or no longer shows, is kept
      -- as is (below); once its conflict review has been raised (same note, open or resolved) it counts as same.
      v_same := (select (t.sold_at, t.seller_raw, t.client_raw, t.note)
                        is not distinct from (v_sold_at, v_seller_raw, v_t->>'client_raw', v_t->>'note')
                   from ops_tickets t where t.ticket_id = v_tid)
        and not exists (
              select 1 from ops_ticket_lines o
               where o.ticket_id = v_tid
                 and not exists (select 1 from jsonb_array_elements(coalesce(v_t->'lines', '[]'::jsonb)) x
                                  where (x->>'line_no')::int = o.line_no)
                 and not (o.piece_id is not null and exists (
                            select 1 from ops_review r
                             where r.piece_id = o.piece_id and r.kind = 'ticket_conflict'
                               and (r.status = 'open'
                                    or r.note = format('ticket %s line %s sold this piece but is missing from the sales '
                                                       'export', v_no, o.line_no)))))
        and not exists (
              select 1 from jsonb_array_elements(coalesce(v_t->'lines', '[]'::jsonb)) x
               cross join lateral jsonb_populate_record(null::ops_ticket_lines,
                            x || jsonb_build_object('extra', jsonb_build_object('sk', x->'sk', 'vip', x->'vip'))) n
               where not exists (
                       select 1 from ops_ticket_lines o
                        where o.ticket_id = v_tid and o.line_no = n.line_no
                          and ((o.kind, o.article, o.colour, o.item_name, o.size, o.qty, o.price_list, o.price_current,
                                o.discount_pct, o.discount_amt, o.net, o.brand_raw, o.serial_raw, o.extra)
                               is not distinct from
                               (n.kind, n.article, n.colour, n.item_name, n.size, n.qty, n.price_list, n.price_current,
                                n.discount_pct, n.discount_amt, n.net, n.brand_raw, n.serial_raw, n.extra)
                               or (o.piece_id is not null
                                   and (upper(btrim(o.serial_raw)) is distinct from upper(btrim(n.serial_raw))
                                        or o.kind is distinct from n.kind)
                                   and exists (
                                         select 1 from ops_review r
                                          where r.piece_id = o.piece_id and r.kind = 'ticket_conflict'
                                            and (r.status = 'open'
                                                 or r.note = format('ticket %s line %s sold this piece but the sales '
                                                                    'export now shows serial %s (%s)', v_no, o.line_no,
                                                                    coalesce(n.serial_raw, 'none'), n.kind)))))))
        and not exists (
              (select method, amount from ops_ticket_payments where ticket_id = v_tid
               except all
               select x.method, x.amount::numeric(14,0)
                 from jsonb_to_recordset(coalesce(v_t->'payments', '[]'::jsonb)) x(method text, amount numeric))
              union all
              (select x.method, x.amount::numeric(14,0)
                 from jsonb_to_recordset(coalesce(v_t->'payments', '[]'::jsonb)) x(method text, amount numeric)
               except all
               select method, amount from ops_ticket_payments where ticket_id = v_tid));

      if v_same then
        n_same := n_same + 1;
        -- refresh the mappings: seller, and each line's model/variant (same per-run cache as below)
        v_remap := false;
        update ops_tickets set seller = v_seller, updated_at = now()
         where ticket_id = v_tid and seller is distinct from v_seller;
        if found then v_remap := true; end if;
        for v_old in select o.* from ops_ticket_lines o where o.ticket_id = v_tid order by o.line_no loop
          v_model := null; v_variant := null;
          if v_old.article is not null then
            if v_match ? v_old.article then
              v_model := v_match->v_old.article->>0; v_variant := v_match->v_old.article->>1;
            else
              select m.model_id, m.variant_id into v_model, v_variant from cat_match_article(v_old.article) m;
              if v_model is null then v_variant := null; end if;
              v_match := v_match || jsonb_build_object(v_old.article, jsonb_build_array(v_model, v_variant));
            end if;
          end if;
          if (v_old.model_id, v_old.variant_id) is distinct from (v_model, v_variant) then
            update ops_ticket_lines set model_id = v_model, variant_id = v_variant where line_id = v_old.line_id;
            v_remap := true;
          end if;
        end loop;
        if v_remap then n_remap := n_remap + 1; end if;
      else
        n_changed := n_changed + 1;
        v_changed := v_changed || v_no;
        -- moved to an earlier date after it sold pieces: flag each piece (the date is still updated)
        if v_sold_at < v_old_sold_at then
          for v_piece in
            select distinct o.piece_id from ops_ticket_lines o where o.ticket_id = v_tid and o.piece_id is not null
          loop
            insert into ops_review(piece_id, kind, note)
            select v_piece, 'ticket_conflict',
                   format('ticket %s date moved from %s to %s after it sold this piece', v_no,
                          to_char(v_old_sold_at, 'YYYY-MM-DD'), to_char(v_sold_at, 'YYYY-MM-DD'))
             where not exists (select 1 from ops_review r
                                where r.piece_id = v_piece and r.kind = 'ticket_conflict' and r.status = 'open');
          end loop;
        end if;
        update ops_tickets
           set sold_at = v_sold_at, seller = v_seller, seller_raw = v_seller_raw, client_raw = v_t->>'client_raw',
               note = v_t->>'note', source_file = v_t->>'source_file', updated_at = now()
         where ticket_id = v_tid;

        -- stored lines that vanished from the payload: sold lines stay and are flagged, others go
        for v_old in
          select o.* from ops_ticket_lines o
           where o.ticket_id = v_tid
             and not exists (select 1 from jsonb_array_elements(coalesce(v_t->'lines', '[]'::jsonb)) x
                              where (x->>'line_no')::int = o.line_no)
        loop
          if v_old.piece_id is null then
            select count(*) into v_n from crm_transactions where ticket_line_id = v_old.line_id;
            n_crm := n_crm + v_n;
            delete from ops_ticket_lines where line_id = v_old.line_id;
          else
            insert into ops_review(piece_id, kind, note)
            select v_old.piece_id, 'ticket_conflict',
                   format('ticket %s line %s sold this piece but is missing from the sales export', v_no, v_old.line_no)
             where not exists (select 1 from ops_review r
                                where r.piece_id = v_old.piece_id and r.kind = 'ticket_conflict' and r.status = 'open');
          end if;
        end loop;

        delete from ops_ticket_payments where ticket_id = v_tid;
      end if;
    end if;

    if not v_same then
      -- lines: insert new, update changed in place, keep sold lines whose serial or kind would change
      for v_l in select value from jsonb_array_elements(coalesce(v_t->'lines', '[]'::jsonb)) loop
        v_new := jsonb_populate_record(null::ops_ticket_lines,
                   v_l || jsonb_build_object('extra', jsonb_build_object('sk', v_l->'sk', 'vip', v_l->'vip')));
        v_model := null; v_variant := null;
        if v_new.article is not null then
          if v_match ? v_new.article then
            v_model := v_match->v_new.article->>0; v_variant := v_match->v_new.article->>1;
          else
            select m.model_id, m.variant_id into v_model, v_variant from cat_match_article(v_new.article) m;
            if v_model is null then v_variant := null; end if;
            v_match := v_match || jsonb_build_object(v_new.article, jsonb_build_array(v_model, v_variant));
          end if;
        end if;

        select * into v_old from ops_ticket_lines where ticket_id = v_tid and line_no = v_new.line_no;
        if not found then
          insert into ops_ticket_lines(ticket_id, line_no, kind, article, colour, item_name, size, model_id, variant_id,
                                       serial_raw, brand_raw, qty, price_list, price_current, discount_pct, discount_amt,
                                       net, extra)
          values (v_tid, v_new.line_no, v_new.kind, v_new.article, v_new.colour, v_new.item_name, v_new.size, v_model,
                  v_variant, v_new.serial_raw, v_new.brand_raw, v_new.qty, v_new.price_list, v_new.price_current,
                  v_new.discount_pct, v_new.discount_amt, v_new.net, v_new.extra);
          n_lines := n_lines + 1;
        elsif (v_old.kind, v_old.article, v_old.colour, v_old.item_name, v_old.size, v_old.qty, v_old.price_list,
               v_old.price_current, v_old.discount_pct, v_old.discount_amt, v_old.net, v_old.brand_raw, v_old.serial_raw,
               v_old.extra)
              is distinct from
              (v_new.kind, v_new.article, v_new.colour, v_new.item_name, v_new.size, v_new.qty, v_new.price_list,
               v_new.price_current, v_new.discount_pct, v_new.discount_amt, v_new.net, v_new.brand_raw, v_new.serial_raw,
               v_new.extra) then
          if v_old.piece_id is not null
             and (upper(btrim(v_old.serial_raw)) is distinct from upper(btrim(v_new.serial_raw))
                  or v_old.kind is distinct from v_new.kind) then
            insert into ops_review(piece_id, kind, note)
            select v_old.piece_id, 'ticket_conflict',
                   format('ticket %s line %s sold this piece but the sales export now shows serial %s (%s)',
                          v_no, v_old.line_no, coalesce(v_new.serial_raw, 'none'), v_new.kind)
             where not exists (select 1 from ops_review r
                                where r.piece_id = v_old.piece_id and r.kind = 'ticket_conflict' and r.status = 'open');
          else
            update ops_ticket_lines
               set kind = v_new.kind, article = v_new.article, colour = v_new.colour, item_name = v_new.item_name,
                   size = v_new.size, model_id = v_model, variant_id = v_variant, serial_raw = v_new.serial_raw,
                   brand_raw = v_new.brand_raw, qty = v_new.qty, price_list = v_new.price_list,
                   price_current = v_new.price_current, discount_pct = v_new.discount_pct,
                   discount_amt = v_new.discount_amt, net = v_new.net, extra = v_new.extra
             where line_id = v_old.line_id;
            n_lines := n_lines + 1;
          end if;
        end if;
      end loop;

      insert into ops_ticket_payments(ticket_id, method, amount, raw)
      select v_tid, x.method, x.amount, x.raw
        from jsonb_to_recordset(coalesce(v_t->'payments', '[]'::jsonb)) x(method text, amount numeric, raw text);
      get diagnostics v_n = row_count;
      n_pay := n_pay + v_n;
    end if;

    -- piece rule: sale lines with a serial and no piece, on posted tickets
    if v_status = 'posted' then
      for v_line in
        select l.line_id, l.brand_raw, l.serial_raw from ops_ticket_lines l
         where l.ticket_id = v_tid and l.kind = 'sale' and l.serial_raw is not null and btrim(l.serial_raw) <> ''
           and l.piece_id is null
         order by l.line_no
      loop
        select array_agg(o.piece_id) into v_pieces
          from ops_pieces o join cat_import_runs c on c.id = o.last_seen_run
         where o.store_id = 1
           and ops_brand_key(o.brand) = ops_brand_key(v_line.brand_raw)
           and upper(btrim(o.serial)) = upper(btrim(v_line.serial_raw))
           and o.state not in ('sold', 'not_received')
           and v_sold_at >= (c.run_at at time zone 'Asia/Tashkent')::date;
        if cardinality(v_pieces) = 1 then
          update ops_ticket_lines set piece_id = v_pieces[1] where line_id = v_line.line_id;
          perform ops_apply_ticket_line(v_line.line_id, p_actor);
          if exists (select 1 from ops_pieces where piece_id = v_pieces[1] and sold_line_id = v_line.line_id) then
            n_sold := n_sold + 1;
          end if;
        elsif cardinality(v_pieces) > 1 and not (v_no = any (v_ambiguous)) then
          v_ambiguous := v_ambiguous || v_no;
        end if;
      end loop;

      if v_sold_at >= v_last_run and not (v_no = any (v_unmatched)) and exists (
           select 1 from ops_ticket_lines l
            where l.ticket_id = v_tid and l.kind = 'sale' and l.serial_raw is not null and btrim(l.serial_raw) <> ''
              and l.piece_id is null) then
        v_unmatched := v_unmatched || v_no;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'tickets_new', n_new, 'tickets_changed', n_changed, 'tickets_same', n_same,
    'lines', n_lines, 'payments', n_pay, 'pieces_sold', n_sold,
    'sellers_unmapped', to_jsonb(v_unmapped), 'mixed_sellers', to_jsonb(v_mixed), 'changed', to_jsonb(v_changed),
    'sales_unmatched', to_jsonb(v_unmatched),
    'crm_links_cleared', n_crm, 'remapped', n_remap, 'pieces_ambiguous', to_jsonb(v_ambiguous),
    'refused_after_go_live', to_jsonb(v_refused));
end $$;

revoke execute on function public.ops_load_tickets(jsonb, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.crm_import_apply(p_batch bigint, p_actor text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  b crm_import_batches%rowtype; v_sum jsonb; r record; k record; v_id text; v_label int;
  v_note text; v_touched text[] := '{}'; v_new text[] := '{}'; v_owner text; v_active boolean;
  v_golive date; v_refused int := 0;
begin
  select * into b from crm_import_batches where id = p_batch for update;
  if not found then perform crm_fail('No such refresh.'); end if;
  if b.status <> 'staged' then perform crm_fail('This refresh has already been decided.'); end if;
  v_sum := crm_import_prepare(p_batch);        -- against the file as it stands now
  if (v_sum->'to_decide'->>'lines')::int > 0 then
    perform crm_fail('Some lines could belong to more than one client. Decide them first.');
  end if;
  -- from the go-live date the Delardi sales tool owns purchases: lines dated on or after it are not applied
  v_golive := (select go_live_date from pos_settings where id = 1);
  if v_golive is not null then
    v_refused := (select count(*) from crm_import_lines
                   where batch_id = p_batch and dup_tx_id is null and coalesce(decision, '') <> 'skip'
                     and sold_at >= v_golive and (client_id is not null or match = 'new'));
  end if;
  -- Every existing record this refresh may touch, as it stands now, so an
  -- undo can put it back exactly.
  insert into crm_import_changes (batch_id, client_id, kind, old_value)
  select p_batch, c.client_id, 'client_row', (to_jsonb(c) - 'updated_at')::text
  from crm_clients c
  where c.client_id in (select client_id from crm_import_lines where batch_id = p_batch and client_id is not null
                        union select client_id from crm_import_cards where batch_id = p_batch and client_id is not null);
  v_note := 'Colibri refresh, ' || to_char(coalesce(b.period_from, b.period_to), 'DD.MM.YYYY') || '–' || to_char(b.period_to, 'DD.MM.YYYY') || '.';

  -- 1. A seller the file has never seen gets the next label, not yet assignable.
  select coalesce(max(substring(label from 'Sales rep (\d+)')::int), 0) into v_label from crm_sales_reps;
  for r in select distinct advisor_raw from crm_import_lines
           where batch_id = p_batch and advisor is null and advisor_raw is not null and dup_tx_id is null
           order by advisor_raw loop
    v_label := v_label + 1;
    insert into crm_sales_reps (source_name, label, active) values (r.advisor_raw, 'Sales rep ' || v_label, false);
    insert into crm_import_changes (batch_id, kind, new_value) values (p_batch, 'rep_created', 'Sales rep ' || v_label);
    update crm_import_lines set advisor = r.advisor_raw where batch_id = p_batch and advisor_raw = r.advisor_raw;
  end loop;

  -- 2. New clients, one per name, numbered on from the last reference.
  for r in select new_key, min(btrim(name_raw)) name_raw, min(phone_norm) phone,
                  (array_agg(advisor order by net desc nulls last))[1] top_advisor
           from crm_import_lines
           where batch_id = p_batch and match = 'new' and dup_tx_id is null and coalesce(decision, '') <> 'skip'
             and (v_golive is null or sold_at < v_golive)
           group by new_key order by min(sold_at), new_key loop
    select 'DLD-' || lpad((coalesce(max(substring(client_id from 5)::int), 0) + 1)::text, 4, '0') into v_id
    from crm_clients where client_id ~ '^DLD-\d+$';
    select * into k from crm_import_cards
    where batch_id = p_batch and match = 'new_client'
      and (phone_norm = r.phone or name_key = r.new_key or crm_name_key(concat_ws(' ', surname, first_name)) = r.new_key)
    order by (phone_norm = r.phone) desc nulls last, row_no limit 1;
    v_active := exists (select 1 from crm_sales_reps where source_name = r.top_advisor and active);
    v_owner := case when v_active then r.top_advisor else 'Unassigned' end;
    insert into crm_clients (client_id, record_type, in_colibri, in_marketing, name_colibri, phone_colibri, gender_colibri,
                             dob_colibri, patronymic, client_owner, assigned_owner, assigned_by, assigned_at, assignment_reason,
                             created_by_batch)
    values (v_id, 'client', true, false, r.name_raw, coalesce(r.phone, k.phone_norm),
            case upper(btrim(k.gender)) when 'М' then 'M' when 'M' then 'M' when 'Ж' then 'F' when 'F' then 'F' end,
            crm_plausible_dob(k.dob, coalesce(b.report_date, b.period_to)), nullif(btrim(k.patronymic), ''),
            coalesce(r.top_advisor, 'Unassigned'), v_owner, p_actor, now(),
            case when v_active then 'rule: new client, owned by the rep who made the sale'
                 else 'rule: new client, seller not a current rep — shared list' end,
            p_batch);
    perform crm_recompute_flags(v_id);
    update crm_import_lines set client_id = v_id where batch_id = p_batch and match = 'new' and new_key = r.new_key;
    insert into crm_import_changes (batch_id, client_id, kind) values (p_batch, v_id, 'client_created');
    insert into crm_events (client_id, actor, action, note) values (v_id, p_actor, 'created_by_import', v_note);
    v_new := v_new || v_id;
  end loop;

  -- 3. The new lines.
  with ins as (
    insert into crm_transactions (client_id, sold_at, brand, category, item, qty, gross_uzs, discount_pct, net_uzs, advisor, article, import_batch)
    select client_id, sold_at, brand, category, item, qty, gross, discount_pct, net, advisor, btrim(article), p_batch
    from crm_import_lines
    where batch_id = p_batch and dup_tx_id is null and client_id is not null and coalesce(decision, '') <> 'skip'
      and (v_golive is null or sold_at < v_golive)
    returning id, client_id
  )
  insert into crm_import_changes (batch_id, client_id, kind, tx_id) select p_batch, client_id, 'tx_added', id from ins;
  select coalesce(array_agg(distinct client_id), '{}') into v_touched
  from crm_import_changes where batch_id = p_batch and kind = 'tx_added';

  -- 4. Known lines: a brand or seller the file lacked.
  insert into crm_import_changes (batch_id, client_id, kind, field, old_value, new_value, tx_id)
  select p_batch, t.client_id, 'tx_field', 'brand', t.brand, l.fill_brand, t.id
  from crm_import_lines l join crm_transactions t on t.id = l.dup_tx_id
  where l.batch_id = p_batch and l.fill_brand is not null;
  insert into crm_import_changes (batch_id, client_id, kind, field, old_value, new_value, tx_id)
  select p_batch, t.client_id, 'tx_field', 'advisor', t.advisor, l.fill_advisor, t.id
  from crm_import_lines l join crm_transactions t on t.id = l.dup_tx_id
  where l.batch_id = p_batch and l.fill_advisor is not null;
  update crm_transactions t set brand = l.fill_brand from crm_import_lines l
  where l.batch_id = p_batch and l.dup_tx_id = t.id and l.fill_brand is not null;
  update crm_transactions t set advisor = l.fill_advisor from crm_import_lines l
  where l.batch_id = p_batch and l.dup_tx_id = t.id and l.fill_advisor is not null;

  -- 5. A questionnaire-only person who has now bought becomes a client.
  for r in select distinct l.client_id, min(btrim(l.name_raw)) name_raw, min(l.phone_norm) phone
           from crm_import_lines l join crm_clients c on c.client_id = l.client_id
           where l.batch_id = p_batch and l.dup_tx_id is null and c.record_type = 'prospect'
             and (v_golive is null or l.sold_at < v_golive)
           group by l.client_id loop
    insert into crm_import_changes (batch_id, client_id, kind, field, old_value, new_value)
    select p_batch, r.client_id, 'field_changed', f, o, n
    from crm_clients c, lateral (values ('record_type', c.record_type, 'client'),
                                        ('in_colibri', c.in_colibri::text, 'true'),
                                        ('name_colibri', c.name_colibri, coalesce(c.name_colibri, r.name_raw)),
                                        ('phone_colibri', c.phone_colibri, coalesce(c.phone_colibri, r.phone))) v(f, o, n)
    where c.client_id = r.client_id and o is distinct from n;
    update crm_clients set record_type = 'client', in_colibri = true,
      name_colibri = coalesce(name_colibri, r.name_raw), phone_colibri = coalesce(phone_colibri, r.phone)
    where client_id = r.client_id;
    insert into crm_events (client_id, actor, action, note) values (r.client_id, p_actor, 'became_client', v_note);
  end loop;

  -- 6. What the POS cards now say.
  for r in select * from crm_import_card_changes(p_batch) loop
    insert into crm_import_changes (batch_id, client_id, kind, field, old_value, new_value)
    values (p_batch, r.client_id, 'field_changed',
            case r.field when 'phone' then 'phone_colibri' when 'dob' then 'dob_colibri' when 'gender' then 'gender_colibri'
                         when 'name' then 'name_colibri' else r.field end, r.old_value, r.new_value);
    if r.field = 'phone' then
      update crm_clients set phone_colibri = r.new_value,
        phone_flag = case when phone_flag = 'rule' then 'none' else phone_flag end where client_id = r.client_id;
    elsif r.field = 'dob' then
      update crm_clients set dob_colibri = r.new_value::date,
        dob_flag = case when dob_flag = 'rule' then 'none' else dob_flag end where client_id = r.client_id;
    elsif r.field = 'gender' then
      update crm_clients set gender_colibri = r.new_value,
        gender_flag = case when gender_flag = 'rule' then 'none' else gender_flag end where client_id = r.client_id;
    elsif r.field = 'name' then
      update crm_clients set name_colibri = r.new_value,
        name_flag = case when name_flag = 'rule' then 'none' else name_flag end where client_id = r.client_id;
    elsif r.field = 'patronymic' then
      update crm_clients set patronymic = r.new_value where client_id = r.client_id;
    end if;
    perform crm_recompute_flags(r.client_id);
    insert into crm_events (client_id, actor, action, field, old_value, new_value, note)
    values (r.client_id, p_actor, 'colibri_changed', r.field,
            case when r.field = 'phone' then null else r.old_value end,
            case when r.field = 'phone' then null else r.new_value end, v_note);
  end loop;

  -- 7. Totals, a line in each client's history, then the classes.
  perform crm_recompute_purchases(v_touched);
  insert into crm_events (client_id, actor, action, new_value, note)
  select c.client_id, p_actor, 'purchases_imported', count(*)::text,
         v_note || ' ' || count(*) || ' line(s), ' || to_char(sum(t.net_uzs), 'FM999G999G999G999') || ' UZS.'
  from crm_import_changes c join crm_transactions t on t.id = c.tx_id
  where c.batch_id = p_batch and c.kind = 'tx_added'
  group by c.client_id;
  perform crm_recompute_segments('import');
  update crm_import_changes x set new_value = (to_jsonb(c) - 'updated_at')::text
  from crm_clients c where x.batch_id = p_batch and x.kind = 'client_row' and c.client_id = x.client_id;

  update crm_import_batches set status = 'applied', decided_at = now(), decided_by = p_actor,
    summary = v_sum || jsonb_build_object('refused_after_go_live', v_refused, 'applied', jsonb_build_object(
      'new_clients', cardinality(v_new), 'clients_touched', cardinality(v_touched),
      'lines_added', (select count(*) from crm_import_changes where batch_id = p_batch and kind = 'tx_added')))
  where id = p_batch;
  delete from crm_import_buyers where batch_id = p_batch;
  delete from crm_import_sales where batch_id = p_batch;
  delete from crm_import_cards where batch_id = p_batch;
  return (select summary from crm_import_batches where id = p_batch);
end $_$;

revoke execute on function public.ops_sync_pieces(bigint) from public, anon, authenticated;
revoke execute on function public.ops_load_tickets(jsonb, text) from public, anon, authenticated;
