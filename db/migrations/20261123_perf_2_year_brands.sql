-- Performance tool, second pass: the year, brands, and arrivals by brand and year.
--
--   perf_year(year)      the year month by month, to date against the same months last year and against plan
--   perf_brands(from,to) net sales, units and discount by brand for a period, last year beside it, what is on hand,
--                        and what arrived
--   perf_arrivals        arrivals by brand and year as Colibri's arrival report gives them (units and retail value in
--                        USD, with what was sold from them and what is left). The report has no dates inside the year.
--
-- Same rules as perf_1: security definer, pinned search_path, no execute for public/anon/authenticated; tables RLS on,
-- no policies.

create table public.perf_arrivals (
  year        int not null check (year between 2000 and 2100),
  brand       text not null check (btrim(brand) <> ''),
  units       int not null default 0,
  rrp_usd     numeric(16,2) not null default 0,   -- retail value of what arrived, USD
  sold_units  int not null default 0,
  left_units  int not null default 0,
  source      text,
  loaded_at   timestamptz not null default now(),
  primary key (year, brand)
);
alter table public.perf_arrivals enable row level security;
revoke all on table public.perf_arrivals from public, anon, authenticated;

-- The whole list at once: what is sent replaces what was there.
create function public.perf_load_arrivals(p jsonb, p_actor text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if not ops_has_right(p_actor, 'view_performance') then raise exception 'Your account cannot open Performance.'; end if;
  if jsonb_typeof(p->'rows') <> 'array' or jsonb_array_length(p->'rows') = 0 then raise exception 'No arrival rows were sent.'; end if;
  delete from perf_arrivals where true;
  insert into perf_arrivals(year, brand, units, rrp_usd, sold_units, left_units, source)
  -- one line per year and brand, whatever the spelling of the brand in the rows
  select (r->>'year')::int, max(btrim(r->>'brand')), sum(coalesce((r->>'units')::int, 0)), sum(coalesce((r->>'rrp_usd')::numeric, 0)),
         sum(coalesce((r->>'sold_units')::int, 0)), sum(coalesce((r->>'left_units')::int, 0)), p->>'source'
    from jsonb_array_elements(p->'rows') r
   where btrim(coalesce(r->>'brand', '')) <> ''
   group by (r->>'year')::int, lower(btrim(r->>'brand'));
  get diagnostics n = row_count;
  insert into perf_input_log(actor, what, ref, new) values (p_actor, 'arrivals', p->>'source', jsonb_build_object('rows', n));
  return n;
end $$;
revoke execute on function public.perf_load_arrivals(jsonb, text) from public, anon, authenticated;

create function public.perf_year(p_year int, p_store smallint default 1) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_from date := make_date(p_year, 1, 1);
  v_last date;      -- the last month of the year that has a ticket
  v_to   date;      -- the day after the period compared
  cur jsonb; ly jsonb; v_months jsonb; v_plan_td numeric; v_plan_full numeric;
begin
  select date_trunc('month', max(sold_at))::date into v_last from ops_tickets
   where store_id = p_store and status = 'posted' and source <> 'training' and sold_at >= v_from and sold_at < v_from + interval '1 year';
  v_to := coalesce((v_last + interval '1 month')::date, (v_from + interval '1 year')::date);
  cur := perf_period(v_from, v_to, p_store);
  ly  := perf_period((v_from - interval '1 year')::date, (v_to - interval '1 year')::date, p_store);
  select jsonb_agg(jsonb_build_object('month', g.m, 'in_period', g.m < v_to,
           'net', (k.p->>'net')::numeric, 'tickets', (k.p->>'tickets')::int, 'units', (k.p->>'units')::int, 'atv', (k.p->>'atv')::numeric,
           'upt', (k.p->>'upt')::numeric, 'discount_pct', (k.p->>'discount_pct')::numeric,
           'large_net', (k.p->'large'->>'net')::numeric, 'large_tickets', (k.p->'large'->>'tickets')::int, 'base_net', (k.p->'base'->>'net')::numeric,
           'ly_net', (l.p->>'net')::numeric, 'ly_tickets', (l.p->>'tickets')::int, 'ly_atv', (l.p->>'atv')::numeric,
           'plan', pm.plan_uzs, 'visits', pm.visits,
           'conversion', case when pm.visits > 0 then round((k.p->>'tickets')::numeric / pm.visits, 4) end) order by g.m)
    into v_months
    from (select (v_from + make_interval(months => i))::date m from generate_series(0, 11) i) g
    cross join lateral (select perf_period(g.m, (g.m + interval '1 month')::date, p_store) p) k
    cross join lateral (select perf_period((g.m - interval '1 year')::date, (g.m - interval '11 months')::date, p_store) p) l
    left join perf_months pm on pm.store_id = p_store and pm.month = g.m;
  select sum(plan_uzs) filter (where month < v_to), sum(plan_uzs) into v_plan_td, v_plan_full
    from perf_months where store_id = p_store and month >= v_from and month < v_from + interval '1 year';
  return jsonb_build_object(
    'year', p_year, 'store_id', p_store, 'through', (v_to - interval '1 month')::date, 'complete', v_to = (v_from + interval '1 year')::date,
    'months', v_months, 'cur', cur, 'ly', ly,
    'ly_full', perf_period((v_from - interval '1 year')::date, v_from, p_store),
    'plan', jsonb_build_object('to_date', v_plan_td, 'full', v_plan_full,
              -- attainment only over the months that have a plan, so a year with two planned months is not judged on twelve
              'net_planned_months', (select sum((m->>'net')::numeric) from jsonb_array_elements(v_months) m where (m->>'plan') is not null and (m->>'in_period')::boolean),
              'attainment', case when v_plan_td > 0 then round((select sum((m->>'net')::numeric) from jsonb_array_elements(v_months) m
                                   where (m->>'plan') is not null and (m->>'in_period')::boolean) / v_plan_td, 4) end),
    'bridge', jsonb_build_object('ly',
      perf_bridge((ly->>'tickets')::numeric, (ly->'large'->>'tickets')::numeric, (ly->>'net')::numeric, (ly->'large'->>'net')::numeric,
                  (cur->>'tickets')::numeric, (cur->'large'->>'tickets')::numeric, (cur->>'net')::numeric, (cur->'large'->>'net')::numeric)));
end $$;
revoke execute on function public.perf_year(int, smallint) from public, anon, authenticated;

create function public.perf_brands(p_from date, p_to date, p_store smallint default 1) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with ln as (
    -- every line of a retail ticket in the period (cur) or in the same period a year before (ly)
    select w.which, lower(btrim(coalesce(nullif(btrim(l.brand_raw), ''), '—'))) k, coalesce(nullif(btrim(l.brand_raw), ''), '—') brand, t.ticket_id,
           (case l.kind when 'refund' then -1 else 1 end) sgn, l.net, coalesce(l.price_current, l.price_list, l.net) * coalesce(l.qty, 1) gross, coalesce(l.qty, 1) qty, l.kind
      from (values ('cur', p_from, p_to), ('ly', (p_from - interval '1 year')::date, (p_to - interval '1 year')::date)) w(which, f, t2)
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
    select lower(btrim(o.brand)) k, max(o.brand) brand, count(*) units,
           sum((select c.price_uzs from cat_pieces c where upper(btrim(c.serial)) = upper(btrim(o.serial)) order by c.id limit 1)) value_uzs
      from ops_pieces o where o.store_id = p_store and o.state not in ('sold', 'not_received') group by 1
  ), ar as (
    select lower(btrim(a.brand)) k, max(a.brand) brand, sum(a.units) units, sum(a.rrp_usd) rrp_usd, sum(a.sold_units) sold_units, sum(a.left_units) left_units
      from perf_arrivals a where a.year between extract(year from p_from)::int and extract(year from (p_to - 1))::int group by 1
  ), keys as (select k from s union select k from st union select k from ar),
  tot as (select coalesce(sum(net), 0) net from s)
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'total', jsonb_build_object('net', (select net from tot), 'units', (select coalesce(sum(units), 0) from s), 'ly_net', (select coalesce(sum(ly_net), 0) from s),
               'stock_units', (select coalesce(sum(units), 0) from st), 'stock_value', (select coalesce(sum(value_uzs), 0) from st),
               'arr_units', (select coalesce(sum(units), 0) from ar), 'arr_rrp_usd', (select coalesce(sum(rrp_usd), 0) from ar)),
    'brands', coalesce((select jsonb_agg(jsonb_build_object(
        'brand', coalesce(s.brand_cur, s.brand_any, st.brand, ar.brand), 'net', coalesce(s.net, 0),
        'share', case when (select net from tot) > 0 then round(coalesce(s.net, 0) / (select net from tot), 4) end,
        'discount_pct', case when s.gross > 0 then round((s.gross - s.net) / s.gross, 4) end,
        'units', coalesce(s.units, 0), 'tickets', coalesce(s.tickets, 0), 'asp', case when s.units > 0 then round(s.net / s.units) end,
        'ly_net', coalesce(s.ly_net, 0), 'ly_units', coalesce(s.ly_units, 0),
        'stock_units', coalesce(st.units, 0), 'stock_value', st.value_uzs,
        'arr_units', ar.units, 'arr_rrp_usd', ar.rrp_usd, 'arr_sold_units', ar.sold_units, 'arr_left_units', ar.left_units)
        order by coalesce(s.net, 0) desc, coalesce(s.ly_net, 0) desc, coalesce(st.units, 0) desc, keys.k)
      from keys left join s on s.k = keys.k left join st on st.k = keys.k left join ar on ar.k = keys.k), '[]'::jsonb),
    -- arrivals by year, all brands together, for the chart
    'arrival_years', coalesce((select jsonb_agg(jsonb_build_object('year', y.year, 'units', y.units, 'rrp_usd', y.rrp_usd, 'sold_units', y.sold_units, 'left_units', y.left_units) order by y.year)
        from (select year, sum(units) units, sum(rrp_usd) rrp_usd, sum(sold_units) sold_units, sum(left_units) left_units from perf_arrivals group by year) y), '[]'::jsonb),
    -- what is on hand today, by the month it arrived, where the arrival date is known
    'on_hand_by_arrival', jsonb_build_object(
      'unknown', (select count(*) from ops_pieces o left join ops_receipts r on r.receipt_id = o.receipt_id
                   where o.store_id = p_store and o.state not in ('sold', 'not_received') and r.arrival_date is null),
      'years', coalesce((select jsonb_agg(jsonb_build_object('year', z.y, 'units', z.n) order by z.y)
                 from (select extract(year from r.arrival_date)::int y, count(*) n from ops_pieces o join ops_receipts r on r.receipt_id = o.receipt_id
                        where o.store_id = p_store and o.state not in ('sold', 'not_received') and r.arrival_date is not null group by 1) z), '[]'::jsonb)));
$$;
revoke execute on function public.perf_brands(date, date, smallint) from public, anon, authenticated;
