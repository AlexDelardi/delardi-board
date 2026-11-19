-- Performance tool (roadmap W12), first version: the month's sales figures on one definition of a sale, read from the
-- tickets already in ops_tickets, with the bridge and the incentive estimate. Design: docs/specs/2026-11-19-performance-tool-design.md
--
-- One definition of a sale (perf_tickets):
--   * posted tickets, never the training ones; refund lines subtract;
--   * retail basis: a ticket is left out when a rule (a client, or words in the note) or a hand mark says founder /
--     trade / staff / cost_transfer / other; what is left out is reported on its own line;
--   * the seller is the ticket's, unless a note rule or a hand mark says otherwise;
--   * a large ticket is USD 10,000 or more at the month's rate (perf_fx; 12,000 until a rate is typed in).
-- Rules, plans, visits and incentive schemes are data, typed in through perf_save_month or loaded by hand: the
-- repository is public, so no real name, client or figure is in this file.
-- Only the perf-api edge function (service role) calls these.

alter table public.board_users add column can_view_performance boolean not null default false;
alter table public.editor_sessions add column can_use_perf boolean not null default false;
update public.board_users set can_view_performance = true where name = 'Alex';

create or replace function public.ops_has_right(p_actor text, p_right text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case p_right when 'manage_stock' then u.can_manage_stock
                        when 'view_stock' then u.can_view_stock
                        when 'view_cost' then u.can_view_cost
                        when 'view_performance' then u.can_view_performance
                        else false end
      from board_users u
     where u.name = p_actor and u.active
     limit 1), false);
$$;
revoke execute on function public.ops_has_right(text, text) from public, anon, authenticated;

-- A ticket is off the retail basis when its client is listed (kind 'client', pattern = client reference) or its note
-- has the words (kind 'note', pattern = the words, any case).
create table public.perf_basis_rules (
  rule_id  bigint generated always as identity primary key,
  kind     text not null check (kind in ('client', 'note')),
  pattern  text not null check (btrim(pattern) <> ''),
  basis    text not null check (basis in ('founder', 'trade', 'staff', 'cost_transfer', 'other')),
  note     text,
  unique (kind, pattern)
);
-- A sale keyed under a colleague's login: words in the note name the real seller.
create table public.perf_seller_rules (
  rule_id  bigint generated always as identity primary key,
  pattern  text not null unique check (btrim(pattern) <> ''),
  seller   text not null check (btrim(seller) <> '')
);
-- One ticket corrected by hand: its basis, its seller, its client. Null = as the rules say.
create table public.perf_ticket_marks (
  ticket_id   uuid primary key references public.ops_tickets(ticket_id) on delete cascade,
  basis       text check (basis in ('retail', 'founder', 'trade', 'staff', 'cost_transfer', 'other')),
  seller      text,
  client_id   text,
  note        text,
  updated_by  text not null,
  updated_at  timestamptz not null default now()
);
create table public.perf_months (
  store_id            smallint not null references public.ops_stores(store_id),
  month               date not null check (extract(day from month) = 1),
  plan_uzs            numeric(16,0) check (plan_uzs >= 0),
  plan_tickets        int check (plan_tickets >= 0),
  plan_large_tickets  int check (plan_large_tickets >= 0),
  plan_large_uzs      numeric(16,0) check (plan_large_uzs >= 0),
  visits              int check (visits >= 0),
  visits_appointment  int check (visits_appointment >= 0),
  fx                  numeric(12,2) check (fx > 0),
  note                text,
  updated_by          text not null,
  updated_at          timestamptz not null default now(),
  primary key (store_id, month)
);
create table public.perf_seller_months (
  store_id          smallint not null references public.ops_stores(store_id),
  month             date not null check (extract(day from month) = 1),
  seller            text not null check (btrim(seller) <> ''),
  plan_uzs          numeric(16,0) check (plan_uzs >= 0),
  commission        boolean not null default true,
  programme_counts  jsonb not null default '{}'::jsonb check (jsonb_typeof(programme_counts) = 'object'),
  paid_uzs          numeric(16,0) check (paid_uzs >= 0),
  primary key (store_id, month, seller)
);
-- The incentive scheme in force from a month on. rules:
--   { bands: [{from: 0.8, rate: 0.005}, …]            attainment of the seller's own plan → rate on her own sales
--     guardrail: [{from: 1.0, factor: 1}, …] | null    store attainment → factor on earned commission
--     programmes: [{key, label, label_ru?, pays, max, rule}]
--     person_cap: so'm | null }                        programmes per person
-- rule: {kind: "multi_item"} | {kind: "brand", brands: […]} | {kind: "category", category, exclude_brands?: […]}
--     | {kind: "lifecycle", value: "new" | "recaptured"}. Brand and category count pieces, the others tickets.
create table public.perf_schemes (
  scheme_id   bigint generated always as identity primary key,
  valid_from  date not null unique check (extract(day from valid_from) = 1),
  name        text not null,
  rules       jsonb not null check (jsonb_typeof(rules) = 'object')
);
create table public.perf_input_log (
  log_id  bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  actor   text not null,
  what    text not null,
  ref     text,
  old     jsonb,
  new     jsonb
);
alter table public.perf_basis_rules enable row level security;
alter table public.perf_seller_rules enable row level security;
alter table public.perf_ticket_marks enable row level security;
alter table public.perf_months enable row level security;
alter table public.perf_seller_months enable row level security;
alter table public.perf_schemes enable row level security;
alter table public.perf_input_log enable row level security;
revoke all on table public.perf_basis_rules, public.perf_seller_rules, public.perf_ticket_marks, public.perf_months,
  public.perf_seller_months, public.perf_schemes, public.perf_input_log from public, anon, authenticated;

-- The rate of a month: the one typed in, else 12,000 (the internal rate).
create function public.perf_fx(p_store smallint, p_month date) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select m.fx from perf_months m where m.store_id = p_store and m.month = date_trunc('month', p_month)::date), 12000);
$$;
revoke execute on function public.perf_fx(smallint, date) from public, anon, authenticated;

