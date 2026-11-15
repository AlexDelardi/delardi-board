-- POS Task 1: foundation (rights, settings, barcode and ticket columns, drafts, training source).
-- Invented fixtures only. Rolled back.
begin;
do $$
declare r jsonb; today date := (now() at time zone 'Asia/Tashkent')::date; n int; p1 uuid; p2 uuid; d1 bigint; d2 bigint; m0 bigint; m1 bigint;
begin
  -- the four rights exist and only Alex holds them
  assert (select can_view_sales and can_post_sales and can_void_sales and can_manage_till from board_users where name = 'Alex'), 'Alex holds all four rights';
  assert (select count(*) from board_users where can_view_sales or can_post_sales or can_void_sales or can_manage_till) = 1, 'only Alex holds sales rights';
  assert (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'editor_sessions' and column_name = 'can_use_sales') = 1, 'editor_sessions.can_use_sales';
  assert (select count(*) from information_schema.columns where table_schema = 'public' and column_name = 'barcode' and table_name in ('ops_pieces','cat_pieces')) = 2, 'barcode columns';
  assert (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'ops_tickets'
            and column_name in ('receipt_text','walk_in','void_reason','voided_by','voided_at')) = 5, 'ticket columns';

  -- settings singleton
  assert (select count(*) from pos_settings) = 1, 'one settings row';
  assert (select mode = 'training' and vat_pct = 0 and cash_notice_uzs = 170000000 and go_live_date is null and shop_address = '' from pos_settings), 'settings defaults';
  begin
    insert into pos_settings(id) values (2);
    raise exception 'second settings row allowed';
  exception when check_violation then null;
  end;
  begin
    insert into pos_settings(id) values (1);
    raise exception 'duplicate settings row allowed';
  exception when unique_violation then null;
  end;

  -- mode switching
  r := pos_set_mode('live', 'S3T tester');
  assert r->>'mode' = 'live' and (r->>'go_live_date')::date = today, 'live sets go_live_date to Tashkent today: ' || r::text;
  update pos_settings set go_live_date = date '2020-01-02';
  r := pos_set_mode('training', 'S3T tester');
  assert r->>'mode' = 'training' and (r->>'go_live_date')::date = date '2020-01-02', 'training keeps go_live_date: ' || r::text;
  assert (select count(*) from pos_settings_log) = 2, 'two log rows';
  assert (select count(*) from pos_settings_log where actor = 'S3T tester' and field = 'mode') = 2, 'log rows describe the mode';
  begin
    perform pos_set_mode('x', 'S3T tester');
    raise exception 'bad mode accepted';
  exception when others then
    if sqlerrm <> 'mode must be training or live' then raise; end if;
  end;

  -- hold rule on draft lines
  insert into ops_pieces(store_id, brand, serial, state, barcode) values (1, 'S3T', 'ZZ.00.00001', 'in_stock', '2000000000011') returning piece_id into p1;
  insert into ops_pieces(store_id, brand, serial, state) values (1, 'S3T', 'ZZ.00.00002', 'in_stock') returning piece_id into p2;
  insert into pos_drafts(mode, created_by) values ('live', 'S3T tester') returning draft_id into d1;
  insert into pos_drafts(mode, created_by) values ('live', 'S3T tester') returning draft_id into d2;
  insert into pos_draft_lines(draft_id, line_no, piece_id, price_uzs, mode) values (d1, 1, p1, 1000000, 'live');
  begin
    insert into pos_draft_lines(draft_id, line_no, piece_id, price_uzs, mode) values (d2, 1, p1, 1000000, 'live');
    raise exception 'same piece held twice in live';
  exception when unique_violation then null;
  end;
  insert into pos_draft_lines(draft_id, line_no, piece_id, price_uzs, mode) values (d2, 1, p1, 1000000, 'training');
  delete from pos_drafts where draft_id = d1;
  assert (select count(*) from pos_draft_lines where draft_id = d1) = 0, 'draft lines cascade';

  -- training source accepted, left out of the monthly view
  select coalesce(sum(tickets), 0) into m0 from ops_ticket_monthly;
  insert into ops_tickets(store_id, source, ticket_no, sold_at) values (1, 'training', 'T-000001', today);
  select coalesce(sum(tickets), 0) into m1 from ops_ticket_monthly;
  assert m1 = m0, 'training ticket must not appear in ops_ticket_monthly';
  insert into ops_tickets(store_id, source, ticket_no, sold_at) values (1, 'delardi', 'D-000001', today);
  select coalesce(sum(tickets), 0) into m1 from ops_ticket_monthly;
  assert m1 = m0 + 1, 'delardi ticket appears in ops_ticket_monthly';
  begin
    insert into ops_tickets(store_id, source, ticket_no, sold_at) values (1, 'other', 'X-1', today);
    raise exception 'bad source accepted';
  exception when check_violation then null;
  end;

  -- card type
  insert into ops_ticket_payments(ticket_id, method, amount, card_type)
    select ticket_id, 'card', 100, 'humo' from ops_tickets where ticket_no = 'D-000001';
  begin
    insert into ops_ticket_payments(ticket_id, method, amount, card_type)
      select ticket_id, 'card', 100, 'mastercard' from ops_tickets where ticket_no = 'D-000001';
    raise exception 'bad card type accepted';
  exception when check_violation then null;
  end;

  -- sequences exist and start at 1
  assert nextval('pos_ticket_no_seq') = 1 and nextval('pos_training_no_seq') = 1, 'sequences start at 1';

  -- no access for the API roles, RLS on
  assert (select count(*) from information_schema.role_table_grants
           where table_schema = 'public' and table_name like 'pos\_%' and grantee in ('anon','authenticated','public')) = 0, 'no table grants';
  assert (select count(*) from pg_class c, lateral aclexplode(coalesce(c.relacl, acldefault('S', c.relowner))) a
           where c.relnamespace = 'public'::regnamespace and c.relkind = 'S' and c.relname like 'pos\_%'
             and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon','authenticated')))) = 0, 'no sequence grants';
  assert not has_function_privilege('anon', 'pos_set_mode(text,text)', 'execute')
     and not has_function_privilege('authenticated', 'pos_set_mode(text,text)', 'execute'), 'no execute on pos_set_mode';
  assert (select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relname like 'pos\_%' and relkind = 'r'), 'RLS on';
  assert (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname like 'pos\_%' and relkind = 'r') = 4, 'four pos tables';
end $$;
select 'pos_t1 ok' as result;
rollback;
