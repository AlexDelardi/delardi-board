-- One sign-in (28 Nov 2026). Every tool's server part still took a passcode directly, beside the home page's sign-in
-- (hub-api): eight extra entrances, outside the login log. They all look the person up by board_users.passcode_hash.
-- The column is renamed to signin_hash and only hub-api knows the new name, so the old entrances can no longer find
-- anyone: they fail the same way for a right and a wrong passcode. Their code is removed from each tool later.
-- hub-api must already read signin_hash (it falls back to the old name) before this is applied.
alter table public.board_users rename column passcode_hash to signin_hash;
alter table public.board_users rename constraint board_users_passcode_hash_key to board_users_signin_hash_key;

do $do$
declare r record; d text;
begin
  for r in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc like '%passcode_hash%' loop
    d := pg_get_functiondef(r.oid);
    execute replace(d, 'passcode_hash', 'signin_hash');
  end loop;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc like '%passcode_hash%') then
    raise exception 'a function still names passcode_hash';
  end if;
end $do$;