-- Every ticket of the period as the tool counts it. One row per ticket.
--   basis      'retail' or why it is left out
--   has_sale   it has at least one sale line (a refund-only ticket lowers sales and units, and is not a ticket)
--   lifecycle  for a retail ticket: new / returning (again within 250 days) / recaptured (after more) / no_record
create function public.perf_tickets(p_from date, p_to date, p_store smallint default 1)
returns table (ticket_id uuid, ticket_no text, sold_at date, month date, source text, seller text, client_id text, client_raw text, note text,
               basis text, basis_by text, has_sale boolean, net numeric, gross numeric, units int, large boolean, lifecycle text, days_since int)
language sql stable security definer set search_path = public, pg_temp as $$
  with t as (
    select o.ticket_id, o.ticket_no, o.sold_at, date_trunc('month', o.sold_at)::date as month, o.source,
           coalesce(nullif(btrim(k.seller), ''),
                    (select r.seller from perf_seller_rules r where o.note ilike '%' || r.pattern || '%' order by r.rule_id limit 1),
                    o.seller) as seller,
           coalesce(nullif(btrim(k.client_id), ''), o.client_id) as client_id, o.client_raw, o.note,
           coalesce(k.basis,
                    (select r.basis from perf_basis_rules r
                      where (r.kind = 'client' and r.pattern = coalesce(nullif(btrim(k.client_id), ''), o.client_id))
                         or (r.kind = 'note' and o.note ilike '%' || r.pattern || '%')
                      order by (r.kind = 'client') desc, r.rule_id limit 1),
                    'retail') as basis,
           case when k.basis is not null then 'mark' else 'rule' end as basis_by
      from ops_tickets o
      left join perf_ticket_marks k on k.ticket_id = o.ticket_id
     where o.store_id = p_store and o.status = 'posted' and o.source <> 'training'
  ), s as (
    select t.*, coalesce(l.has_sale, false) as has_sale, coalesce(l.net, 0) as net, coalesce(l.gross, 0) as gross, coalesce(l.units, 0)::int as units
      from t
      left join lateral (
        select bool_or(x.kind = 'sale') as has_sale,
               sum(case when x.kind = 'refund' then -x.net else x.net end) as net,
               sum((case when x.kind = 'refund' then -1 else 1 end) * coalesce(x.price_current, x.price_list, x.net) * coalesce(x.qty, 1)) as gross,
               sum((case when x.kind = 'refund' then -1 else 1 end) * coalesce(x.qty, 1)) as units
          from ops_ticket_lines x where x.ticket_id = t.ticket_id) l on true
  ), h as (
    -- the client's previous retail purchase on an earlier day, over all time
    select s.*, (select max(p.sold_at) from s p where p.client_id = s.client_id and p.basis = 'retail' and p.has_sale and p.sold_at < s.sold_at) as prev_at
      from s
  )
  select h.ticket_id, h.ticket_no, h.sold_at, h.month, h.source, h.seller, h.client_id, h.client_raw, h.note, h.basis, h.basis_by, h.has_sale,
         h.net, h.gross, h.units,
         h.has_sale and h.net >= 10000 * perf_fx(p_store, h.month) as large,
         case when h.basis <> 'retail' or not h.has_sale then null
              when h.client_id is null then 'no_record'
              when h.prev_at is null then 'new'
              when h.sold_at - h.prev_at <= 250 then 'returning'
              else 'recaptured' end as lifecycle,
         (h.sold_at - h.prev_at)::int as days_since
    from h
   where h.sold_at >= p_from and h.sold_at < p_to;
