-- Local test DB only. db/schema.sql is a schema-only dump: no rows and no
-- GRANT/REVOKE. Restore what the tests rely on, with fake data (never real data).
insert into public.ops_stores(store_id, code, name, address)
values (1, 'BKH26', 'Delardi Boutique', 'Bukhara 26, Tashkent');
insert into public.board_users(name, passcode_hash, can_manage_stock)
values ('Alex', 'not-a-real-hash', true);

-- Production hardening: nothing on ops_* for the public roles.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'ops\_%' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
