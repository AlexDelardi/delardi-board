-- POS 5: ticket lookup (read-only). Only the sales-api edge function (service role) calls these.
-- Seller names leave here as Colibri source_name; sales-api maps them to crm_sales_reps.label.
-- seller_raw, card_no and source_file are never returned.

-- List tickets. p: {q?, from?, to?, seller?, source?: colibri|delardi, status?: posted|void, training?: bool, page?: int}.
-- No from and no to → the last 30 days including today (Tashkent). training true → only training tickets; otherwise they are excluded.
-- q: the ticket number exactly, or (literal, case-insensitive) part of any line's serial, article or brand,
-- the client's display name or the ticket's client_raw. Newest first, then ticket number descending; 50 a page.
-- net counts refund lines negative. count covers every filtered row; void_count is the void ones among them;
-- net_total sums posted tickets only.
create function public.pos_ticket_list(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_p      jsonb := case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end;
  v_q      text := nullif(btrim(coalesce(v_p->>'q', '')), '');
  v_like   text;
  v_from   date := nullif(btrim(v_p->>'from'), '')::date;
  v_to     date := nullif(btrim(v_p->>'to'), '')::date;
  v_seller text := nullif(btrim(v_p->>'seller'), '');
  v_source text := nullif(btrim(v_p->>'source'), '');
  v_status text := nullif(btrim(v_p->>'status'), '');
  v_train  boolean := coalesce((v_p->>'training')::boolean, false);
  v_page   int := greatest(coalesce(nullif(btrim(v_p->>'page'), '')::int, 1), 1);
  v_res    jsonb;
begin
  if v_source is not null and v_source not in ('colibri', 'delardi') then
    raise exception 'source must be colibri or delardi';
  end if;
  if v_status is not null and v_status not in ('posted', 'void') then
    raise exception 'status must be posted or void';
  end if;
  if v_from is null and v_to is null then
    v_from := (now() at time zone 'Asia/Tashkent')::date - 29;
  end if;
  -- \ % _ escaped, so the text matches literally
  if v_q is not null then v_like := '%' || regexp_replace(v_q, '([\\%_])', '\\\1', 'g') || '%'; end if;

  with f as (
    select t.ticket_id, t.ticket_no, t.source, t.sold_at, t.status, t.seller, t.client_id, t.walk_in, t.loaded_at,
           coalesce(cq.display_name, t.client_raw) client_name,
           (select coalesce(sum(case l.kind when 'refund' then -l.net else l.net end), 0)
              from ops_ticket_lines l where l.ticket_id = t.ticket_id) net,
           (select count(*) from ops_ticket_lines l where l.ticket_id = t.ticket_id) n_lines,
           (select nullif(concat_ws(' ', l.brand_raw, l.item_name), '')
              from ops_ticket_lines l where l.ticket_id = t.ticket_id order by l.line_no limit 1) first_item
      from ops_tickets t
      left join crm_queue cq on cq.client_id = t.client_id
     where (case when v_train then t.source = 'training' else t.source <> 'training' end)
       and (v_from is null or t.sold_at >= v_from)
       and (v_to is null or t.sold_at <= v_to)
       and (v_seller is null or t.seller = v_seller)
       and (v_source is null or t.source = v_source)
       and (v_status is null or t.status = v_status)
       and (v_q is null
            or upper(t.ticket_no) = upper(v_q)
            or t.client_raw ilike v_like escape '\'
            or cq.display_name ilike v_like escape '\'
            or exists (select 1 from ops_ticket_lines l
                        where l.ticket_id = t.ticket_id
                          and (l.serial_raw ilike v_like escape '\' or l.article ilike v_like escape '\'
                               or l.brand_raw ilike v_like escape '\')))
  )
  select jsonb_build_object(
           'count', (select count(*) from f),
           'void_count', (select count(*) from f where status = 'void'),
           'net_total', (select coalesce(sum(net), 0) from f where status = 'posted'),
           'page', v_page,
           'rows', coalesce((select jsonb_agg(jsonb_build_object(
                       'ticket_id', x.ticket_id, 'ticket_no', x.ticket_no, 'source', x.source, 'sold_at', x.sold_at,
                       'status', x.status, 'seller', x.seller, 'client_id', x.client_id, 'client_name', x.client_name,
                       'walk_in', x.walk_in,
                       'items', x.first_item || case when x.n_lines > 1 then ' ×' || x.n_lines else '' end,
                       'lines', x.n_lines, 'net', x.net) order by x.sold_at desc, x.ticket_no desc)
                      from (select * from f order by sold_at desc, ticket_no desc
                             limit 50 offset (v_page - 1) * 50) x), '[]'::jsonb))
    into v_res;
  return v_res;
end $$;
revoke execute on function public.pos_ticket_list(jsonb) from public, anon, authenticated;

-- One ticket in full: all ops_tickets columns except seller_raw, card_no, source_file; lines (with the line seller from
-- extra, null when it is the ticket's seller); payments; the client name. Null for an unknown id.
create function public.pos_ticket_detail(p_ticket uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t ops_tickets%rowtype;
begin
  select * into t from ops_tickets where ticket_id = p_ticket;
  if not found then return null; end if;
  return jsonb_build_object(
    'ticket', to_jsonb(t) - 'seller_raw' - 'card_no' - 'source_file',
    'lines', coalesce((select jsonb_agg((to_jsonb(l) - 'extra' - 'ticket_id')
                                        || jsonb_build_object('seller', l.extra->>'seller') order by l.line_no)
                         from ops_ticket_lines l where l.ticket_id = t.ticket_id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(y) - 'ticket_id' order by y.payment_id)
                            from ops_ticket_payments y where y.ticket_id = t.ticket_id), '[]'::jsonb),
    'client_name', coalesce((select display_name from crm_queue where client_id = t.client_id), t.client_raw));
end $$;
revoke execute on function public.pos_ticket_detail(uuid) from public, anon, authenticated;

-- The ticket a line belongs to (for the client panel's purchase rows). Null for an unknown line.
create function public.pos_ticket_by_line(p_line uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select ticket_id from ops_ticket_lines where line_id = p_line
$$;
revoke execute on function public.pos_ticket_by_line(uuid) from public, anon, authenticated;
