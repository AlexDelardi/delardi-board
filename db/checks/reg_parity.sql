-- One register: read-only check. Lists every design whose stored catalogue counts differ from what the piece
-- register (ops_pieces) gives. Run before applying 20261127_reg_3 (differences = what the switch will change)
-- and after it (expected: no rows).
with live as (
  select v.model_id,
         count(*) filter (where o.state = 'in_stock')   as stock,
         count(*) filter (where o.state = 'in_transit') as transit,
         min(o.price_uzs) filter (where o.state = 'in_stock') as pmin,
         max(o.price_uzs) filter (where o.state = 'in_stock') as pmax
    from cat_variants v left join ops_pieces o on o.variant_id = v.variant_id
   group by v.model_id)
select m.model_id, m.brand,
       m.qty_stock as stored_stock, l.stock as register_stock,
       m.qty_transit as stored_transit, l.transit as register_transit,
       m.price_min_uzs as stored_min, l.pmin as register_min,
       m.price_max_uzs as stored_max, l.pmax as register_max
  from cat_models m join live l using (model_id)
 where m.qty_stock is distinct from l.stock::int
    or m.in_stock is distinct from (l.stock > 0)
    or m.qty_transit is distinct from l.transit::int
    or (l.stock > 0 and (m.price_min_uzs is distinct from l.pmin or m.price_max_uzs is distinct from l.pmax))
 order by m.brand, m.model_id;
