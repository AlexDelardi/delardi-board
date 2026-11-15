-- S3 polish, migration 5: loader reports cleared CRM links, remaps and ambiguous pieces; a selling ticket moved to an
-- earlier date raises a review; a kept sold line reloads quietly while any conflict review is open on its piece.
-- Plan: docs/plans/2026-11-14-s3-polish.md Task 3 (findings 1, 2, 4, 5, 11). Test: db/tests/s3_t5_loader_polish.sql.
-- Re-creates ops_load_tickets from 20261113_s3_1_ticket_load.sql (same signature and settings); only the changes
-- listed in the header comment below differ.

-- Load a payload of tickets (tools/colibri_sales_parse.py) into store 1, source colibri. Idempotent.
--   new ticket            → insert ticket, lines, payments
--   same content          → content untouched (header sold_at/seller_raw/client_raw/note, every line's fields,
--                           payments); a sold line kept after its conflict was raised (a review with its note, open or
--                           resolved), or kept while any ticket_conflict review is open on its piece, counts as same.
--                           The mappings are refreshed: seller from the current aliases/reps, each line's
--                           model_id/variant_id from cat_match_article; a ticket where either differed counts in remapped
--   different content     → header updated, lines updated in place by line_no, new lines added, payments replaced;
--                           a line that sold a piece is never undone: if its serial (or kind) would change, or it
--                           vanished, it is kept as is and raises a ticket_conflict review on the piece;
--                           a line without a piece that vanished is deleted (its CRM links are cleared by the foreign
--                           key and counted in crm_links_cleared);
--                           a ticket moved to an earlier date raises a ticket_conflict review on each piece its lines
--                           sold (unless one is already open there); the date is still updated
-- Then, for every ticket in the payload, each sale line with a serial and no piece is matched to the one live piece
-- with the same brand key and serial, last seen in a catalogue run dated (Tashkent) on or before the sale; the piece
-- is sold through ops_apply_ticket_line. Refund lines never touch pieces. A line with two or more such pieces sells
-- nothing; its ticket is listed in pieces_ambiguous.
-- Result counts: lines = line rows inserted or updated, payments = payment rows inserted.
-- sales_unmatched: tickets with a sale line that has a serial but no piece after the piece rule, dated on or after the
-- Tashkent date of the latest catalogue run (a fresh sale whose piece was not found).
-- crm_links_cleared: crm_transactions rows that pointed to deleted lines. remapped: same-content tickets whose seller
-- or a line's model/variant mapping was refreshed (they still count in tickets_same).
-- cat_match_article is called once per distinct article among the lines written or remapped.
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
  v_match jsonb := '{}'; v_last_run date;
begin
  if p_actor is null or btrim(p_actor) = '' then raise exception 'actor required'; end if;
  v_last_run := (select (max(run_at) at time zone 'Asia/Tashkent')::date from cat_import_runs);

  for v_t in select value from jsonb_array_elements(coalesce(p->'tickets', '[]'::jsonb)) loop
    v_no := v_t->>'ticket_no';
    v_sold_at := (v_t->>'sold_at')::date;

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
        update ops_tickets set seller = v_seller where ticket_id = v_tid and seller is distinct from v_seller;
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
                   format('ticket %s date moved from %s to %s after it sold this piece', v_no, v_old_sold_at, v_sold_at)
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
    'crm_links_cleared', n_crm, 'remapped', n_remap, 'pieces_ambiguous', to_jsonb(v_ambiguous));
end $$;

revoke execute on function public.ops_load_tickets(jsonb, text) from public, anon, authenticated;
