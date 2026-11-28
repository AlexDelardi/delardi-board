-- Running the till beside Colibri (28 Nov 2026).
--   * A till sale can carry the number of its Colibri receipt (ops_tickets.colibri_no). One posted till sale per number.
--   * pos_settings.main_ticket_no says which number is the main one: 'till' (D-000001) or 'colibri'. With 'colibri' the
--     Colibri number is needed to post, and it is the number shown and printed (ops_tickets.display_no keeps it).
--   * From the go-live date the Colibri sales export still may not write tickets. It is now a cross-check instead: a
--     Colibri receipt whose number is on a till sale is compared with it (pieces and total) and the result is kept on
--     the till sale (colibri_check 'matched' / 'differs', colibri_note). Receipts with no till sale are refused and
--     listed, as before.

alter table public.ops_tickets
  add column colibri_no text,
  add column display_no text,
  add column colibri_check text check (colibri_check in ('matched', 'differs')),
  add column colibri_note text,
  add column colibri_seen_at timestamptz;
create unique index ops_tickets_colibri_no_key on public.ops_tickets (store_id, upper(colibri_no))
  where source = 'delardi' and status = 'posted' and colibri_no is not null;

alter table public.pos_settings
  add column main_ticket_no text not null default 'till' check (main_ticket_no in ('till', 'colibri'));

