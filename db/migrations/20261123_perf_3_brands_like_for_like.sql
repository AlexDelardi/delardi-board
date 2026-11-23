-- Performance, brands: three corrections to perf_2.
--   perf_brands          last year beside this year covers the same months (a year to date is not set against a whole
--                        year); the answer says through which month. On hand leaves out pieces still on their way and
--                        counts them as incoming; a piece is valued by its own variant and serial.
--   perf_load_arrivals   a payload without rows is refused before anything is removed.
-- Same rules as before: security definer, pinned search_path, no execute for public/anon/authenticated.

create or replace function public.perf_load_arrivals(p jsonb, p_actor text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if not ops_has_right(p_actor, 'view_performance') then raise exception 'Your account cannot open Performance.'; end if;
  -- a payload without rows gives null here, and null must not pass as "fine"
  if coalesce(jsonb_typeof(p->'rows'), '') <> 'array' or jsonb_array_length(p->'rows') = 0 then raise exception 'No arrival rows were sent.'; end if;
  delete from perf_arrivals where true;
  insert into perf_arrivals(month, brand, units, rrp_usd, sold_units, left_units, source)
  -- one line per month and brand, whatever the spelling of the brand in the rows
  select ((r->>'month') || '-01')::date, max(btrim(r->>'brand')), sum(coalesce((r->>'units')::int, 0)), sum(coalesce((r->>'rrp_usd')::numeric, 0)),
         sum(coalesce((r->>'sold_units')::int, 0)), sum(coalesce((r->>'left_units')::int, 0)), p->>'source'
    from jsonb_array_elements(p->'rows') r
   where btrim(coalesce(r->>'brand', '')) <> ''
   group by ((r->>'month') || '-01')::date, lower(btrim(r->>'brand'));
  get diagnostics n = row_count;
  insert into perf_input_log(actor, what, ref, new) values (p_actor, 'arrivals', p->>'source', jsonb_build_object('rows', n));
  return n;
end $$;
revoke execute on function public.perf_load_arrivals(jsonb, text) from public, anon, authenticated;

create or replace function public.perf_brands(p_from date, p_to date, p_store smallint default 1) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with per as (
    -- the day after the last month of the period that has a ticket: last year is compared over the same months,
    -- as perf_year does. A period with no ticket at all is compared whole.
    select coalesce((select least(p_to, (date_trunc('month', max(sold_at)) + interval '1 month')::date) from ops_tickets
                      where store_id = p_store and status = 'posted' and source <> 'training' and sold_at >= p_from and sold_at < p_to), p_to) cmp_to
  ), ln as (
    -- every line of a retail ticket in the period (cur) or in the same period a year before (ly)
    select w.which, lower(btrim(coalesce(nullif(btrim(l.brand_raw), ''), '—'))) k, coalesce(nullif(btrim(l.brand_raw), ''), '—') brand, t.ticket_id,
           (case l.kind when 'refund' then -1 else 1 end) sgn, l.net, coalesce(l.price_current, l.price_list, l.net) * coalesce(l.qty, 1) gross, coalesce(l.qty, 1) qty, l.kind
      from per cross join lateral (values ('cur', p_from, p_to), ('ly', (p_from - interval '1 year')::date, (per.cmp_to - interval '1 year')::date)) w(which, f, t2)
      cross join lateral perf_tickets(w.f, w.t2, p_store) t
      join ops_ticket_lines l on l.ticket_id = t.ticket_id
     where t.basis = 'retail'
  ), s as (
    select k, max(brand) filter (where which = 'cur') brand_cur, max(brand) brand_any,
           coalesce(sum(sgn * net) filter (where which = 'cur'), 0) net, coalesce(sum(sgn * gross) filter (where which = 'cur'), 0) gross,
           coalesce(sum(sgn * qty) filter (where which = 'cur'), 0) units, count(distinct ticket_id) filter (where which = 'cur' and kind = 'sale') tickets,
           coalesce(sum(sgn * net) filter (where which = 'ly'), 0) ly_net, coalesce(sum(sgn * qty) filter (where which = 'ly'), 0) ly_units
      from ln group by k
  ), st as (
    -- on hand is what has arrived; pieces still on their way are counted beside it. A piece is valued as the stock
    -- screens value it: by its own variant and serial.
    select lower(btrim(o.brand)) k, max(o.brand) brand, count(*) filter (where o.state <> 'in_transit') units,
           count(*) filter (where o.state = 'in_transit') incoming,
           sum((select c.price_uzs from cat_pieces c where c.variant_id = o.variant_id and upper(btrim(c.serial)) = upper(btrim(o.serial)) order by c.id desc limit 1))
             filter (where o.state <> 'in_transit') value_uzs
      from ops_pieces o where o.store_id = p_store and o.state not in ('sold', 'not_received') group by 1
  ), ar as (
    select lower(btrim(a.brand)) k, max(a.brand) brand, sum(a.units) units, sum(a.rrp_usd) rrp_usd, sum(a.sold_units) sold_units, sum(a.left_units) left_units
      from perf_arrivals a where a.month >= p_from and a.month < p_to group by 1
  ), keys as (select k from s union select k from st union select k from ar),
  tot as (select coalesce(sum(net), 0) net from s)
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'through', ((select cmp_to from per) - interval '1 month')::date,
    'total', jsonb_build_object('net', (select net from tot), 'units', (select coalesce(sum(units), 0) from s), 'ly_net', (select coalesce(sum(ly_net), 0) from s),
               'stock_units', (select coalesce(sum(units), 0) from st), 'stock_value', (select coalesce(sum(value_uzs), 0) from st), 'incoming_units', (select coalesce(sum(incoming), 0) from st),
               'arr_units', (select coalesce(sum(units), 0) from ar), 'arr_rrp_usd', (select coalesce(sum(rrp_usd), 0) from ar)),
    'brands', coalesce((select jsonb_agg(jsonb_build_object(
        'brand', coalesce(s.brand_cur, s.brand_any, st.brand, ar.brand), 'net', coalesce(s.net, 0),
        'share', case when (select net from tot) > 0 then round(coalesce(s.net, 0) / (select net from tot), 4) end,
        'discount_pct', case when s.gross > 0 then round((s.gross - s.net) / s.gross, 4) end,
        'units', coalesce(s.units, 0), 'tickets', coalesce(s.tickets, 0), 'asp', case when s.units > 0 then round(s.net / s.units) end,
        'ly_net', coalesce(s.ly_net, 0), 'ly_units', coalesce(s.ly_units, 0),
        'stock_units', coalesce(st.units, 0), 'stock_value', st.value_uzs, 'incoming_units', coalesce(st.incoming, 0),
        'arr_units', ar.units, 'arr_rrp_usd', ar.rrp_usd, 'arr_sold_units', ar.sold_units, 'arr_left_units', ar.left_units)
        order by coalesce(s.net, 0) desc, coalesce(s.ly_net, 0) desc, coalesce(st.units, 0) desc, keys.k)
      from keys left join s on s.k = keys.k left join st on st.k = keys.k left join ar on ar.k = keys.k), '[]'::jsonb),
    -- arrivals by year, all brands together, for the chart
    'arrival_years', coalesce((select jsonb_agg(jsonb_build_object('year', y.year, 'units', y.units, 'rrp_usd', y.rrp_usd, 'sold_units', y.sold_units, 'left_units', y.left_units) order by y.year)
        from (select extract(year from month)::int as year, sum(units) units, sum(rrp_usd) rrp_usd, sum(sold_units) sold_units, sum(left_units) left_units from perf_arrivals group by 1) y), '[]'::jsonb),
    -- arrivals month by month through the year of the period, all brands together
    'arrival_months', (select jsonb_agg(jsonb_build_object('month', g.m, 'units', coalesce(a.units, 0), 'rrp_usd', coalesce(a.rrp_usd, 0), 'sold_units', coalesce(a.sold_units, 0), 'left_units', coalesce(a.left_units, 0)) order by g.m)
        from (select (date_trunc('year', p_from) + make_interval(months => i))::date m from generate_series(0, 11) i) g
        left join (select month, sum(units) units, sum(rrp_usd) rrp_usd, sum(sold_units) sold_units, sum(left_units) left_units from perf_arrivals group by month) a on a.month = g.m),
    -- what is on hand today, by the month it arrived, where the arrival date is known
    'on_hand_by_arrival', jsonb_build_object(
      'unknown', (select count(*) from ops_pieces o left join ops_receipts r on r.receipt_id = o.receipt_id
                   where o.store_id = p_store and o.state not in ('sold', 'not_received', 'in_transit') and r.arrival_date is null),
      'years', coalesce((select jsonb_agg(jsonb_build_object('year', z.y, 'units', z.n) order by z.y)
                 from (select extract(year from r.arrival_date)::int y, count(*) n from ops_pieces o join ops_receipts r on r.receipt_id = o.receipt_id
                        where o.store_id = p_store and o.state not in ('sold', 'not_received', 'in_transit') and r.arrival_date is not null group by 1) z), '[]'::jsonb)));
$$;
revoke execute on function public.perf_brands(date, date, smallint) from public, anon, authenticated;
