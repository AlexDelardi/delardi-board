-- Training reset failed on production: Supabase's safeupdate refuses "DELETE requires a WHERE clause" for the role the
-- API runs as, and stk_train_seed cleared the training pieces with a bare DELETE. The same function with a WHERE.
create or replace function public.stk_train_seed() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  delete from stk_train_pieces where true;   -- Supabase refuses a DELETE without WHERE to the API roles
  insert into stk_train_pieces(piece_id, store_id, brand, serial, barcode, article, collection, model_name, colour, size, category,
                               metal_keys, stone_keys, price_uzs)
  select ('00000000-0000-4000-9000-' || lpad(v.i::text, 12, '0'))::uuid, v.store, v.brand, 'TRN-' || lpad(v.i::text, 4, '0'),
         '29000000' || lpad(v.i::text, 5, '0'), v.article, v.collection, v.model_name, v.colour, v.size, v.category,
         v.metal, v.stone, v.price
    from (values
      (1,  1, 'Training Jeweller',   'TJ-R-101', 'Aurora',   'Aurora ring',          'WG', '52', 'ring',     '{white_gold}'::text[],  '{diamond}'::text[], 18500000),
      (2,  1, 'Training Jeweller',   'TJ-R-101', 'Aurora',   'Aurora ring',          'WG', '54', 'ring',     '{white_gold}',  '{diamond}', 18500000),
      (3,  1, 'Training Jeweller',   'TJ-N-205', 'Aurora',   'Aurora necklace',      'YG', null, 'necklace', '{yellow_gold}', '{}',        42000000),
      (4,  1, 'Training Jeweller',   'TJ-E-310', 'Meridian', 'Meridian earrings',    'RG', null, 'earrings', '{rose_gold}',   '{diamond}', 27300000),
      (5,  1, 'Training Jeweller',   'TJ-B-412', 'Meridian', 'Meridian bracelet',    'WG', '17', 'bracelet', '{white_gold}',  '{sapphire}', 61000000),
      (6,  1, 'Training Watchmaker', 'TW-4001',  'Navigator', 'Navigator 40 mm',     null, '40', 'watch',    '{steel}',       '{}',        96000000),
      (7,  1, 'Training Watchmaker', 'TW-4001',  'Navigator', 'Navigator 40 mm',     null, '40', 'watch',    '{steel}',       '{}',        96000000),
      (8,  1, 'Training Watchmaker', 'TW-3602',  'Soirée',   'Soirée 36 mm',         'RG', '36', 'watch',    '{rose_gold}',   '{diamond}', 248000000),
      (9,  2, 'Training Jeweller',   'TJ-R-101', 'Aurora',   'Aurora ring',          'WG', '56', 'ring',     '{white_gold}',  '{diamond}', 18500000),
      (10, 2, 'Training Jeweller',   'TJ-N-205', 'Aurora',   'Aurora necklace',      'YG', null, 'necklace', '{yellow_gold}', '{}',        42000000),
      (11, 2, 'Training Watchmaker', 'TW-4001',  'Navigator', 'Navigator 40 mm',     null, '40', 'watch',    '{steel}',       '{}',        96000000),
      (12, 2, 'Training Watchmaker', 'TW-S-01',  'Navigator', 'Navigator strap',     null, null, 'strap',    '{}',            '{}',        3200000)
    ) as v(i, store, brand, article, collection, model_name, colour, size, category, metal, stone, price);
  get diagnostics n = row_count;
  insert into stk_train_events(piece_id, to_state, reason, to_store_id, actor)
  select piece_id, 'in_stock', 'training_set', store_id, 'system' from stk_train_pieces;
  return n;
end $$;
revoke execute on function public.stk_train_seed() from public, anon, authenticated;