$$;
revoke execute on function public.perf_tickets(date, date, smallint) from public, anon, authenticated;

-- The figures of one period (from, to exclusive).
create function public.perf_period(p_from date, p_to date, p_store smallint default 1) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with t as (select * from perf_tickets(p_from, p_to, p_store)),
       r as (select * from t where basis = 'retail'),
       a as (
         select coalesce(sum(net), 0) net, coalesce(sum(gross), 0) gross, count(*) filter (where has_sale) tickets, coalesce(sum(units), 0) units,
                coalesce(sum(net / perf_fx(p_store, month)), 0) net_usd,
                count(*) filter (where has_sale and units >= 2) multi,
                count(*) filter (where large) large_tickets, coalesce(sum(net) filter (where large), 0) large_net,
                count(distinct client_id) filter (where has_sale and client_id is not null) clients
           from r)
  select jsonb_build_object(
    'net', a.net, 'gross', a.gross, 'net_usd', round(a.net_usd, 2),
    'discount_pct', case when a.gross > 0 then round((a.gross - a.net) / a.gross, 4) end,
    'tickets', a.tickets, 'units', a.units,
    'upt', case when a.tickets > 0 then round(a.units::numeric / a.tickets, 2) end,
    'atv', case when a.tickets > 0 then round(a.net / a.tickets) end,
    'asp', case when a.units > 0 then round(a.net / a.units) end,
    'multi_item_share', case when a.tickets > 0 then round(a.multi::numeric / a.tickets, 4) end,
    'large', jsonb_build_object('tickets', a.large_tickets, 'net', a.large_net),
    'base', jsonb_build_object('tickets', a.tickets - a.large_tickets, 'net', a.net - a.large_net,
              'avg', case when a.tickets - a.large_tickets > 0 then round((a.net - a.large_net) / (a.tickets - a.large_tickets)) end),
    'clients', a.clients,
    'lifecycle', (select jsonb_object_agg(k, jsonb_build_object('tickets', (select count(*) from r where r.lifecycle = k),
                           'net', (select coalesce(sum(r.net), 0) from r where r.lifecycle = k)))
                    from unnest(array['new', 'returning', 'recaptured', 'no_record']) k),
    'excluded', jsonb_build_object('tickets', (select count(*) from t where basis <> 'retail'), 'net', (select coalesce(sum(net), 0) from t where basis <> 'retail')))
    from a;
$$;
revoke execute on function public.perf_period(date, date, smallint) from public, anon, authenticated;

-- From a reference (tickets, large tickets, net, large net) to the actual: the gap split into three parts that add up
-- to it exactly. tickets: more or fewer tickets at the reference's average. mix: a different share of large tickets, at
-- the reference's averages. size: bigger or smaller tickets within the base book and within the large ones.
-- Null when the reference has no tickets.
create function public.perf_bridge(p_t0 numeric, p_l0 numeric, p_net0 numeric, p_lnet0 numeric,
                                   p_t1 numeric, p_l1 numeric, p_net1 numeric, p_lnet1 numeric) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare ab0 numeric; al0 numeric; ab1 numeric; al1 numeric; s0 numeric; s1 numeric; v_tickets numeric; v_mix numeric; v_size numeric;
