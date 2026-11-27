-- One register, step 2: every reader of the retail price takes it from the piece itself (ops_pieces.price_uzs)
-- instead of looking the serial up in cat_pieces. Shapes and signatures are unchanged.
--   pos_search_pieces, pos_post_sale, stk_base, perf_brands: the price subquery becomes the piece's column
--   stk_piece_cost: the shelf price is the piece's price
--   ops_initial_fill: a first fill of an empty register carries the price too
do $do$
declare f text; d text; n text;
  sub constant text := '\(select (?:cp|c)\.price_uzs(::numeric)? from cat_pieces (?:cp|c)\s+where [^;]*? limit 1\)';
begin
  foreach f in array array['pos_search_pieces(text,text)', 'pos_post_sale(jsonb,text)', 'stk_base(jsonb)',
                           'perf_brands(date,date,smallint)'] loop
    d := pg_get_functiondef(('public.' || f)::regprocedure);
    n := regexp_replace(d, sub, 'o.price_uzs\1', 'g');
    if n = d or n ilike '%cat_pieces%' then raise exception 'reg_2: % not patched as expected', f; end if;
    execute n;
  end loop;

  d := pg_get_functiondef('public.stk_piece_cost(uuid)'::regprocedure);
  n := regexp_replace(d, 'select cp\.price_uzs::numeric into v_shelf from cat_pieces cp\s+where [^;]*;', 'v_shelf := o.price_uzs::numeric;');
  if n = d or n ilike '%cat_pieces%' then raise exception 'reg_2: stk_piece_cost not patched as expected'; end if;
  execute n;

  d := pg_get_functiondef('public.ops_initial_fill(text)'::regprocedure);
  n := replace(d, 'insert into ops_pieces(store_id, brand, serial, article, model_id, variant_id, size, state, last_seen_run, last_seen_at)
  select 1, m.brand, btrim(p.serial), m.article, m.model_id, p.variant_id, p.size, ''in_stock'', p.import_run, now()
    from cat_pieces p',
    'insert into ops_pieces(store_id, brand, serial, article, model_id, variant_id, size, state, last_seen_run, last_seen_at, price_uzs)
  select 1, m.brand, btrim(p.serial), m.article, m.model_id, p.variant_id, p.size, ''in_stock'', p.import_run, now(), p.price_uzs
    from cat_pieces p');
  if n = d then raise exception 'reg_2: ops_initial_fill not patched as expected'; end if;
  execute n;
end $do$;
