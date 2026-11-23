-- CRM cockpit: what one sales rep should look at today.
--   crm_cockpit(rep label, as of, days)
--     summary      her clients, their lifetime spend, how many were approached in the last 30 days
--     dates        birthdays and important dates of her clients from 7 days back to 30 days ahead
--     to_contact   clients never approached, or not approached for `days` (230) or more; do-not-contact and related
--                  parties left out; highest lifetime spend first; the first 60, with the full count beside
--     follow_ups   clients who bought in the last 75 days and were not approached since: two days, two weeks, two months
--     missed       open requests of her clients (asked for something that was not there)
-- "Approached" is the contact log. A client's rep is the assigned owner, else the owner from sales, as in the list.
-- Reads only. Called by crm-api with the service role; nobody else may execute it.

create function public.crm_cockpit(p_rep text, p_today date default current_date, p_days integer default 230) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_src text; v_label text; v_days int := greatest(coalesce(p_days, 230), 1); v jsonb;
begin
  select source_name, label into v_src, v_label from crm_sales_reps where lower(btrim(label)) = lower(btrim(coalesce(p_rep, ''))) order by active desc, id limit 1;
  if v_src is null then raise exception 'No sales rep with that name.'; end if;
  with mine as (
    select q.client_id, q.display_name, q.record_type, q.lifetime_spend_uzs, q.last_purchase_at, q.last_contact_on, q.last_contact_channel,
           q.do_not_contact, q.related_party, q.lifecycle_status, q.abc_class, q.birth_day_any, q.birth_month_any, q.birth_confirmed,
           extract(year from coalesce(k.dob_confirmed, k.dob_colibri, k.dob_marketing))::int birth_year
      from crm_queue q join crm_clients k on k.client_id = q.client_id
     where q.client_owner = v_src and q.merged_into is null and k.record_state in ('open', 'confirmed', 'parked')   -- live records only
  ), raw_dates as (
    select m.client_id, m.display_name, 'birthday'::text kind, null::text label, m.birth_month_any mm, m.birth_day_any dd,
           case when m.birth_confirmed then m.birth_year end yy, m.birth_confirmed confirmed, m.do_not_contact
      from mine m where m.birth_month_any is not null and m.birth_day_any is not null
    union all
    select m.client_id, m.display_name, i.kind, i.label, i.month, i.day, i.year, true, m.do_not_contact
      from crm_important_dates i join mine m on m.client_id = i.client_id
  ), dates as (
    select r.*, o.occ, (o.occ - p_today) in_days
      from raw_dates r cross join lateral (
        select (make_date(extract(year from p_today)::int + g, r.mm, 1) + (r.dd - 1)) occ from generate_series(-1, 1) g
         where (make_date(extract(year from p_today)::int + g, r.mm, 1) + (r.dd - 1)) between p_today - 7 and p_today + 30
         order by 1 limit 1) o
  ), due as (
    select m.*, case when m.last_contact_on is null then 'never' else 'overdue' end reason, (p_today - m.last_contact_on) days_since
      from mine m
     where not m.do_not_contact and not m.related_party and (m.last_contact_on is null or p_today - m.last_contact_on >= v_days)
  ), buys as (
    select t.client_id, t.sold_at, sum(coalesce(t.qty, 1)) items, sum(coalesce(t.net_uzs, 0)) net,
           row_number() over (partition by t.client_id order by t.sold_at desc) rn
      from crm_transactions t join mine m on m.client_id = t.client_id
     where t.sold_at between p_today - 75 and p_today - 2 group by t.client_id, t.sold_at
  ), follow as (
    select b.client_id, m.display_name, b.sold_at, (p_today - b.sold_at) days_since, b.items, b.net,
           case when p_today - b.sold_at >= 60 then 'two_months' when p_today - b.sold_at >= 14 then 'two_weeks' else 'two_days' end stage
      from buys b join mine m on m.client_id = b.client_id
     where b.rn = 1 and not m.do_not_contact and not m.related_party and (m.last_contact_on is null or m.last_contact_on <= b.sold_at)
  ), missed as (
    select d.id, d.client_id, m.display_name, d.asked_at, d.kind, d.brand, d.excerpt
      from crm_missed_demand d join mine m on m.client_id = d.client_id where d.status = 'open'
  )
  select jsonb_build_object(
    'rep', v_label, 'as_of', p_today, 'days', v_days,
    'summary', jsonb_build_object(
      'clients', (select count(*) from mine), 'spend', (select coalesce(sum(lifetime_spend_uzs), 0) from mine),
      'contacted_30d', (select count(*) from mine where last_contact_on >= p_today - 30),
      'never_contacted', (select count(*) from due where reason = 'never'), 'overdue', (select count(*) from due where reason = 'overdue'),
      'dates_next_30', (select count(*) from dates where in_days >= 0), 'follow_ups', (select count(*) from follow), 'missed_open', (select count(*) from missed)),
    'dates', coalesce((select jsonb_agg(jsonb_build_object('client_id', client_id, 'name', display_name, 'kind', kind, 'label', label, 'on', occ, 'in_days', in_days,
                 'confirmed', confirmed, 'years', case when yy is not null and extract(year from occ)::int > yy then extract(year from occ)::int - yy end,
                 'do_not_contact', do_not_contact) order by in_days, display_name, kind) from dates), '[]'::jsonb),
    'to_contact_total', (select count(*) from due),
    'to_contact', coalesce((select jsonb_agg(z.j order by z.ord) from (
        select jsonb_build_object('client_id', client_id, 'name', display_name, 'reason', reason, 'days_since', days_since, 'last_contact_on', last_contact_on,
                 'last_purchase_at', last_purchase_at, 'spend', lifetime_spend_uzs, 'lifecycle', lifecycle_status, 'abc', abc_class, 'record_type', record_type) j,
               row_number() over (order by lifetime_spend_uzs desc nulls last, last_purchase_at desc nulls last, client_id) ord
          from due order by ord limit 60) z), '[]'::jsonb),
    'follow_ups', coalesce((select jsonb_agg(jsonb_build_object('client_id', client_id, 'name', display_name, 'sold_at', sold_at, 'days_since', days_since,
                 'stage', stage, 'items', items, 'net', net) order by days_since, display_name) from follow), '[]'::jsonb),
    'missed', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'client_id', client_id, 'name', display_name, 'asked_at', asked_at, 'kind', kind,
                 'brand', brand, 'excerpt', excerpt) order by asked_at desc) from missed), '[]'::jsonb))
    into v;
  return v;
end $$;
revoke execute on function public.crm_cockpit(text, date, integer) from public, anon, authenticated;