begin
  if coalesce(p_t0, 0) <= 0 or p_net0 is null then return null; end if;
  if coalesce(p_t1, 0) <= 0 then
    return jsonb_build_object('from', p_net0, 'to', coalesce(p_net1, 0), 'tickets', coalesce(p_net1, 0) - p_net0, 'mix', 0, 'size', 0);
  end if;
  s0 := p_l0 / p_t0; s1 := p_l1 / p_t1;
  ab1 := case when p_t1 - p_l1 > 0 then (p_net1 - p_lnet1) / (p_t1 - p_l1) end;
  al1 := case when p_l1 > 0 then p_lnet1 / p_l1 end;
  ab0 := case when p_t0 - p_l0 > 0 then (p_net0 - p_lnet0) / (p_t0 - p_l0) end;
  al0 := case when p_l0 > 0 then p_lnet0 / p_l0 end;
  -- a layer the reference does not have takes the actual's average (and the other way round): its size part is then zero
  ab0 := coalesce(ab0, ab1, 0); al0 := coalesce(al0, al1, ab0);
  ab1 := coalesce(ab1, ab0);    al1 := coalesce(al1, al0);
  v_tickets := (p_t1 - p_t0) * (p_net0 / p_t0);
  v_mix := p_t1 * (s1 - s0) * (al0 - ab0);
  v_size := (p_net1 - p_net0) - v_tickets - v_mix;      -- = t1 × [(1 − s1)(ab1 − ab0) + s1(al1 − al0)], taken as the rest so the three add up exactly
  return jsonb_build_object('from', p_net0, 'to', p_net1, 'tickets', round(v_tickets), 'mix', round(v_mix), 'size', (p_net1 - p_net0) - round(v_tickets) - round(v_mix));
