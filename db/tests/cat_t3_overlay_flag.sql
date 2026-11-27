-- Corrections keep their own confirmed / unconfirmed mark. Invented fixtures. Rolled back.
begin;
do $$
begin
  insert into cat_models(model_id, article, brand, category, retail_category, in_stock) values ('ZZO-1','ZZO-1','Zz Brand','jewellery','ring',true);
  insert into cat_variants(variant_id, model_id, in_stock, sort_order) values ('ZZO-1-WG','ZZO-1',true,1);
  insert into cat_overlay(variant_id, key, value, source, flag) values
    ('ZZO-1-WG','collection','Zz Inferred','test: judgment call','unconfirmed'),
    ('ZZO-1-WG','model_name','Zz Band','test: brand page','confirmed');
  perform cat_apply_overlay();
  assert (select flag from cat_attributes where variant_id='ZZO-1-WG' and key='collection') = 'unconfirmed', 'a judgment call stays unconfirmed';
  assert (select flag from cat_attributes where variant_id='ZZO-1-WG' and key='model_name') = 'confirmed', 'a brand-backed value is confirmed';
  assert (select has_unconfirmed from cat_models where model_id='ZZO-1'), 'the design shows the unconfirmed mark';
  assert (select collection from cat_models where model_id='ZZO-1') = 'Zz Inferred', 'the value is applied';
  -- applying again (as every load does) keeps the mark
  drop table if exists _ov_new;  -- the scratch table lives until commit; production runs are separate transactions
  perform cat_apply_overlay();
  assert (select flag from cat_attributes where variant_id='ZZO-1-WG' and key='collection') = 'unconfirmed', 'the mark survives a second apply';
  -- confirming it later clears the design mark
  update cat_overlay set flag = 'confirmed' where variant_id='ZZO-1-WG' and key='collection';
  drop table if exists _ov_new;
  perform cat_apply_overlay();
  assert not (select has_unconfirmed from cat_models where model_id='ZZO-1'), 'once confirmed, the mark goes';
  begin
    insert into cat_overlay(variant_id, key, value, source, flag) values ('ZZO-1-WG','metal','gold','test','maybe');
    raise exception 'bad flag accepted';
  exception when check_violation then null; end;
end $$;
select ' ok' as result;
rollback;
