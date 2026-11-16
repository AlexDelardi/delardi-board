-- Local test DB only. db/schema.sql is a schema-only dump: no rows and no
-- GRANT/REVOKE. Restore what the tests rely on, with fake data (never real data).
-- Runs after db/schema.sql and before db/migrations/*.sql (db/dev/local_db.sh).
insert into public.ops_stores(store_id, code, name, address)
values (1, 'BKH26', 'Delardi Boutique', 'Bukhara 26, Tashkent');
insert into public.board_users(name, passcode_hash, can_manage_stock)
values ('Alex', 'not-a-real-hash', true);
-- Sales tool (pos_1): the settings row and Alex's four till rights are rows, so a schema-only snapshot lacks them.
update public.board_users
   set can_view_sales = true, can_post_sales = true, can_void_sales = true, can_manage_till = true
 where name = 'Alex';
insert into public.pos_settings (id) values (1);

-- Supabase default privileges: on Supabase every new table, sequence and function in public is granted to the API
-- roles unless a migration revokes it. Set the same defaults here (for objects the migrations create, as postgres) so
-- a migration that forgets its revoke fails the rights assertions in db/tests/ instead of passing silently.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Production hardening for the objects already in the snapshot (the defaults above do not touch them): nothing on
-- any public table or sequence, and no execute on ops_* or pos_* functions, for the API roles.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and (p.proname like 'ops\_%' or p.proname like 'pos\_%') and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