end $$;
revoke execute on function public.perf_bridge(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;

-- The incentive estimate of a month: the scheme in force applied to each seller's retail sales.
create function public.perf_incentive(p_month date, p_store smallint default 1) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_to    date := (date_trunc('month', p_month) + interval '1 month')::date;
  sc perf_schemes%rowtype; v_rules jsonb; v_store_net numeric; v_store_plan numeric; v_store_att numeric; v_guard numeric := 1;
  v_sellers jsonb := '[]'::jsonb; s record; pr jsonb; v_auto int; v_cnt int; v_prog jsonb; v_prog_sum numeric; v_cap numeric;
  v_att numeric; v_rate numeric; v_comm numeric; v_total_comm numeric := 0; v_total_prog numeric := 0;
begin
  select * into sc from perf_schemes where valid_from <= v_month order by valid_from desc limit 1;
  if not found then return null; end if;
  v_rules := sc.rules;
  v_cap := nullif(v_rules->>'person_cap', '')::numeric;
  select coalesce(sum(net), 0) into v_store_net from perf_tickets(v_month, v_to, p_store) where basis = 'retail';
  select plan_uzs into v_store_plan from perf_months where store_id = p_store and month = v_month;
  v_store_att := case when v_store_plan > 0 then v_store_net / v_store_plan end;
  if jsonb_typeof(v_rules->'guardrail') = 'array' and v_store_att is not null then
    select coalesce((select (g->>'factor')::numeric from jsonb_array_elements(v_rules->'guardrail') g
                      where v_store_att >= (g->>'from')::numeric order by (g->>'from')::numeric desc limit 1), 1) into v_guard;
  end if;

  for s in
    select x.seller, coalesce(t.net, 0) net, coalesce(t.tickets, 0) tickets, m.plan_uzs, coalesce(m.commission, true) commission,
           coalesce(m.programme_counts, '{}'::jsonb) overrides, m.paid_uzs
      from (select seller from perf_tickets(v_month, v_to, p_store) where basis = 'retail' and seller is not null
            union select seller from perf_seller_months where store_id = p_store and month = v_month) x
      left join (select seller, sum(net) net, count(*) filter (where has_sale) tickets
                   from perf_tickets(v_month, v_to, p_store) where basis = 'retail' group by seller) t on t.seller = x.seller
      left join perf_seller_months m on m.store_id = p_store and m.month = v_month and m.seller = x.seller
     order by coalesce(t.net, 0) desc, x.seller
  loop
    v_att := case when s.plan_uzs > 0 then s.net / s.plan_uzs end;
    v_rate := 0;
    if s.commission and v_att is not null and jsonb_typeof(v_rules->'bands') = 'array' then
      select coalesce((select (b->>'rate')::numeric from jsonb_array_elements(v_rules->'bands') b
                        where v_att >= (b->>'from')::numeric order by (b->>'from')::numeric desc limit 1), 0) into v_rate;
    end if;
    v_comm := round(greatest(s.net, 0) * v_rate * v_guard);
    v_prog := '[]'::jsonb; v_prog_sum := 0;
    for pr in select * from jsonb_array_elements(coalesce(v_rules->'programmes', '[]'::jsonb)) loop
      select case pr->'rule'->>'kind'
        when 'multi_item' then (select count(*) from perf_tickets(v_month, v_to, p_store) t
                                 where t.basis = 'retail' and t.seller = s.seller and t.has_sale and t.units >= 2)
        when 'lifecycle' then (select count(*) from perf_tickets(v_month, v_to, p_store) t
                                where t.basis = 'retail' and t.seller = s.seller and t.lifecycle = pr->'rule'->>'value')
        when 'brand' then (select coalesce(sum(coalesce(l.qty, 1)), 0) from perf_tickets(v_month, v_to, p_store) t
                             join ops_ticket_lines l on l.ticket_id = t.ticket_id and l.kind = 'sale'
                            where t.basis = 'retail' and t.seller = s.seller
                              and lower(btrim(l.brand_raw)) in (select lower(btrim(b)) from jsonb_array_elements_text(pr->'rule'->'brands') b))
        when 'category' then (select coalesce(sum(coalesce(l.qty, 1)), 0) from perf_tickets(v_month, v_to, p_store) t
                                join ops_ticket_lines l on l.ticket_id = t.ticket_id and l.kind = 'sale'
                                join cat_models m on m.model_id = l.model_id
                               where t.basis = 'retail' and t.seller = s.seller and m.category = pr->'rule'->>'category'
                                 and lower(btrim(coalesce(l.brand_raw, ''))) not in
                                     (select lower(btrim(b)) from jsonb_array_elements_text(coalesce(pr->'rule'->'exclude_brands', '[]'::jsonb)) b))
        else 0 end into v_auto;
      v_cnt := coalesce((s.overrides->>(pr->>'key'))::int, v_auto);
      v_prog := v_prog || jsonb_build_array(jsonb_build_object('key', pr->>'key', 'label', pr->>'label', 'label_ru', pr->>'label_ru',
                  'pays', (pr->>'pays')::numeric, 'max', (pr->>'max')::int, 'auto', v_auto, 'count', v_cnt, 'overridden', s.overrides ? (pr->>'key'),
                  'paid_count', least(v_cnt, (pr->>'max')::int), 'amount', least(v_cnt, (pr->>'max')::int) * (pr->>'pays')::numeric));
      v_prog_sum := v_prog_sum + least(v_cnt, (pr->>'max')::int) * (pr->>'pays')::numeric;
    end loop;
    v_sellers := v_sellers || jsonb_build_array(jsonb_build_object('seller', s.seller, 'net', s.net, 'tickets', s.tickets, 'plan', s.plan_uzs,
                  'attainment', round(v_att, 4), 'commission_applies', s.commission, 'rate', v_rate, 'guardrail', v_guard, 'commission', v_comm,
                  'programmes', v_prog, 'programmes_before_cap', v_prog_sum, 'programmes_total', least(v_prog_sum, coalesce(v_cap, v_prog_sum)),
                  'total', v_comm + least(v_prog_sum, coalesce(v_cap, v_prog_sum)), 'paid', s.paid_uzs));
    v_total_comm := v_total_comm + v_comm;
    v_total_prog := v_total_prog + least(v_prog_sum, coalesce(v_cap, v_prog_sum));
  end loop;
  return jsonb_build_object('scheme', jsonb_build_object('name', sc.name, 'valid_from', sc.valid_from, 'rules', v_rules),
    'store', jsonb_build_object('net', v_store_net, 'plan', v_store_plan, 'attainment', round(v_store_att, 4), 'guardrail', v_guard),
    'sellers', v_sellers,
    'total', jsonb_build_object('commission', v_total_comm, 'programmes', v_total_prog, 'total', v_total_comm + v_total_prog,
               'pct_of_sales', case when v_store_net > 0 then round((v_total_comm + v_total_prog) / v_store_net, 4) end,
               'paid', (select sum(paid_uzs) from perf_seller_months where store_id = p_store and month = v_month)));
end $$;
revoke execute on function public.perf_incentive(date, smallint) from public, anon, authenticated;

-- Everything the month screen shows.
create function public.perf_month(p_month date, p_store smallint default 1) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_to    date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_ly    date := (v_month - interval '1 year')::date;
  v_year  date := date_trunc('year', v_month)::date;
  inp perf_months%rowtype; cur jsonb; ly jsonb; v_fx numeric; v_trend jsonb;
begin
  select * into inp from perf_months where store_id = p_store and month = v_month;
  v_fx := perf_fx(p_store, v_month);
  cur := perf_period(v_month, v_to, p_store);
  ly  := perf_period(v_ly, (v_ly + interval '1 month')::date, p_store);
  select jsonb_agg(jsonb_build_object('month', g.m, 'net', (k.p->>'net')::numeric, 'net_usd', (k.p->>'net_usd')::numeric,
           'tickets', (k.p->>'tickets')::int, 'atv', (k.p->>'atv')::numeric, 'upt', (k.p->>'upt')::numeric, 'discount_pct', (k.p->>'discount_pct')::numeric,
           'plan', pm.plan_uzs, 'visits', pm.visits,
           'conversion', case when pm.visits > 0 then round((k.p->>'tickets')::numeric / pm.visits, 4) end) order by g.m)
    into v_trend
    from (select (v_month - make_interval(months => i))::date m from generate_series(0, 12) i) g
    cross join lateral (select perf_period(g.m, (g.m + interval '1 month')::date, p_store) p) k
    left join perf_months pm on pm.store_id = p_store and pm.month = g.m;
  return jsonb_build_object(
    'month', v_month, 'store_id', p_store, 'fx', v_fx, 'large_from_uzs', 10000 * v_fx,
    'inputs', jsonb_build_object('plan_uzs', inp.plan_uzs, 'plan_tickets', inp.plan_tickets, 'plan_large_tickets', inp.plan_large_tickets,
                'plan_large_uzs', inp.plan_large_uzs, 'visits', inp.visits, 'visits_appointment', inp.visits_appointment, 'fx', inp.fx, 'note', inp.note,
                'updated_by', inp.updated_by, 'updated_at', inp.updated_at,
                'sellers', coalesce((select jsonb_agg(jsonb_build_object('seller', m.seller, 'plan_uzs', m.plan_uzs, 'commission', m.commission,
                                              'programme_counts', m.programme_counts, 'paid_uzs', m.paid_uzs) order by m.seller)
                                       from perf_seller_months m where m.store_id = p_store and m.month = v_month), '[]'::jsonb)),
    'cur', cur, 'ly', ly,
    'ytd', perf_period(v_year, v_to, p_store),
    'ytd_ly', perf_period((v_year - interval '1 year')::date, (v_to - interval '1 year')::date, p_store),
    'plan', case when inp.plan_uzs > 0 then jsonb_build_object('plan', inp.plan_uzs, 'attainment', round((cur->>'net')::numeric / inp.plan_uzs, 4),
                    'gap', (cur->>'net')::numeric - inp.plan_uzs) end,
    'funnel', jsonb_build_object('visits', inp.visits, 'visits_appointment', inp.visits_appointment,
                'conversion', case when inp.visits > 0 then round((cur->>'tickets')::numeric / inp.visits, 4) end),
    'trend', v_trend,
    'bridge', jsonb_build_object(
      'ly', perf_bridge((ly->>'tickets')::numeric, (ly->'large'->>'tickets')::numeric, (ly->>'net')::numeric, (ly->'large'->>'net')::numeric,
                        (cur->>'tickets')::numeric, (cur->'large'->>'tickets')::numeric, (cur->>'net')::numeric, (cur->'large'->>'net')::numeric),
      'plan', case when inp.plan_uzs > 0 and inp.plan_tickets > 0 then
                perf_bridge(inp.plan_tickets, coalesce(inp.plan_large_tickets, 0), inp.plan_uzs, coalesce(inp.plan_large_uzs, 0),
                            (cur->>'tickets')::numeric, (cur->'large'->>'tickets')::numeric, (cur->>'net')::numeric, (cur->'large'->>'net')::numeric) end),
    'excluded', coalesce((select jsonb_agg(jsonb_build_object('basis', x.basis, 'tickets', x.n, 'net', x.net) order by x.basis)
                            from (select basis, count(*) n, sum(net) net from perf_tickets(v_month, v_to, p_store) where basis <> 'retail' group by basis) x), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object('ticket_id', t.ticket_id, 'ticket_no', t.ticket_no, 'sold_at', t.sold_at, 'source', t.source,
                           'seller', t.seller, 'client_id', t.client_id, 'client', t.client_raw, 'note', t.note, 'basis', t.basis, 'basis_by', t.basis_by,
                           'net', t.net, 'units', t.units, 'large', t.large, 'lifecycle', t.lifecycle, 'days_since', t.days_since,
                           'marked', exists (select 1 from perf_ticket_marks k where k.ticket_id = t.ticket_id),
                           'mark', (select jsonb_build_object('basis', k.basis, 'seller', k.seller, 'client_id', k.client_id, 'note', k.note)
                                      from perf_ticket_marks k where k.ticket_id = t.ticket_id)) order by t.sold_at, t.ticket_no)
                           from perf_tickets(v_month, v_to, p_store) t), '[]'::jsonb),
    'incentive', perf_incentive(v_month, p_store));
