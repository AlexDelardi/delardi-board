-- Corrections keep their own confirmed / unconfirmed mark.
--
-- cat_apply_overlay() wrote every saved correction (cat_overlay) as 'confirmed', so a judgment
-- call (e.g. a collection inferred from the design, not confirmed by the brand) lost its
-- unconfirmed mark every time the overlay was applied: at every Catalogue load and every
-- correction. Each correction now carries its flag, and has_unconfirmed is recomputed for every
-- design the overlay touches.

alter table public.cat_overlay add column if not exists flag text not null default 'confirmed';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cat_overlay_flag_check') then
    alter table public.cat_overlay add constraint cat_overlay_flag_check check (flag in ('confirmed','unconfirmed'));
  end if;
end $$;

do $$
declare d text := pg_get_functiondef('public.cat_apply_overlay()'::regprocedure); e text;
begin
  e := replace(d, $q$select o.variant_id, o.key, o.value, o.value_num, 'confirmed', null$q$,
                  $q$select o.variant_id, o.key, o.value, o.value_num, o.flag, null$q$);
  e := replace(e, $q$  -- v2 facet cache:$q$,
$q$  -- unconfirmed marks for every design the overlay touches (corrections carry their own flag)
  update cat_models m set has_unconfirmed = exists (select 1 from cat_attributes a join cat_variants v using (variant_id)
      where v.model_id = m.model_id and a.flag = 'unconfirmed')
  where m.model_id in (select v.model_id from cat_overlay o join cat_variants v using (variant_id));
  -- v2 facet cache:$q$);
  if e = d or position('o.flag, null' in e) = 0 or position('corrections carry their own flag' in e) = 0 then
    raise exception 'cat_apply_overlay is not in the expected shape; nothing changed';
  end if;
  execute e;
end $$;
