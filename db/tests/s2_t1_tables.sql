-- Sprint 2, Task 1: tables, store, right. Runs inside a transaction that is rolled back.
begin;
do $$ begin
  assert (select count(*) from ops_stores where code = 'BKH26' and store_id = 1
            and name = 'Delardi Boutique' and address = 'Bukhara 26, Tashkent') = 1, 'store row';
  assert (select can_manage_stock from board_users where name = 'Alex'), 'Alex has manage stock';
  assert (select count(*) from board_users where can_manage_stock) = 1, 'only Alex has manage stock';
  assert (select count(*) from information_schema.role_table_grants
          where table_schema = 'public' and table_name like 'ops\_%'
            and grantee in ('anon', 'authenticated')) = 0, 'no grants to public roles';
  assert (select bool_and(relrowsecurity) from pg_class
          where relnamespace = 'public'::regnamespace and relname like 'ops\_%' and relkind = 'r'), 'RLS on';
  assert (select count(*) from pg_class
          where relnamespace = 'public'::regnamespace and relname like 'ops\_%' and relkind = 'r') = 7, 'seven ops tables';
end $$;
-- states are constrained to the six agreed values
do $$ begin
  begin
    insert into ops_pieces(store_id, brand, serial, state) values (1, 'TEST', 'S-X', 'returned_to_supplier');
    raise exception 'state check missing';
  exception when check_violation then null;
  end;
end $$;
-- events are append-only (spec T8)
insert into ops_pieces(store_id, brand, serial, state) values (1, 'TEST', 'T-1', 'in_stock');
insert into ops_piece_events(piece_id, to_state, reason, actor)
  select piece_id, 'in_stock', 'initial_load', 'test' from ops_pieces where serial = 'T-1';
do $$ begin
  begin
    update ops_piece_events set note = 'x';
    raise exception 'update allowed';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  begin
    delete from ops_piece_events;
    raise exception 'delete allowed';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
end $$;
-- one live piece per brand + serial (trim / case-insensitive); a sold one may repeat
do $$ begin
  begin
    insert into ops_pieces(store_id, brand, serial, state) values (1, 'TEST', ' t-1 ', 'in_stock');
    raise exception 'duplicate live serial allowed';
  exception when unique_violation then null;
  end;
end $$;
update ops_pieces set state = 'sold' where serial = 'T-1';
insert into ops_pieces(store_id, brand, serial, state) values (1, 'TEST', 'T-1', 'in_stock');
-- one open review per piece and kind
insert into ops_review(piece_id, kind) select piece_id, 'missing_from_export' from ops_pieces where serial = 'T-1' and state = 'in_stock';
do $$ begin
  begin
    insert into ops_review(piece_id, kind) select piece_id, 'missing_from_export' from ops_pieces where serial = 'T-1' and state = 'in_stock';
    raise exception 'second open review allowed';
  exception when unique_violation then null;
  end;
end $$;
-- ticket key: unique per store + source + number
insert into ops_tickets(store_id, source, ticket_no, sold_at) values (1, 'colibri', 'TEST-1', current_date);
insert into ops_tickets(store_id, source, ticket_no, sold_at) values (1, 'delardi', 'TEST-1', current_date);
do $$ begin
  begin
    insert into ops_tickets(store_id, source, ticket_no, sold_at) values (1, 'colibri', 'TEST-1', current_date);
    raise exception 'duplicate ticket allowed';
  exception when unique_violation then null;
  end;
end $$;
select 's2_t1 ok' as result;
rollback;
