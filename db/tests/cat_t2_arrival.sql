-- Newest arrivals by real arrival date. Invented fixtures. Rolled back.
begin;
do $$
declare r1 bigint; r2 bigint;
begin
  insert into cat_models(model_id, article, brand, category, retail_category, in_stock, latest_arrival_year) values
    ('ZZA-OLD','ZZA-OLD','Aaa Brand','jewellery','ring',true,2026),
    ('ZZA-NEW','ZZA-NEW','Zzz Brand','jewellery','ring',true,2025),
    ('ZZA-NONE','ZZA-NONE','Aaa Brand','jewellery','ring',true,2026);
  insert into cat_variants(variant_id, model_id, in_stock, sort_order) values ('ZZA-OLD-WG','ZZA-OLD',true,1),('ZZA-NEW-WG','ZZA-NEW',true,1),('ZZA-NONE-WG','ZZA-NONE',true,1);
  insert into ops_receipts(supplier, arrival_date, invoice_date) values ('ZZ Supplier','2026-02-01',null) returning receipt_id into r1;
  insert into ops_receipts(supplier, arrival_date, invoice_date) values ('ZZ Supplier',null,'2026-10-29') returning receipt_id into r2;
  insert into ops_pieces(store_id, brand, serial, model_id, state, receipt_id) values
    (1,'Aaa Brand','ZZA-S1','ZZA-OLD','in_stock',r1),(1,'Zzz Brand','ZZA-S2','ZZA-NEW','in_stock',r2),
    (1,'Zzz Brand','ZZA-S3','ZZA-NEW','sold',r1);
  perform cat_refresh_arrival_dates();
  assert (select latest_arrival_date from cat_models where model_id='ZZA-OLD') = '2026-02-01', 'arrival date from the receipt';
  assert (select latest_arrival_date from cat_models where model_id='ZZA-NEW') = '2026-10-29', 'invoice date when the arrival date is missing; sold pieces ignored';
  assert (select latest_arrival_date from cat_models where model_id='ZZA-NONE') is null, 'no dated receipt: no date';
  -- a receipt change refreshes by itself
  update ops_receipts set arrival_date = '2026-11-20' where receipt_id = r1;
  assert (select latest_arrival_date from cat_models where model_id='ZZA-OLD') = '2026-11-20', 'receipt trigger refreshes';
  -- v2 newest sorts by the date first, then the year (the cache it reads is empty on the local database)
  assert position('x.latest_arrival_date end desc nulls last' in pg_get_functiondef('public.cat_filter_v2(jsonb)'::regprocedure)) > 0
     and position('x.latest_arrival_date' in pg_get_functiondef('public.cat_filter_v2(jsonb)'::regprocedure))
       < position('x.latest_arrival_year end desc' in pg_get_functiondef('public.cat_filter_v2(jsonb)'::regprocedure)), 'v2 newest: date before year';
  assert position($q$then x.has_transit end desc$q$ in pg_get_functiondef('public.cat_filter_v2(jsonb)'::regprocedure)) = 0, 'v2 newest: transit no longer outranks the date';
  assert not has_function_privilege('anon','public.cat_refresh_arrival_dates()','execute'), 'closed to the page';
end $$;
select ' ok' as result;
rollback;
