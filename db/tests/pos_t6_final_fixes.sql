-- POS final-review fixes: a post owns the suspended sale it names (I1), and a post or suspend
-- carries the mode the screen shows (I2). Invented fixtures. Rolled back.
begin;
alter sequence pos_ticket_no_seq restart;
alter sequence pos_training_no_seq restart;

-- expects the statement to raise a message starting with p_prefix, and to leave no ticket, no draft line
-- and no log row behind
create function pg_temp.t6_refused(p_sql text, p_prefix text) returns void language plpgsql as $$
declare t0 bigint := (select count(*) from ops_tickets); d0 bigint := (select count(*) from pos_draft_lines);
        g0 bigint := (select count(*) from pos_settings_log);
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_prefix || '%' then
      raise exception 'expected "%", got "%"', p_prefix, sqlerrm;
    end if;
    if (select count(*) from ops_tickets) <> t0 then raise exception 'refusal left a ticket'; end if;
    if (select count(*) from pos_draft_lines) <> d0 then raise exception 'refusal left draft lines'; end if;
    if (select count(*) from pos_settings_log) <> g0 then raise exception 'refusal left a log row'; end if;
    return;
  end;
  raise exception 'expected "%", but it went through: %', p_prefix, p_sql;
end $$;

do $$
declare
  pl jsonb; r jsonb; res jsonb; p1 uuid; p2 uuid; p3 uuid; p4 uuid;
  d1 bigint; d_tr bigint; d_live bigint; sale jsonb; lg pos_settings_log%rowtype;
