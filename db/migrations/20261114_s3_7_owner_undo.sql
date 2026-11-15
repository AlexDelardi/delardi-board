-- Sprint 3 polish 5: undo for the owner clean-up (20261113_s3_3_owner_cleanup.sql).
-- Restores client_owner and assigned_owner from crm_owner_cleanup_20261112 for every saved client whose
-- current pair differs from the saved pair (so a later manual edit of a saved client is also reverted).
-- Returns the number of rows changed. The saved rows are kept, so a second run changes nothing.
-- Rulings:
--  * updated_at becomes the undo time (the touch trigger); original times were not saved for the 14 Nov run.
--  * a repeat clean-up keeps the first saved value on purpose: it is the true original.
-- Not to be run on production without Alex's yes.

create or replace function public.crm_owner_cleanup_undo() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_changed integer;
begin
  update crm_clients c
     set client_owner = s.client_owner, assigned_owner = s.assigned_owner
    from crm_owner_cleanup_20261112 s
   where c.client_id = s.client_id
     and (c.client_owner, c.assigned_owner) is distinct from (s.client_owner, s.assigned_owner);
  get diagnostics v_changed = row_count;
  return v_changed;
end $$;
revoke execute on function public.crm_owner_cleanup_undo() from public, anon, authenticated;
