-- Four small things for the floor (28 Nov 2026):
--   1. Stock list: the date column is the piece's arrival, not the day it entered its state. From its arrival
--      document (arrival date, else invoice date); without one, the design's latest arrival year, as an estimate.
--   2. Sales search and suspended sales carry the design's photo (cat_models.image_key), for a thumbnail on each line.
--   3. Sales: a line may carry its exact total (net_uzs) beside its discount, so a sale can be brought to a typed
--      total ("Set total"). The page spreads the total over the lines in proportion to their prices; each line's
--      discount is that share to four decimals, and net_uzs is the exact so'm. The database accepts net_uzs only
--      when it agrees with the discount to within that rounding. A suspended sale keeps it.

-- ---------------------------------------------------------------- 1. arrival
create function public.stk_piece_arrived(p_piece uuid) returns date
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(r.arrival_date, r.invoice_date) from ops_pieces o join ops_receipts r on r.receipt_id = o.receipt_id where o.piece_id = p_piece;
$$;
create function public.stk_piece_arrived_year(p_piece uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select m.latest_arrival_year from ops_pieces o join cat_models m on m.model_id = o.model_id where o.piece_id = p_piece;
$$;
-- for sorting: the date, else the first day of the estimated year
create function public.stk_arrived_sort(p_piece uuid) returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(stk_piece_arrived(p_piece)::timestamptz, make_timestamptz(stk_piece_arrived_year(p_piece), 1, 1, 0, 0, 0));
$$;
revoke execute on function public.stk_piece_arrived(uuid), public.stk_piece_arrived_year(uuid), public.stk_arrived_sort(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. a line's exact total
-- What a line comes to. Without p_net: the price less the discount, rounded. With it: p_net itself, when it is whole
-- so'm, not above the price, and agrees with the discount to within what four decimals of a percent can express.
create function public.pos_line_net(p_price numeric, p_disc numeric, p_net numeric) returns numeric
language plpgsql immutable set search_path = public, pg_temp as $$
declare v numeric := p_price * (1 - p_disc / 100);
begin
  if p_net is null then return round(v); end if;
  if p_net <> trunc(p_net) or p_net <= 0 or p_net > p_price or abs(p_net - v) > p_price * 0.000001 + 1 then
    raise exception 'a line total does not match its price and discount';
  end if;
  return p_net;
end $$;
revoke execute on function public.pos_line_net(numeric, numeric, numeric) from public, anon, authenticated;

alter table public.pos_draft_lines add column net_uzs bigint;

do $do$
declare d text; n text;
begin
  -- 1. the list row carries the arrival; "since" sorts by it
  d := pg_get_functiondef('public.stk_row_json(stk_row)'::regprocedure);
  n := replace(d, '''price_uzs'', r.price_uzs);', '''price_uzs'', r.price_uzs,
           ''arrived'', stk_piece_arrived(r.piece_id), ''arrived_year'', stk_piece_arrived_year(r.piece_id));');
  if n = d then raise exception 'stk_row_json not patched as expected'; end if;
  execute n;
  d := pg_get_functiondef('public.stk_piece_list(jsonb)'::regprocedure);
  n := replace(d, 'stk_sort_num(v_col, b.state, b.price_uzs, b.state_since)', 'stk_sort_num(v_col, b.state, b.price_uzs, stk_arrived_sort(b.piece_id))');
  if n = d then raise exception 'stk_piece_list not patched as expected'; end if;
  execute n;
  d := pg_get_functiondef('public.stk_export(jsonb)'::regprocedure);
  n := replace(d, 'stk_sort_num(v_col, b.state, b.price_uzs, b.state_since)', 'stk_sort_num(v_col, b.state, b.price_uzs, stk_arrived_sort(b.piece_id))');
  if n = d then raise exception 'stk_export not patched as expected'; end if;
  execute n;

  -- 2. the photo
  d := pg_get_functiondef('public.pos_search_pieces(text,text)'::regprocedure);
  n := replace(d, '''sellable'', r.sellable) j', '''sellable'', r.sellable, ''image'', r.image_key) j');
  n := replace(n, 'm.collection, m.model_name, v.colour_code colour, o.size,
                           coalesce(m.metal_keys', 'm.collection, m.model_name, m.image_key, v.colour_code colour, o.size,
                           coalesce(m.metal_keys');
  if n !~ 'r\.image_key' or n !~ 'm\.image_key' then raise exception 'pos_search_pieces not patched as expected'; end if;
  execute n;
  d := pg_get_functiondef('public.pos_drafts_list(text)'::regprocedure);
  n := replace(d, '''price_uzs'', l.price_uzs, ''discount_pct'', trim_scale(l.discount_pct),',
                  '''price_uzs'', l.price_uzs, ''discount_pct'', trim_scale(l.discount_pct), ''net_uzs'', l.net_uzs, ''image'', m.image_key,');
  if n = d then raise exception 'pos_drafts_list not patched as expected'; end if;
  execute n;

  -- 3. posting and suspending take the line's exact total
  d := pg_get_functiondef('public.pos_post_sale(jsonb,text)'::regprocedure);
  n := replace(d, 'v_total := v_total + round(v_price * (1 - v_disc / 100));', 'v_total := v_total + pos_line_net(v_price, v_disc, (l->>''net_uzs'')::numeric);');
  n := replace(n, 'v_net   := round(v_price * (1 - v_disc / 100));', 'v_net   := pos_line_net(v_price, v_disc, (l->>''net_uzs'')::numeric);');
  if (length(n) - length(replace(n, 'pos_line_net(', ''))) / length('pos_line_net(') <> 2 then raise exception 'pos_post_sale not patched as expected'; end if;
  execute n;
  d := pg_get_functiondef((select p.oid from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.proname = 'pos_suspend')::regprocedure);
  n := replace(d, 'insert into pos_draft_lines(draft_id, line_no, piece_id, price_uzs, discount_pct, seller, mode)
    values (v_draft, i, (l->>''piece_id'')::uuid, (l->>''price_uzs'')::bigint, coalesce((l->>''discount_pct'')::numeric, 0),',
                  'insert into pos_draft_lines(draft_id, line_no, piece_id, price_uzs, discount_pct, net_uzs, seller, mode)
    values (v_draft, i, (l->>''piece_id'')::uuid, (l->>''price_uzs'')::bigint, coalesce((l->>''discount_pct'')::numeric, 0),
            case when l->>''price_uzs'' is not null and l->>''net_uzs'' is not null
                 then pos_line_net((l->>''price_uzs'')::numeric, coalesce((l->>''discount_pct'')::numeric, 0), (l->>''net_uzs'')::numeric)::bigint end,');
  if n = d then raise exception 'pos_suspend not patched as expected'; end if;
  d := n;
  n := replace(d, '      raise exception ''price must be positive whole so''''m'';
    end if;
  end loop;', '      raise exception ''price must be positive whole so''''m'';
    end if;
    if v_price is not null and l->>''net_uzs'' is not null then perform pos_line_net(v_price, v_disc, (l->>''net_uzs'')::numeric); end if;
  end loop;');
  if n = d then raise exception 'pos_suspend check not patched as expected'; end if;
  execute n;
end $do$;