create function public.pos_set_main_no(p_main text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.pos_settings;
begin
  if p_main is null or p_main not in ('till', 'colibri') then raise exception 'main number must be till or colibri'; end if;
  select * into s from pos_settings where id = 1 for update;
  if s.main_ticket_no <> p_main then
    insert into pos_settings_log(actor, field, old_value, new_value)
    values (coalesce(nullif(btrim(p_actor), ''), 'unknown'), 'main_ticket_no', s.main_ticket_no, p_main);
    update pos_settings set main_ticket_no = p_main, updated_at = now(), updated_by = p_actor where id = 1;
  end if;
  return jsonb_build_object('main_ticket_no', p_main);
end $$;
revoke execute on function public.pos_set_main_no(text, text) from public, anon, authenticated;

-- A Colibri receipt against the till sale that carries its number: the same serials sold, the same total.
-- Writes the result on the till sale; returns true when they agree.
create function public.pos_check_colibri(p_ticket uuid, p_colibri jsonb) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ours text[]; v_theirs text[]; v_net numeric; v_cnet numeric; v_note text[] := '{}';
begin
  select coalesce(array_agg(s order by s), '{}') into v_ours
    from (select upper(btrim(coalesce(o.serial, l.serial_raw))) s
            from ops_ticket_lines l left join ops_pieces o on o.piece_id = l.piece_id
           where l.ticket_id = p_ticket and l.kind = 'sale') x where s is not null and s <> '';
  select coalesce(array_agg(s order by s), '{}') into v_theirs
    from (select upper(btrim(x->>'serial_raw')) s from jsonb_array_elements(coalesce(p_colibri->'lines', '[]'::jsonb)) x
           where coalesce(x->>'kind', 'sale') = 'sale') y where s is not null and s <> '';
  select coalesce(sum(case kind when 'refund' then -net else net end), 0) into v_net from ops_ticket_lines where ticket_id = p_ticket;
  select coalesce(sum(case when x->>'kind' = 'refund' then -(x->>'net')::numeric else (x->>'net')::numeric end), 0) into v_cnet
    from jsonb_array_elements(coalesce(p_colibri->'lines', '[]'::jsonb)) x;
  if v_ours <> v_theirs then
    v_note := v_note || format('pieces: till %s, Colibri %s', coalesce(nullif(array_to_string(v_ours, ', '), ''), 'none'),
                               coalesce(nullif(array_to_string(v_theirs, ', '), ''), 'none'));
  end if;
  if v_net <> v_cnet then v_note := v_note || format('total: till %s, Colibri %s', pos_fmt_uzs(v_net), pos_fmt_uzs(v_cnet)); end if;
  update ops_tickets
     set colibri_check = case when cardinality(v_note) = 0 then 'matched' else 'differs' end,
         colibri_note = nullif(array_to_string(v_note, '; '), ''), colibri_seen_at = now()
   where ticket_id = p_ticket;
  return cardinality(v_note) = 0;
end $$;
revoke execute on function public.pos_check_colibri(uuid, jsonb) from public, anon, authenticated;

do $do$
declare d text; n text;
begin
  ---------------------------------------------------------------- posting
  d := pg_get_functiondef('public.pos_post_sale(jsonb,text)'::regprocedure);
  n := replace(d, '  v_mode     text;
', '  v_mode     text;
  v_main     text;
  v_cno      text := nullif(btrim(p->>''colibri_no''), '''');
  v_other    text;
');
  n := replace(n, '  select mode, cash_notice_uzs into v_mode, v_notice from pos_settings where id = 1 for share;',
'  select mode, cash_notice_uzs, main_ticket_no into v_mode, v_notice, v_main from pos_settings where id = 1 for share;
  -- the Colibri receipt number: needed while Colibri numbers are the main ones; one posted sale per number, and
  -- never the number of a receipt the register already holds from a Colibri export
  if length(v_cno) > 40 then raise exception ''Colibri receipt number is too long''; end if;
  if v_main = ''colibri'' and v_cno is null then raise exception ''Colibri receipt number is needed''; end if;
  if v_mode = ''live'' and v_cno is not null then
    perform pg_advisory_xact_lock(hashtext(''pos_colibri_no:'' || upper(v_cno)));
    select ticket_no into v_other from ops_tickets
     where store_id = 1 and source = ''delardi'' and status = ''posted'' and upper(colibri_no) = upper(v_cno);
    if found then raise exception ''Colibri receipt % is already on sale %'', v_cno, v_other; end if;
    if exists (select 1 from ops_tickets where store_id = 1 and source = ''colibri'' and upper(ticket_no) = upper(v_cno)) then
      raise exception ''Colibri receipt % is already in the register, loaded from Colibri'', v_cno;
    end if;
  end if;');
  n := replace(n, '  insert into ops_tickets(store_id, source, ticket_no, sold_at, seller, client_id, walk_in, entered_by, fiscal_ref, status)
  values (1, case when v_mode = ''live'' then ''delardi'' else ''training'' end, v_tno,
          (now() at time zone ''Asia/Tashkent'')::date, v_seller, v_client, v_walk, p_actor,
          nullif(btrim(p->>''fiscal_ref''), ''''), ''posted'')',
'  insert into ops_tickets(store_id, source, ticket_no, sold_at, seller, client_id, walk_in, entered_by, fiscal_ref, status,
                          colibri_no, display_no)
  values (1, case when v_mode = ''live'' then ''delardi'' else ''training'' end, v_tno,
          (now() at time zone ''Asia/Tashkent'')::date, v_seller, v_client, v_walk, p_actor,
          nullif(btrim(p->>''fiscal_ref''), ''''), ''posted'',
          v_cno, case when v_main = ''colibri'' then v_cno end)');
  n := replace(n, '''ticket_no'', v_tno, ''mode'', v_mode, ''total'', v_total,',
                  '''ticket_no'', v_tno, ''display_no'', case when v_main = ''colibri'' then v_cno else v_tno end, ''colibri_no'', v_cno, ''mode'', v_mode, ''total'', v_total,');
  if n !~ 'v_main = ''colibri'' and v_cno is null' or n !~ 'colibri_no, display_no' or n !~ '''display_no'', case' then
    raise exception 'pos_post_sale not patched as expected';
  end if;
  execute n;

  ---------------------------------------------------------------- receipt: the main number
  d := pg_get_functiondef('public.pos_receipt_text(uuid,text)'::regprocedure);
  n := replace(d, 'else ''Ticket %s · %s'' end, t.ticket_no,', 'else ''Ticket %s · %s'' end, coalesce(t.display_no, t.ticket_no),');
  if n = d then raise exception 'pos_receipt_text not patched as expected'; end if;
  execute n;

  ---------------------------------------------------------------- ticket list: both numbers, found by either
  d := pg_get_functiondef('public.pos_ticket_list(jsonb)'::regprocedure);
  n := replace(d, 'select t.ticket_id, t.ticket_no, t.source,', 'select t.ticket_id, t.ticket_no, t.colibri_no, t.display_no, t.colibri_check, t.source,');
  n := replace(n, 'or upper(t.ticket_no) = upper(v_q)', 'or upper(t.ticket_no) = upper(v_q) or upper(t.colibri_no) = upper(v_q)');
  n := replace(n, '''ticket_no'', x.ticket_no, ''source'', x.source,',
                  '''ticket_no'', x.ticket_no, ''display_no'', coalesce(x.display_no, x.ticket_no), ''colibri_no'', x.colibri_no, ''colibri_check'', x.colibri_check, ''source'', x.source,');
  if n !~ 't\.colibri_check, t\.source' or n !~ 'upper\(t\.colibri_no\)' or n !~ '''colibri_check'', x\.colibri_check' then
    raise exception 'pos_ticket_list not patched as expected';
  end if;
  execute n;

  ---------------------------------------------------------------- Colibri sales export: cross-check, never a second ticket
  d := pg_get_functiondef('public.ops_load_tickets(jsonb,text)'::regprocedure);
  n := replace(d, '  v_match jsonb := ''{}''; v_last_run date; v_golive date; v_refused text[] := ''{}'';',
                  '  v_match jsonb := ''{}''; v_last_run date; v_golive date; v_refused text[] := ''{}'';
  v_till uuid; v_till_ok text[] := ''{}''; v_till_diff text[] := ''{}'';');
  n := replace(n, '    v_sold_at := (v_t->>''sold_at'')::date;
', '    v_sold_at := (v_t->>''sold_at'')::date;
    -- a till sale carries this receipt''s number: the same sale. It is compared, and never written a second time
    select ticket_id into v_till from ops_tickets
     where store_id = 1 and source = ''delardi'' and status = ''posted'' and upper(colibri_no) = upper(btrim(v_no));
    if v_till is not null then
      if pos_check_colibri(v_till, v_t) then v_till_ok := v_till_ok || v_no; else v_till_diff := v_till_diff || v_no; end if;
      continue;
    end if;
');
  n := replace(n, '    ''refused_after_go_live'', to_jsonb(v_refused));', '    ''refused_after_go_live'', to_jsonb(v_refused),
    ''till_matched'', to_jsonb(v_till_ok), ''till_differs'', to_jsonb(v_till_diff));');
  if n !~ 'pos_check_colibri\(v_till, v_t\)' or n !~ '''till_differs''' or n !~ 'v_till uuid' then
    raise exception 'ops_load_tickets not patched as expected';
  end if;
  execute n;
end $do$;
