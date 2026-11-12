-- Sprint 3, migration: one way to say "no owner" in crm_clients (blank or null -> 'Unassigned').
-- Before-values of every changed row are saved so the clean-up can be undone.
-- Safe to run twice: the second run changes and saves nothing new.

create table if not exists public.crm_owner_cleanup_20261112 (
  client_id      text primary key,
  client_owner   text,
  assigned_owner text,
  saved_at       timestamptz not null default now()
);
alter table public.crm_owner_cleanup_20261112 enable row level security;
revoke all on public.crm_owner_cleanup_20261112 from anon, authenticated;

-- Saves the before-values, then sets blank owner fields to 'Unassigned' (each field only where blank).
-- Returns the number of client rows changed. Also called by the test.
create or replace function public.crm_owner_cleanup_apply() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_changed integer;
begin
  insert into crm_owner_cleanup_20261112(client_id, client_owner, assigned_owner)
  select client_id, client_owner, assigned_owner
    from crm_clients
   where client_owner is null or btrim(client_owner) = ''
      or assigned_owner is null or btrim(assigned_owner) = ''
  on conflict (client_id) do nothing;

  update crm_clients set
    client_owner   = case when client_owner is null or btrim(client_owner) = '' then 'Unassigned' else client_owner end,
    assigned_owner = case when assigned_owner is null or btrim(assigned_owner) = '' then 'Unassigned' else assigned_owner end
   where client_owner is null or btrim(client_owner) = ''
      or assigned_owner is null or btrim(assigned_owner) = '';
  get diagnostics v_changed = row_count;
  return v_changed;
end $$;

revoke execute on function public.crm_owner_cleanup_apply() from public, anon, authenticated;

select public.crm_owner_cleanup_apply();
