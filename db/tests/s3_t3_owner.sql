-- Sprint 3, Task 6: owner clean-up (blank owner -> 'Unassigned', before-values saved). Synthetic data only. Rolled back.
begin;
do $$
declare n int; r record;
begin
  insert into crm_clients(client_id, record_type, client_owner, assigned_owner) values
    ('S3T-OWN-1', 'client', null,     null),
    ('S3T-OWN-2', 'client', '',       'Karina'),
    ('S3T-OWN-3', 'client', 'Karina', 'Ellona');

  n := crm_owner_cleanup_apply();
  assert n = 2, format('first call should change 2 rows, got %s', n);

  select client_owner, assigned_owner into r from crm_clients where client_id = 'S3T-OWN-1';
  assert r.client_owner = 'Unassigned' and r.assigned_owner = 'Unassigned', 'client 1 should be Unassigned/Unassigned';
  select client_owner, assigned_owner into r from crm_clients where client_id = 'S3T-OWN-2';
  assert r.client_owner = 'Unassigned' and r.assigned_owner = 'Karina', 'client 2 should be Unassigned/Karina';
  select client_owner, assigned_owner into r from crm_clients where client_id = 'S3T-OWN-3';
  assert r.client_owner = 'Karina' and r.assigned_owner = 'Ellona', 'client 3 should be untouched';

  select count(*) into n from crm_owner_cleanup_20261112 where client_id like 'S3T-%';
  assert n = 2, format('saved table should hold 2 test clients, got %s', n);
  select client_owner, assigned_owner into r from crm_owner_cleanup_20261112 where client_id = 'S3T-OWN-1';
  assert r.client_owner is null and r.assigned_owner is null, 'saved before-values of client 1';
  select client_owner, assigned_owner into r from crm_owner_cleanup_20261112 where client_id = 'S3T-OWN-2';
  assert r.client_owner = '' and r.assigned_owner = 'Karina', 'saved before-values of client 2';
  assert not exists (select 1 from crm_owner_cleanup_20261112 where client_id = 'S3T-OWN-3'), 'client 3 must not be saved';

  n := crm_owner_cleanup_apply();
  assert n = 0, format('second call should change 0 rows, got %s', n);
  select count(*) into n from crm_owner_cleanup_20261112 where client_id like 'S3T-%';
  assert n = 2, 'second call must not save anything new';

  assert not exists (select 1 from crm_clients where client_owner is null or btrim(client_owner) = ''
                        or assigned_owner is null or btrim(assigned_owner) = ''), 'no blank owners remain';
end $$;
select 's3_t3_owner ok' as result;
rollback;
