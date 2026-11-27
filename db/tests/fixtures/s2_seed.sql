-- Invented catalogue, stock and CRM rows for the Sprint 2 tests (s2_t2 to s2_t5).
-- Those tests run against whatever data is present; on the local database (schema only) they
-- had nothing to work on. Included right after `begin;`, so it is rolled back with the test.
-- Only fills an empty catalogue: against a copy with real data it adds nothing.
do $$
declare run bigint;
begin
  if exists (select 1 from cat_models) then return; end if;
  insert into cat_import_runs(source_file, source_built, run_by, notes) values ('s2 seed', '2026-01-01 s2 seed', 'test', 'invented') returning id into run;
  insert into cat_expected_keys(category, key, section, crucial, sort_order) values
    ('jewellery','collection','identity',true,1), ('jewellery','metal','materials',false,2)
  on conflict do nothing;
  insert into cat_models(model_id, article, brand, category, retail_category, in_stock, collection, model_name) values
    ('ZS-M1','ZS-M1','Zeta Seed','jewellery','ring',true,'Seed One','Seed ring'),
    ('ZS-M2','ZS-M2','Zeta Seed','jewellery','necklace',true,'Seed One','Seed necklace'),
    ('ZS-M3','ZS-M3','Zeta Seed','jewellery','earrings',false,'Seed Two','Seed earrings'),
    ('ZS-M4','ZS-M4','Zeta Seed','jewellery','bracelet',false,'Seed Two','Seed bracelet');
  insert into cat_variants(variant_id, model_id, colour_code, in_stock, sort_order) values
    ('ZS-M1-WG','ZS-M1','WG',true,1), ('ZS-M1-YG','ZS-M1','YG',true,2),
    ('ZS-M2-WG','ZS-M2','WG',true,1), ('ZS-M3-WG','ZS-M3','WG',false,1),
    ('ZS-M3-YG','ZS-M3','YG',false,2), ('ZS-M4-WG','ZS-M4','WG',false,1);
  insert into cat_pieces(serial, variant_id, size, price_uzs, import_run) values
    ('ZS-S001','ZS-M1-WG','54',1000,run), ('ZS-S002','ZS-M1-WG','55',1000,run),
    ('ZS-S003','ZS-M1-YG','53',1100,run), ('ZS-S004','ZS-M2-WG',null,2000,run);
  insert into cat_incoming(serial, variant_id, model_id, shipment, shipped_on, source) values
    ('ZS-T001','ZS-M2-WG','ZS-M2','SHIP-1',current_date - 2,'s2 seed'),
    ('ZS-T002','ZS-M2-WG','ZS-M2','SHIP-1',current_date - 2,'s2 seed'),
    ('ZS-T003','ZS-M4-WG','ZS-M4','SHIP-1',current_date - 2,'s2 seed');
  insert into cat_attributes(variant_id, key, value, flag, import_run) values
    ('ZS-M1-WG','metal','white gold','confirmed',run), ('ZS-M2-WG','metal','white gold','colibri_only',run),
    ('ZS-M4-WG','metal','white gold','confirmed',run);
  perform cat_apply_incoming();
  -- CRM: a client with purchases and nothing else linked
  insert into crm_clients(client_id, record_type, name_confirmed) values ('ZS-C1','client','Seed Client');
  insert into crm_transactions(client_id, sold_at, qty, net_uzs, item) values ('ZS-C1','2026-01-03',1,1000,'Seed ring');
end $$;
