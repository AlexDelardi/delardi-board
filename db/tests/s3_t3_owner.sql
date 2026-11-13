-- Sprint 3, Task 6: owner clean-up (blank owner -> a real owner or 'Unassigned', before-values saved).
-- The effective owner coalesce(assigned_owner, client_owner) of a client with a named owner must not change.
-- Synthetic data only. Rolled back.
begin;
do $$
declare n int; r record;
begin
  insert into crm_clients(client_id, record_type, client_owner, assigned_owner) values
    ('S3T-OWN-1', 'client', null,        null),
    ('S3T-OWN-2', 'client', '',          'S3T Rep A'),
    ('S3T-OWN-3', 'client', 'S3T Rep A', 'S3T Rep B'),
    ('S3T-OWN-4', 'client', 'S3T Rep',   null),
    ('S3T-OWN-5', 'client', 'S3T Rep B', '  '),
    ('S3T-OWN-6', 'client', 'Unassigned', null);

  create temp table s3t_owner_before on commit drop as
  select client_id, coalesce(assigned_owner, client_owner) eff from crm_clients where client_id like 'S3T-OWN-%';

  n := crm_owner_cleanup_apply();
  assert n = 5, format('first call should change 5 rows, got %s', n);

  select client_owner, assigned_owner into r from crm_clients where client_id = 'S3T-OWN-1';
  assert r.client_owner = 'Unassigned' and r.assigned_owner = 'Unassigned', 'client 1 should be Unassigned/Unassigned';
  select client_owner, assigned_owner into r from crm_clients where client_id = 'S3T-OWN-2';
  assert r.client_owner = 'Unassigned' and r.assigned_owner = 'S3T Rep A', 'client 2 should be Unassigned/S3T Rep A';
  select client_owner, assigned_owner into r from crm_clients where client_id = 'S3T-OWN-3';
  assert r.client_owner = 'S3T Rep A' and r.assigned_owner = 'S3T Rep B', 'client 3 should be untouched';
  select client_owner, assigned_owner into r from crm_clients where client_id = 'S3T-OWN-4';
  assert r.client_owner = 'S3T Rep' and r.assigned_owner = 'S3T Rep', 'client 4: assigned_owner takes the client owner';
  select client_owner, assigned_owner into r from crm_clients where client_id = 'S3T-OWN-5';
  assert r.client_owner = 'S3T Rep B' and r.assigned_owner = 'S3T Rep B', 'client 5: blank assigned_owner takes the client owner';
  select client_owner, assigned_owner into r from crm_clients where client_id = 'S3T-OWN-6';
  assert r.client_owner = 'Unassigned' and r.assigned_owner = 'Unassigned', 'client 6 should be Unassigned/Unassigned';

  -- no client with a named owner changes effective owner
  assert not exists (
    select 1 from s3t_owner_before b join crm_clients c using (client_id)
     where btrim(coalesce(b.eff, '')) not in ('', 'Unassigned')
       and coalesce(c.assigned_owner, c.client_owner) is distinct from b.eff), 'effective owner changed';

  select count(*) into n from crm_owner_cleanup_20261112 where client_id like 'S3T-%';
  assert n = 5, format('saved table should hold 5 test clients, got %s', n);
  select client_owner, assigned_owner into r from crm_owner_cleanup_20261112 where client_id = 'S3T-OWN-1';
  assert r.client_owner is null and r.assigned_owner is null, 'saved before-values of client 1';
  select client_owner, assigned_owner into r from crm_owner_cleanup_20261112 where client_id = 'S3T-OWN-2';
  assert r.client_owner = '' and r.assigned_owner = 'S3T Rep A', 'saved before-values of client 2';
  select client_owner, assigned_owner into r from crm_owner_cleanup_20261112 where client_id = 'S3T-OWN-4';
  assert r.client_owner = 'S3T Rep' and r.assigned_owner is null, 'saved before-values of client 4';
  assert not exists (select 1 from crm_owner_cleanup_20261112 where client_id = 'S3T-OWN-3'), 'client 3 must not be saved';

  n := crm_owner_cleanup_apply();
  assert n = 0, format('second call should change 0 rows, got %s', n);
  select count(*) into n from crm_owner_cleanup_20261112 where client_id like 'S3T-%';
  assert n = 5, 'second call must not save anything new';

  assert not exists (select 1 from crm_clients where client_owner is null or btrim(client_owner) = ''
                        or assigned_owner is null or btrim(assigned_owner) = ''), 'no blank owners remain';
end $$;
select 's3_t3_owner ok' as result;
rollback;