end $$;
revoke execute on function public.perf_month(date, smallint) from public, anon, authenticated;

-- The first and the last month with tickets, for the month picker.
create function public.perf_span(p_store smallint default 1) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('first', date_trunc('month', min(sold_at))::date, 'last', date_trunc('month', max(sold_at))::date)
    from ops_tickets where store_id = p_store and status = 'posted' and source <> 'training';
$$;
revoke execute on function public.perf_span(smallint) from public, anon, authenticated;

-- Save the month's inputs. p: {month, store_id?, plan_uzs?, plan_tickets?, plan_large_tickets?, plan_large_uzs?, visits?,
-- visits_appointment?, fx?, note?, sellers?: [{seller, plan_uzs?, commission?, programme_counts?, paid_uzs?}]}.
-- What is sent replaces what was there (a missing or null value clears it); sellers not sent are removed. Logged.
create function public.perf_save_month(p jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_store smallint := coalesce((p->>'store_id')::smallint, 1);
  v_month date := date_trunc('month', (p->>'month')::date)::date;
  v_old jsonb; v_new jsonb; x jsonb; num text;
begin
  if not ops_has_right(p_actor, 'view_performance') then raise exception 'Your account cannot open Performance.'; end if;
  if v_month is null then raise exception 'Say which month.'; end if;
  foreach num in array array['plan_uzs', 'plan_tickets', 'plan_large_tickets', 'plan_large_uzs', 'visits', 'visits_appointment'] loop
    if (p->>num) is not null and (p->>num)::numeric < 0 then raise exception 'A figure cannot be below zero.'; end if;
  end loop;
  if (p->>'fx') is not null and (p->>'fx')::numeric <= 0 then raise exception 'The rate must be above zero.'; end if;
  if coalesce((p->>'plan_large_tickets')::int, 0) > coalesce((p->>'plan_tickets')::int, 0) then
    raise exception 'Planned large tickets cannot be more than planned tickets.';
  end if;
  if coalesce((p->>'plan_large_uzs')::numeric, 0) > coalesce((p->>'plan_uzs')::numeric, 0) then
    raise exception 'The planned value of large tickets cannot be more than the plan.';
  end if;
  if coalesce((p->>'visits_appointment')::int, 0) > coalesce((p->>'visits')::int, 0) then
    raise exception 'Appointments cannot be more than visits.';
  end if;
  select jsonb_build_object('month', to_jsonb(m) - 'updated_by' - 'updated_at',
           'sellers', (select coalesce(jsonb_agg(to_jsonb(s) order by s.seller), '[]'::jsonb) from perf_seller_months s where s.store_id = v_store and s.month = v_month))
    into v_old from perf_months m where m.store_id = v_store and m.month = v_month;
  insert into perf_months(store_id, month, plan_uzs, plan_tickets, plan_large_tickets, plan_large_uzs, visits, visits_appointment, fx, note, updated_by)
  values (v_store, v_month, (p->>'plan_uzs')::numeric, (p->>'plan_tickets')::int, (p->>'plan_large_tickets')::int, (p->>'plan_large_uzs')::numeric,
          (p->>'visits')::int, (p->>'visits_appointment')::int, (p->>'fx')::numeric, nullif(btrim(coalesce(p->>'note', '')), ''), p_actor)
  on conflict (store_id, month) do update set plan_uzs = excluded.plan_uzs, plan_tickets = excluded.plan_tickets,
    plan_large_tickets = excluded.plan_large_tickets, plan_large_uzs = excluded.plan_large_uzs, visits = excluded.visits,
    visits_appointment = excluded.visits_appointment, fx = excluded.fx, note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
  delete from perf_seller_months where store_id = v_store and month = v_month;
  for x in select * from jsonb_array_elements(coalesce(p->'sellers', '[]'::jsonb)) loop
    continue when btrim(coalesce(x->>'seller', '')) = '';
    if (x->>'plan_uzs')::numeric < 0 or (x->>'paid_uzs')::numeric < 0 then raise exception 'A figure cannot be below zero.'; end if;
    insert into perf_seller_months(store_id, month, seller, plan_uzs, commission, programme_counts, paid_uzs)
    values (v_store, v_month, btrim(x->>'seller'), (x->>'plan_uzs')::numeric, coalesce((x->>'commission')::boolean, true),
            coalesce((select jsonb_object_agg(e.key, (e.value #>> '{}')::int) from jsonb_each(coalesce(x->'programme_counts', '{}'::jsonb)) e
                       where e.value <> 'null'::jsonb and (e.value #>> '{}') ~ '^\d{1,4}$'), '{}'::jsonb),
            (x->>'paid_uzs')::numeric)
    on conflict (store_id, month, seller) do update set plan_uzs = excluded.plan_uzs, commission = excluded.commission,
      programme_counts = excluded.programme_counts, paid_uzs = excluded.paid_uzs;
  end loop;
  select jsonb_build_object('month', to_jsonb(m) - 'updated_by' - 'updated_at',
           'sellers', (select coalesce(jsonb_agg(to_jsonb(s) order by s.seller), '[]'::jsonb) from perf_seller_months s where s.store_id = v_store and s.month = v_month))
    into v_new from perf_months m where m.store_id = v_store and m.month = v_month;
  if v_old is distinct from v_new then
    insert into perf_input_log(actor, what, ref, old, new) values (p_actor, 'month', v_month::text, v_old, v_new);
  end if;
  return perf_month(v_month, v_store);
end $$;
revoke execute on function public.perf_save_month(jsonb, text) from public, anon, authenticated;

-- Correct how one ticket is counted. p: {basis?, seller?, client_id?, note?}; a null or empty value means "as the rules
-- say"; all three empty removes the correction. Logged.
create function public.perf_mark_ticket(p_ticket uuid, p jsonb, p_actor text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_basis text := nullif(btrim(coalesce(p->>'basis', '')), '');
  v_seller text := nullif(btrim(coalesce(p->>'seller', '')), '');
  v_client text := nullif(upper(btrim(coalesce(p->>'client_id', ''))), '');
  v_old jsonb;
begin
  if not ops_has_right(p_actor, 'view_performance') then raise exception 'Your account cannot open Performance.'; end if;
  if not exists (select 1 from ops_tickets where ticket_id = p_ticket and source <> 'training') then raise exception 'No ticket with that reference.'; end if;
  if v_basis is not null and v_basis not in ('retail', 'founder', 'trade', 'staff', 'cost_transfer', 'other') then raise exception 'That is not a basis.'; end if;
  if v_client is not null and not exists (select 1 from crm_clients where client_id = v_client) then raise exception 'No client with that reference.'; end if;
  select to_jsonb(k) - 'updated_at' into v_old from perf_ticket_marks k where k.ticket_id = p_ticket;
  if v_basis is null and v_seller is null and v_client is null then
    delete from perf_ticket_marks where ticket_id = p_ticket;
  else
    insert into perf_ticket_marks(ticket_id, basis, seller, client_id, note, updated_by)
    values (p_ticket, v_basis, v_seller, v_client, nullif(btrim(coalesce(p->>'note', '')), ''), p_actor)
    on conflict (ticket_id) do update set basis = excluded.basis, seller = excluded.seller, client_id = excluded.client_id,
      note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
  end if;
  insert into perf_input_log(actor, what, ref, old, new)
  values (p_actor, 'ticket', p_ticket::text, v_old, (select to_jsonb(k) - 'updated_at' from perf_ticket_marks k where k.ticket_id = p_ticket));
end $$;
revoke execute on function public.perf_mark_ticket(uuid, jsonb, text) from public, anon, authenticated;