begin
  insert into ops_stores(store_id, code, name)
  select 1, 'POS-STORE', 'POS store' where not exists (select 1 from ops_stores where store_id = 1);
  insert into crm_sales_reps(source_name, label) values ('S3T Source', 'S3T Rep');

  pl := jsonb_build_object('built', 'pos t6',
    'models', jsonb_build_array(jsonb_build_object('model_id', 'ZZ-M6', 'article', 'ZZ-ART-6', 'brand', 'S3T Brand',
                'brand_raw', jsonb_build_array('S3T Brand'), 'category', 'jewellery', 'retail_category', 'Jewellery',
                'collection', 'Zz Collection', 'model_name', 'Zz Ring', 'in_stock', true, 'qty_stock', 4,
                'arrival_years', '[]'::jsonb, 'variant_count', 1, 'completeness', 0, 'missing_crucial', '[]'::jsonb,
                'has_unconfirmed', false, 'metal_keys', '[]'::jsonb, 'stone_keys', '[]'::jsonb,
                'size_keys', '[]'::jsonb, 'qty_transit', 0)),
    'variants', jsonb_build_array(jsonb_build_object('variant_id', 'ZZ-M6-V1', 'model_id', 'ZZ-M6', 'colour_code', 'WG',
                'in_stock', true, 'qty_stock', 4, 'qty_in', 4, 'qty_sold', 0, 'arrival_years', '[]'::jsonb,
                'found_online', false, 'sources', '[]'::jsonb, 'sort_order', 1, 'qty_transit', 0)),
    'pieces', jsonb_build_array(
      jsonb_build_object('serial', 'ZZ.00.36001', 'variant_id', 'ZZ-M6-V1', 'size', '16', 'price_uzs', 10000000),
      jsonb_build_object('serial', 'ZZ.00.36002', 'variant_id', 'ZZ-M6-V1', 'size', '17', 'price_uzs', 20000000),
      jsonb_build_object('serial', 'ZZ.00.36003', 'variant_id', 'ZZ-M6-V1', 'size', '18', 'price_uzs', 30000000),
      jsonb_build_object('serial', 'ZZ.00.36004', 'variant_id', 'ZZ-M6-V1', 'size', '19', 'price_uzs', 40000000)),
    'attributes', '[]'::jsonb, 'links', '[]'::jsonb, 'expected', '[]'::jsonb);
  r := cat_load(pl, 'pos t6 a');
  select piece_id into p1 from ops_pieces where serial = 'ZZ.00.36001';
  select piece_id into p2 from ops_pieces where serial = 'ZZ.00.36002';
  select piece_id into p3 from ops_pieces where serial = 'ZZ.00.36003';
  select piece_id into p4 from ops_pieces where serial = 'ZZ.00.36004';
  assert p1 is not null and p4 is not null, 'fixture pieces loaded';
  perform pos_set_mode('training', 'pos t6');

  ---------------- I1: a post names a suspended sale that was cancelled meanwhile → refused
  d1 := (pos_suspend(jsonb_build_object('walk_in', true, 'seller', 'S3T Rep',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p1, 'price_uzs', 10000000))), 'pos t6')->>'draft_id')::bigint;
  perform pos_cancel_draft(d1, 'pos t6');
  sale := jsonb_build_object('draft_id', d1, 'walk_in', true, 'seller', 'S3T Rep', 'expect_mode', 'training',
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p1, 'price_uzs', 10000000)),
            'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 10000000)));
  perform pg_temp.t6_refused(format('select pos_post_sale(%L::jsonb, %L)', sale, 'pos t6'),
                             format('suspended sale %s no longer exists', d1));

  ---------------- I1: a post names a suspended sale of the other mode → refused
  d_tr := (pos_suspend(jsonb_build_object('walk_in', true,
             'lines', jsonb_build_array(jsonb_build_object('piece_id', p2, 'price_uzs', 20000000))), 'pos t6')->>'draft_id')::bigint;
  perform pos_set_mode('live', 'pos t6');
  sale := jsonb_build_object('draft_id', d_tr, 'walk_in', true, 'seller', 'S3T Rep', 'expect_mode', 'live',
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p3, 'price_uzs', 30000000)),
            'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 30000000)));
  perform pg_temp.t6_refused(format('select pos_post_sale(%L::jsonb, %L)', sale, 'pos t6'),
                             format('suspended sale %s belongs to the other mode', d_tr));
  assert exists (select 1 from pos_drafts where draft_id = d_tr and mode = 'training'), 'the training draft is untouched';
  assert (select state from ops_pieces where piece_id = p3) = 'in_stock', 'nothing sold';

  ---------------- I2: the screen shows another mode than the till → refused, post and suspend alike
  sale := jsonb_build_object('walk_in', true, 'seller', 'S3T Rep', 'expect_mode', 'training',
            'lines', jsonb_build_array(jsonb_build_object('piece_id', p3, 'price_uzs', 30000000)),
            'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 30000000)));
  perform pg_temp.t6_refused(format('select pos_post_sale(%L::jsonb, %L)', sale, 'pos t6'),
                             'the till was switched to live — reload');
  assert (select state from ops_pieces where piece_id = p3) = 'in_stock', 'a stale-training post sells nothing';
  perform pg_temp.t6_refused(format('select pos_suspend(%L::jsonb, %L)', sale - 'payments', 'pos t6'),
                             'the till was switched to live — reload');
  perform pg_temp.t6_refused(format('select pos_post_sale(%L::jsonb, %L)', sale || '{"expect_mode": "LIVE"}', 'pos t6'),
                             'the till was switched to live — reload');

  ---------------- I1: posting its own suspended sale (right mode) goes through, the draft goes, one log row
  d_live := (pos_suspend(jsonb_build_object('walk_in', true, 'seller', 'S3T Rep', 'expect_mode', 'live',
               'lines', jsonb_build_array(jsonb_build_object('piece_id', p3, 'price_uzs', 30000000))), 'pos t6')->>'draft_id')::bigint;
  -- the resumed sale was edited (a piece added): still allowed
  res := pos_post_sale(jsonb_build_object('draft_id', d_live, 'walk_in', true, 'seller', 'S3T Rep', 'expect_mode', 'live',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p3, 'price_uzs', 30000000),
                                      jsonb_build_object('piece_id', p4, 'price_uzs', 40000000)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 70000000))), 'pos t6');
  assert res->>'ticket_no' = 'D-000001' and res->>'mode' = 'live', 'posted ' || res::text;
  assert not exists (select 1 from pos_drafts where draft_id = d_live), 'the posted draft is gone';
  select * into lg from pos_settings_log where field = 'draft_posted' order by id desc limit 1;
  assert lg.id is not null and lg.actor = 'pos t6' and lg.new_value = d_live || ' → D-000001',
         'draft_posted log row ' || coalesce(lg.new_value, '(none)');
  assert (select count(*) from pos_settings_log where field = 'draft_posted') = 1, 'one log row';
  -- a plain post (no draft) writes no draft_posted row
  perform pos_cancel_draft(d_tr, 'pos t6');   -- (training draft; cancel is mode-agnostic)
  perform pos_set_mode('training', 'pos t6');
  res := pos_post_sale(jsonb_build_object('walk_in', true, 'seller', 'S3T Rep', 'expect_mode', 'training',
           'lines', jsonb_build_array(jsonb_build_object('piece_id', p1, 'price_uzs', 10000000)),
           'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 10000000))), 'pos t6');
  assert res->>'ticket_no' = 'T-000001', 'training post ' || res::text;
  assert (select count(*) from pos_settings_log where field = 'draft_posted') = 1, 'still one draft_posted row';
end $$;

select 'pos_t6 ok' as result;
rollback;
