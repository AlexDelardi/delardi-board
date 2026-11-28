-- Access tool: who may use it, rights with their history, people, passcodes, the login view.
-- Invented fixtures only. Rolled back.
begin;
do $$
declare
  d jsonb; x jsonb; p jsonb; v_boss uuid; v_rep uuid; v_new uuid; v_gone uuid; n int; ok boolean; t text;
begin
  insert into board_users(name, signin_hash, active, can_manage_access, can_view_logins, can_view_crm, crm_rep_label) values
    ('Zz Boss', 'zz-hash-1', true,  true,  true,  true,  null),
    ('Zz Rep',  'zz-hash-2', true,  false, false, true,  'Zz Rep'),
    ('Zz Gone', 'zz-hash-3', false, true,  true,  false, null),
    ('Zz Peek', 'zz-hash-4', true,  true,  false, false, null);
  select id into v_boss from board_users where name = 'Zz Boss';
  select id into v_rep  from board_users where name = 'Zz Rep';
  select id into v_gone from board_users where name = 'Zz Gone';

  -- closed to the page
  assert not has_table_privilege('anon', 'public.acc_log', 'select') and not has_table_privilege('authenticated', 'public.acc_log', 'insert'), 'the log is closed to the page';
  assert not has_function_privilege('anon', 'public.acc_snapshot(text)', 'execute') and not has_function_privilege('authenticated', 'public.acc_set_right(text,uuid,text,boolean)', 'execute')
     and not has_function_privilege('anon', 'public.acc_save_person(text,jsonb,text,text)', 'execute') and not has_function_privilege('anon', 'public.acc_set_passcode(text,uuid,text,text)', 'execute')
     and not has_function_privilege('authenticated', 'public.acc_passcode(text,uuid)', 'execute') and not has_function_privilege('anon', 'public.acc_logins(text,integer)', 'execute')
     and not has_function_privilege('anon', 'public.acc_me(text)', 'execute') and not has_function_privilege('anon', 'public.acc_right_keys()', 'execute'), 'the functions are closed to the page';

  -- who may come in: only an active login with the right
  for x in select * from jsonb_array_elements('["Zz Rep", "Zz Gone", "Nobody"]'::jsonb) loop
    begin perform acc_snapshot(x #>> '{}'); ok := false; exception when others then ok := sqlerrm like '%does not have access%'; end;
    assert ok, 'no right, switched off or unknown: refused (' || (x #>> '{}') || ')';
    begin perform acc_set_right(x #>> '{}', v_rep, 'can_view_stock', true); ok := false; exception when others then ok := sqlerrm like '%does not have access%'; end;
    assert ok, 'and may change nothing (' || (x #>> '{}') || ')';
  end loop;
  assert not (select can_view_stock from board_users where id = v_rep), 'nothing changed by a refused call';

  -- the snapshot
  d := acc_snapshot('Zz Boss');
  assert d->'me'->>'name' = 'Zz Boss' and (d->'me'->>'logins')::boolean, 'me: ' || (d->'me')::text;
  assert not (acc_snapshot('Zz Peek')->'me'->>'logins')::boolean, 'the login log is its own right';
  assert jsonb_array_length(d->'rights') = 24 and d->'rights' ? 'can_refund_sales' and d->'rights' ? 'can_manage_access' and d->'rights' ? 'can_view_logins', 'the rights it manages: ' || (d->'rights')::text;
  select z into p from jsonb_array_elements(d->'people') z where z->>'name' = 'Zz Rep';
  assert p->>'person_id' = v_rep::text and (p->>'active')::boolean and p->>'rep' = 'Zz Rep' and p->>'role' is null
     and (p->'rights'->>'can_view_crm')::boolean and not (p->'rights'->>'can_view_stock')::boolean and (select count(*) from jsonb_object_keys(p->'rights')) = 24, 'a person: ' || p::text;
  assert p->>'passcode' = 'earlier' and not (p ? 'signin_hash') and not (p ? 'passcode_enc') and d::text not like '%zz-hash-%', 'no passcode, scrambled or not, ever leaves in the snapshot';
  assert (select count(*) from jsonb_array_elements(d->'people') z where z->>'name' = 'Zz Gone' and not (z->>'active')::boolean) = 1, 'switched-off people are listed, marked';

  -- a right is switched on and off, and each change is written down
  p := acc_set_right('Zz Boss', v_rep, 'can_view_stock', true);
  assert (p->'rights'->>'can_view_stock')::boolean and (select can_view_stock from board_users where id = v_rep), 'the right is on';
  assert (select count(*) from acc_log where person_id = v_rep and action = 'right' and field = 'can_view_stock' and old_value = 'false' and new_value = 'true' and actor = 'Zz Boss' and person = 'Zz Rep') = 1, 'and logged';
  perform acc_set_right('Zz Boss', v_rep, 'can_view_stock', true);
  assert (select count(*) from acc_log where person_id = v_rep and field = 'can_view_stock') = 1, 'no change, no log line';
  perform acc_set_right('Zz Boss', v_rep, 'can_view_stock', false);
  assert not (select can_view_stock from board_users where id = v_rep) and (select count(*) from acc_log where person_id = v_rep and field = 'can_view_stock') = 2, 'off again, logged again';
  for t in select unnest(array['signin_hash', 'active', 'name', 'can_fly', 'can_view_stock; drop table acc_log', '']) loop
    begin perform acc_set_right('Zz Boss', v_rep, t, true); ok := false; exception when others then ok := sqlerrm like '%not a right%'; end;
    assert ok, 'only a listed right may be switched: ' || t;
  end loop;
  begin perform acc_set_right('Zz Boss', gen_random_uuid(), 'can_view_stock', true); ok := false; exception when others then ok := sqlerrm like '%was not found%'; end;
  assert ok, 'an unknown person is refused';
  begin perform acc_set_right('Zz Boss', v_boss, 'can_manage_access', false); ok := false; exception when others then ok := sqlerrm like '%your own access%'; end;
  assert ok and (select can_manage_access from board_users where id = v_boss), 'nobody removes their own access to the tool';
  perform acc_set_right('Zz Boss', v_boss, 'can_view_logins', false);
  assert not (select can_view_logins from board_users where id = v_boss), 'other rights of one''s own may be changed';
  perform acc_set_right('Zz Boss', v_boss, 'can_view_logins', true);

  -- the role and the sales rep name
  p := acc_save_person('Zz Boss', jsonb_build_object('person_id', v_rep, 'role', '  Sales Rep ', 'rep', ''));
  assert p->>'role' = 'Sales Rep' and p->>'rep' is null and (select crm_rep_label is null and role = 'Sales Rep' from board_users where id = v_rep), 'role trimmed, an empty rep name is none: ' || p::text;
  assert (select count(*) from acc_log where person_id = v_rep and action = 'profile' and field in ('role', 'rep')) = 2, 'both logged';
  p := acc_save_person('Zz Boss', jsonb_build_object('person_id', v_rep, 'role', 'Sales Rep'));
  assert (select count(*) from acc_log where person_id = v_rep and action = 'profile') = 2, 'only what changed is logged, and a key left out is left alone';
  begin perform acc_save_person('Zz Boss', jsonb_build_object('person_id', v_rep, 'name', 'Zz Other')); ok := false; exception when others then ok := sqlerrm like '%name cannot be changed%'; end;
  assert ok, 'a name is stamped on tasks and tickets: it does not change';

  -- switching off ends the sessions at once; switching on brings the person back
  insert into editor_sessions(token, display_name, expires_at) values ('zz-token-rep-1', 'Zz Rep', now() + interval '1 hour'), ('zz-token-rep-2', 'Zz Rep', now() + interval '1 hour'), ('zz-token-boss', 'Zz Boss', now() + interval '1 hour');
  p := acc_save_person('Zz Boss', jsonb_build_object('person_id', v_rep, 'active', false));
  assert not (p->>'active')::boolean and (select count(*) from editor_sessions where display_name = 'Zz Rep') = 0 and (select count(*) from editor_sessions where display_name = 'Zz Boss') = 1, 'switched off: her sessions are gone, nobody else''s';
  assert (select count(*) from acc_log where person_id = v_rep and action = 'active' and new_value = 'false') = 1, 'logged';
  assert (select can_view_crm from board_users where id = v_rep), 'the rights are kept for when the person comes back';
  begin perform acc_save_person('Zz Boss', jsonb_build_object('person_id', v_boss, 'active', false)); ok := false; exception when others then ok := sqlerrm like '%switch yourself off%'; end;
  assert ok, 'nobody switches themselves off';
  perform acc_save_person('Zz Boss', jsonb_build_object('person_id', v_rep, 'active', true));
  assert (select active from board_users where id = v_rep), 'back on';

  -- a new person: a name, a passcode, and optionally someone's rights to start from
  begin perform acc_save_person('Zz Boss', '{"name": "Zz New"}'); ok := false; exception when others then ok := sqlerrm like '%needs a passcode%'; end;
  assert ok, 'a new person needs a passcode';
  begin perform acc_save_person('Zz Boss', '{"name": "  "}', 'zz-hash-9', 'zz-enc-9'); ok := false; exception when others then ok := sqlerrm like '%Give the person a name%'; end;
  assert ok, 'and a name';
  begin perform acc_save_person('Zz Boss', '{"name": "zz rep"}', 'zz-hash-9', 'zz-enc-9'); ok := false; exception when others then ok := sqlerrm like '%already%'; end;
  assert ok, 'a name already taken (in any case) is refused';
  begin perform acc_save_person('Zz Boss', '{"name": "Zz New"}', 'zz-hash-2', 'zz-enc-9'); ok := false; exception when others then ok := sqlerrm like '%passcode is already in use%'; end;
  assert ok, 'a passcode someone has is refused';
  p := acc_save_person('Zz Boss', jsonb_build_object('name', ' Zz New ', 'role', 'Trainee', 'copy_from', v_rep), 'zz-hash-9', 'zz-enc-9');
  v_new := (p->>'person_id')::uuid;
  assert p->>'name' = 'Zz New' and (p->>'active')::boolean and p->>'role' = 'Trainee' and (p->'rights'->>'can_view_crm')::boolean and p->>'rep' is null and p->>'passcode' = 'viewable', 'added with the rights copied, not the rep name: ' || p::text;
  assert not (p->'rights'->>'can_manage_access')::boolean and not (p->'rights'->>'can_view_stock')::boolean, 'and no right the other person lacks';
  x := acc_save_person('Zz Boss', '{"name": "Zz Plain"}', 'zz-hash-11', 'zz-enc-11');
  assert (select count(*) from jsonb_each_text(x->'rights') e where e.value = 'true') = 0 and not (select can_view_board from board_users where name = 'Zz Plain'), 'without a copy a new person has no right at all, whatever the column defaults are';
  assert (select count(*) from acc_log where person_id = v_new and action = 'add') = 1 and (select count(*) from acc_log where person_id = v_new and action = 'right' and field = 'can_view_crm') = 1, 'the add and each copied right are logged';
  p := acc_save_person('Zz Boss', jsonb_build_object('name', 'Zz Copy', 'copy_from', v_boss), 'zz-hash-10', 'zz-enc-10');
  assert not (p->'rights'->>'can_manage_access')::boolean and (p->'rights'->>'can_view_logins')::boolean, 'access to this tool is never copied';

  -- the profile fields given with a new person are honoured, and logged like any other change
  p := acc_save_person('Zz Boss', '{"name": "Zz Full", "role": "Sales Rep", "rep": " Zz Full ", "active": false}', 'zz-hash-12', 'zz-enc-12');
  assert p->>'rep' = 'Zz Full' and not (p->>'active')::boolean and p->>'role' = 'Sales Rep'
     and (select crm_rep_label = 'Zz Full' and not active from board_users where name = 'Zz Full'), 'a new person keeps the rep name and the off switch given: ' || p::text;
  assert (select count(*) from acc_log where person = 'Zz Full' and action = 'profile' and field = 'rep' and new_value = 'Zz Full') = 1
     and (select count(*) from acc_log where person = 'Zz Full' and action = 'active' and new_value = 'false') = 1
     and (select count(*) from acc_log where person = 'Zz Full' and field = 'role') = 1, 'each is logged once';
  begin perform acc_save_person('Zz Boss', jsonb_build_object('name', 'Zz Long', 'rep', repeat('x', 41)), 'zz-hash-13', 'zz-enc-13'); ok := false; exception when others then ok := sqlerrm like '%too long%'; end;
  assert ok and not exists (select 1 from board_users where name = 'Zz Long'), 'a bad field on a new person adds nobody';

  -- passcodes: a new one replaces the old, ends the sessions, and can be looked up; each look is logged
  insert into editor_sessions(token, display_name, expires_at) values ('zz-token-rep-3', 'Zz Rep', now() + interval '1 hour');
  begin perform acc_passcode('Zz Boss', v_rep); ok := false; exception when others then ok := sqlerrm like '%set earlier%'; end;
  assert ok, 'a passcode from before the tool cannot be shown';
  begin perform acc_set_passcode('Zz Boss', v_rep, 'zz-hash-9', 'zz-enc-x'); ok := false; exception when others then ok := sqlerrm like '%passcode is already in use%'; end;
  assert ok and (select signin_hash = 'zz-hash-2' from board_users where id = v_rep), 'a passcode someone else has is refused and nothing changes';
  begin perform acc_set_passcode('Zz Boss', v_rep, '', 'zz-enc-x'); ok := false; exception when others then ok := true; end;
  assert ok, 'an empty passcode is refused';
  p := acc_set_passcode('Zz Boss', v_rep, 'zz-hash-20', 'zz-enc-20');
  assert p->>'passcode' = 'viewable' and (select signin_hash = 'zz-hash-20' and passcode_enc = 'zz-enc-20' and passcode_set_at is not null from board_users where id = v_rep), 'the new passcode is in';
  assert (select count(*) from editor_sessions where display_name = 'Zz Rep') = 0, 'and the person signs in again';
  assert (select count(*) from acc_log where person_id = v_rep and action = 'passcode' and old_value is null and new_value is null) = 1 and (select count(*) from acc_log where coalesce(old_value, '') || coalesce(new_value, '') like '%zz-hash%' or coalesce(old_value, '') || coalesce(new_value, '') like '%zz-enc%') = 0, 'logged, without the passcode in any form';
  t := acc_passcode('Zz Boss', v_rep);
  assert t = 'zz-enc-20' and (select count(*) from acc_log where person_id = v_rep and action = 'passcode_view' and actor = 'Zz Boss') = 1, 'it can be looked up, and the look is logged';
  begin perform acc_passcode('Zz Rep', v_rep); ok := false; exception when others then ok := sqlerrm like '%does not have access%'; end;
  assert ok, 'not by the person themselves, nor anyone without the right';
  assert acc_snapshot('Zz Boss')::text not like '%zz-enc-%', 'the snapshot never carries it';

  -- the history, newest first
  d := acc_snapshot('Zz Boss');
  assert jsonb_array_length(d->'history') >= 10 and d->'history'->0->>'action' = 'passcode_view' and d->'history'->0->>'actor' = 'Zz Boss' and d->'history'->0->>'person' = 'Zz Rep' and (d->'history'->0->>'at') is not null, 'history: ' || (d->'history'->0)::text;

  -- logins: a tracker session is filed as the tracker, and the view needs its own right
  insert into editor_sessions(token, display_name, expires_at, can_use_tasks) values ('zz-token-tasks', 'Zz Rep', now() + interval '1 hour', true);
  assert (select tool from usage_logins where who = 'Zz Rep' order by id desc limit 1) = 'tasks', 'a tracker login is logged as tasks';
  begin perform acc_logins('Zz Peek', 30); ok := false; exception when others then ok := sqlerrm like '%does not have access%'; end;
  assert ok, 'the login log needs its right';
  d := acc_logins('Zz Boss', 30);
  assert d->'tools' ? 'tasks' and not d->'tools' ? 'board' and (select count(*) from jsonb_array_elements(d->'recent') z where z->>'who' = 'Zz Rep' and z->>'tool' = 'tasks') = 1, 'the view lists it: ' || (d->'tools')::text;
  select z into p from jsonb_array_elements(d->'people') z where z->>'name' = 'Zz Rep';
  assert (p->'tools'->'tasks'->>'logins')::int = 1 and p->>'last_tool' = 'tasks', 'per person and tool: ' || p::text;

  -- the address on a login line is the session's own; it is guessed from the passcode attempts only when there is no doubt
  insert into editor_sessions(token, display_name, expires_at, can_use_tasks, ip) values ('zz-token-ip-1', 'Zz Rep', now() + interval '1 hour', true, '10.9.9.1');
  assert (select ip from usage_logins where who = 'Zz Rep' order by id desc limit 1) = '10.9.9.1', 'an address given with the session is the one logged';
  insert into auth_attempts(ip, ok, created_at) values ('10.9.9.2', true, now());
  insert into editor_sessions(token, display_name, expires_at, can_use_tasks) values ('zz-token-ip-2', 'Zz Rep', now() + interval '1 hour', true);
  assert (select ip from usage_logins where who = 'Zz Rep' order by id desc limit 1) = '10.9.9.2', 'one fresh successful attempt: that address';
  insert into auth_attempts(ip, ok, created_at) values ('10.9.9.3', true, now());
  insert into editor_sessions(token, display_name, expires_at, can_use_tasks) values ('zz-token-ip-3', 'Zz Rep', now() + interval '1 hour', true);
  assert (select ip from usage_logins where who = 'Zz Rep' order by id desc limit 1) is null, 'two sign-ins at once: no address is better than someone else''s';

  -- the Access tool's own session is filed under its name, and is not one of the tools counted per person
  insert into editor_sessions(token, display_name, expires_at, can_use_access) values ('zz-token-acc', 'Zz Boss', now() + interval '1 hour', true);
  assert (select tool from usage_logins where who = 'Zz Boss' order by id desc limit 1) = 'access', 'an Access sign-in is logged as access';
  d := acc_logins('Zz Boss', 30);
  assert not d->'tools' ? 'access' and (select count(*) from jsonb_array_elements(d->'recent') z where z->>'who' = 'Zz Boss' and z->>'tool' = 'access') = 1, 'listed among the latest sign-ins';

  raise notice 'acc_t1 ok';
end $$;
rollback;
