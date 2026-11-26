-- "Newest arrivals" by the real arrival date, not the year.
--
-- cat_models.latest_arrival_year comes from the load and is only a year (and was wrong for
-- some brands: a 29 Oct 2026 Chimento delivery carried 2025). Ties then fell to brand A–Z,
-- so the Catalogue's newest list was the first brand alphabetically with stock that year.
--
-- latest_arrival_date = the latest arrival date of the design's pieces in stock, from the
-- receipt each piece came in on (ops_pieces.receipt_id → ops_receipts.arrival_date, or the
-- invoice date when the arrival date is missing). Designs with no dated receipt keep NULL and
-- sort after dated ones, then by year as before.
-- Kept fresh by statement triggers: after a Catalogue load finishes (it writes its counts to
-- cat_import_runs last) and after receipts are added or changed.

alter table public.cat_models add column if not exists latest_arrival_date date;

create or replace function public.cat_refresh_arrival_dates() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  with d as (
    select p.model_id, max(coalesce(r.arrival_date, r.invoice_date)) arr
    from ops_pieces p join ops_receipts r using (receipt_id)
    where p.state = 'in_stock' and p.model_id is not null
    group by p.model_id)
  update cat_models m set latest_arrival_date = d.arr
  from (select m2.model_id, d.arr from cat_models m2 left join d using (model_id)) d
  where d.model_id = m.model_id and m.latest_arrival_date is distinct from d.arr;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.cat_refresh_arrival_dates() from public, anon, authenticated;

create or replace function public.cat_refresh_arrival_dates_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin perform cat_refresh_arrival_dates(); return null; end $$;
revoke execute on function public.cat_refresh_arrival_dates_trg() from public, anon, authenticated;

drop trigger if exists cat_import_runs_arrival on public.cat_import_runs;
create trigger cat_import_runs_arrival after update on public.cat_import_runs
  for each statement execute function public.cat_refresh_arrival_dates_trg();
drop trigger if exists ops_receipts_arrival on public.ops_receipts;
create trigger ops_receipts_arrival after insert or update on public.ops_receipts
  for each statement execute function public.cat_refresh_arrival_dates_trg();

-- The server-side filter (v2) sorts "newest" the same way.
do $$
declare d text := pg_get_functiondef('public.cat_filter_v2(jsonb)'::regprocedure); e text;
begin
  e := replace(d, 'm.latest_arrival_year,m.completeness', 'm.latest_arrival_year,m.latest_arrival_date,m.completeness');
  e := replace(e, $q$case when p_request->>'sort'='newest' then x.latest_arrival_year end desc nulls last,$q$,
    $q$case when p_request->>'sort'='newest' then x.latest_arrival_date end desc nulls last,
    case when p_request->>'sort'='newest' then x.latest_arrival_year end desc nulls last,$q$);
  if e = d or position('x.latest_arrival_date' in e) = 0 or position('m.latest_arrival_date' in e) = 0 then
    raise exception 'cat_filter_v2 is not in the expected shape; nothing changed';
  end if;
  execute e;
end $$;

select public.cat_refresh_arrival_dates();
