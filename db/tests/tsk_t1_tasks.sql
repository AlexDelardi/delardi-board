-- Task tracker: rights, tasks, checklist, comments, client tags, the inbox and the carry-over.
-- Invented fixtures only. Rolled back.
begin;
do $$
declare
  d jsonb; x jsonb; v_id uuid; v_b uuid; v_s uuid; v_item bigint; v_topic uuid; v_topic2 uuid; v_topic3 uuid; v_sug uuid; v_sug2 uuid; n int; ok boolean;
begin
  insert into board_users(name, passcode_hash, active, can_use_floor_tasks, can_use_backoffice_tasks, can_manage_tasks, can_view_sensitive, can_view_crm, can_view_email_suggestions) values
    ('Zz Boss',  'zz-hash-1', true,  true,  true,  true,  true,  true,  true),
    ('Zz Lead',  'zz-hash-2', true,  true,  false, true,  false, true,  false),
    ('Zz Rep',   'zz-hash-3', true,  true,  false, false, false, true,  false),
    ('Zz New',   'zz-hash-4', true,  true,  false, false, false, false, false),
    ('Zz Back',  'zz-hash-5', true,  false, true,  false, false, false, true),
    ('Zz None',  'zz-hash-6', true,  false, false, false, true,  true,  true),
    ('Zz Gone',  'zz-hash-7', false, true,  true,  true,  true,  true,  true);
  insert into crm_clients(client_id, record_type, name_confirmed) values ('ZZT-1', 'client', 'Zz Client One'), ('ZZT-2', 'client', 'Zz Client Two');

  -- rights: the API's service role only
  assert not has_table_privilege('anon', 'public.tsk_tasks', 'select') and not has_table_privilege('authenticated', 'public.tsk_comments', 'select')
     and not has_table_privilege('anon', 'public.tsk_task_clients', 'select') and not has_table_privilege('authenticated', 'public.tsk_log', 'insert'), 'the tables are closed to the page';
  assert not has_function_privilege('anon', 'public.tsk_snapshot(text)', 'execute') and not has_function_privilege('authenticated', 'public.tsk_save(text,jsonb)', 'execute')
     and not has_function_privilege('anon', 'public.tsk_carry_over(text)', 'execute') and not has_function_privilege('anon', 'public.tsk_client_search(text,text)', 'execute')
     and not has_function_privilege('authenticated', 'public.tsk_inbox_decide(text,uuid,boolean,smallint)', 'execute'), 'the functions are closed to the page';

  -- who may come in
  for x in select * from jsonb_array_elements('["Zz None", "Zz Gone", "Nobody"]'::jsonb) loop
    begin perform tsk_snapshot(x #>> '{}'); ok := false; exception when others then ok := sqlerrm like '%does not have access%'; end;
    assert ok, 'no ribbon, inactive or unknown: refused (' || (x #>> '{}') || ')';
  end loop;
  d := tsk_snapshot('Zz Rep');
  assert (d->'me'->>'floor')::boolean and not (d->'me'->>'backoffice')::boolean and not (d->'me'->>'manage')::boolean and not (d->'me'->>'inbox')::boolean, 'a rep: floor only';
  assert (select string_agg(z->>'slug', ',') from jsonb_array_elements(d->'scopes') z) = 'operations,crm,brand,aftersales,sales', 'the floor scopes in order: ' || (d->'scopes')::text;
  d := tsk_snapshot('Zz Boss');
  assert jsonb_array_length(d->'scopes') = 9 and (d->'me'->>'inbox')::boolean and (d->'me'->>'sensitive')::boolean, 'the boss: both ribbons, the inbox, sensitive';
  assert (select count(*) from jsonb_array_elements(d->'people') z where z->>'name' like 'Zz %') = 5, 'people are the active logins with a ribbon';
  assert (tsk_snapshot('Zz Back')->'me'->>'sensitive') = 'false', 'sensitive follows the login';

  -- a rep creates a task for herself
  d := tsk_save('Zz Rep', '{"scope_id": 2, "title": "  Call back about the ring  ", "due_on": "2031-06-20", "priority": "high",
                           "checklist": [{"body": "Find the size"}, {"body": "  "}, {"body": "Call", "done": true}]}');
  v_id := (d->>'task_id')::uuid;
  assert d->>'title' = 'Call back about the ring' and d->>'owner' = 'Zz Rep' and d->>'status' = 'todo' and d->>'ribbon' = 'floor' and d->>'priority' = 'high'
     and d->>'due_on' = '2031-06-20', 'created for herself: ' || d::text;
  assert jsonb_array_length(d->'checklist') = 2 and d->'checklist'->1->>'done' = 'true', 'an empty checklist line is dropped: ' || (d->'checklist')::text;
  begin perform tsk_save('Zz Rep', '{"scope_id": 2, "title": " "}'); ok := false; exception when others then ok := sqlerrm like '%title%'; end; assert ok, 'a task needs a title';
  begin perform tsk_save('Zz Rep', '{"scope_id": 12, "title": "x"}'); ok := false; exception when others then ok := sqlerrm like '%cannot add tasks there%'; end; assert ok, 'a floor login cannot add a backoffice task';
  begin perform tsk_save('Zz Rep', '{"scope_id": 99, "title": "x"}'); ok := false; exception when others then ok := sqlerrm like '%Choose a scope%'; end; assert ok, 'an unknown scope is refused';
  -- only a manager gives a task to someone else
  begin perform tsk_save('Zz Rep', '{"scope_id": 1, "title": "x", "owner": "Zz New"}'); ok := false; exception when others then ok := sqlerrm like '%Only a manager%'; end; assert ok, 'a rep cannot assign';
  begin perform tsk_save('Zz Rep', jsonb_build_object('task_id', v_id, 'owner', 'Zz New')); ok := false; exception when others then ok := sqlerrm like '%Only a manager%'; end; assert ok, 'nor reassign';
  d := tsk_save('Zz Lead', jsonb_build_object('task_id', v_id, 'owner', 'Zz New'));
  assert d->>'owner' = 'Zz New', 'a manager reassigns';
  d := tsk_save('Zz Rep', jsonb_build_object('task_id', v_id, 'owner', 'Zz Rep'));
  assert d->>'owner' = 'Zz Rep', 'anyone may take a task for themselves';
  begin perform tsk_save('Zz Lead', jsonb_build_object('task_id', v_id, 'owner', 'Zz Back')); ok := false; exception when others then ok := sqlerrm like '%does not use this part%'; end; assert ok, 'the owner must use that ribbon';
  -- another rep updates it: allowed; only the keys sent are touched
  d := tsk_save('Zz New', jsonb_build_object('task_id', v_id, 'status', 'done'));
  assert d->>'status' = 'done' and d->>'done_at' is not null and d->>'title' = 'Call back about the ring' and d->>'due_on' = '2031-06-20', 'done, the rest untouched: ' || d::text;
  d := tsk_save('Zz New', jsonb_build_object('task_id', v_id, 'status', 'in_progress', 'notes', ' note ', 'due_on', '', 'piece_ref', 'ZZ-REF-1'));
  assert d->>'status' = 'in_progress' and d->>'done_at' is null and d->>'notes' = 'note' and d->>'due_on' is null and d->>'piece_ref' = 'ZZ-REF-1', 'reopened, edited: ' || d::text;
  begin perform tsk_save('Zz New', jsonb_build_object('task_id', v_id, 'status', 'nope')); ok := false; exception when others then ok := sqlerrm like '%not a status%'; end; assert ok, 'a status must be one of the four';
  begin perform tsk_save('Zz New', jsonb_build_object('task_id', v_id, 'scope_id', 12)); ok := false; exception when others then ok := sqlerrm like '%stays on its ribbon%'; end; assert ok, 'a task stays on its ribbon';
  begin perform tsk_save('Zz New', jsonb_build_object('task_id', v_id, 'sensitive', true)); ok := false; exception when others then ok := sqlerrm like '%cannot mark%'; end; assert ok, 'no sensitive tasks on the floor';

  -- checklist: tick one; replace the list keeping ids
  v_item := (d->'checklist'->0->>'item_id')::bigint;
  d := tsk_tick('Zz New', v_item, true);
  assert d->'checklist'->0->>'done' = 'true' and (select done_by from tsk_checklist where item_id = v_item) = 'Zz New', 'ticked, by whom';
  d := tsk_save('Zz Rep', jsonb_build_object('task_id', v_id, 'checklist', jsonb_build_array(jsonb_build_object('body', 'New first'), jsonb_build_object('item_id', v_item, 'body', 'Find the size', 'done', true))));
  assert jsonb_array_length(d->'checklist') = 2 and d->'checklist'->0->>'body' = 'New first' and (d->'checklist'->1->>'item_id')::bigint = v_item
     and (select done_by from tsk_checklist where item_id = v_item) = 'Zz New', 'the list is replaced in order, kept steps keep who ticked them: ' || (d->'checklist')::text;

  -- comments and history
  d := tsk_comment('Zz New', v_id, '  She asked for Friday  ');
  assert jsonb_array_length(d->'comment_list') = 1 and d->'comment_list'->0->>'body' = 'She asked for Friday' and d->'comment_list'->0->>'author' = 'Zz New' and (d->>'comments')::int = 1, 'a comment: ' || (d->'comment_list')::text;
  begin perform tsk_comment('Zz New', v_id, '  '); ok := false; exception when others then ok := sqlerrm like '%Write the comment%'; end; assert ok, 'an empty comment is refused';
  assert jsonb_array_length(d->'history') >= 5 and d->'history'->0->>'actor' is not null, 'the history is kept: ' || (d->'history')::text;

  -- client tags: the CRM right to tag and to read the name
  d := tsk_save('Zz Rep', jsonb_build_object('task_id', v_id, 'clients', '["ZZT-1", "ZZT-2", "ZZT-1"]'::jsonb));
  assert jsonb_array_length(d->'clients') = 2 and d->'clients'->0->>'name' = 'Zz Client One' and d->'clients'->0->>'client_id' = 'ZZT-1', 'two clients tagged, named for a CRM login: ' || (d->'clients')::text;
  x := tsk_task('Zz New', v_id);
  assert jsonb_array_length(x->'clients') = 2 and x->'clients'->0->>'name' is null and x->'clients'->0->>'client_id' is null, 'without CRM access a tag says only that a client is attached: ' || (x->'clients')::text;
  begin perform tsk_save('Zz New', jsonb_build_object('task_id', v_id, 'clients', '["ZZT-1"]'::jsonb)); ok := false; exception when others then ok := sqlerrm like '%needs CRM access%'; end; assert ok, 'tagging needs the CRM right';
  begin perform tsk_save('Zz Rep', jsonb_build_object('task_id', v_id, 'clients', '["NOPE"]'::jsonb)); ok := false; exception when others then ok := sqlerrm like '%client was not found%'; end; assert ok, 'an unknown client is refused';
  d := tsk_save('Zz Rep', jsonb_build_object('task_id', v_id, 'clients', '["ZZT-2"]'::jsonb));
  assert jsonb_array_length(d->'clients') = 1 and d->'clients'->0->>'client_id' = 'ZZT-2', 'the set of tags is replaced';
  assert tsk_client_search('Zz Rep', 'zz client t')->0->>'client_id' = 'ZZT-2' and jsonb_array_length(tsk_client_search('Zz Rep', 'ZZT-')) = 2 and tsk_client_search('Zz Rep', 'z') = '[]'::jsonb, 'search by name or reference, two letters at least';
  begin perform tsk_client_search('Zz New', 'zz'); ok := false; exception when others then ok := sqlerrm like '%needs CRM access%'; end; assert ok, 'searching clients needs the CRM right';

  -- the ribbons are walls; sensitive is a second one
  d := tsk_save('Zz Boss', '{"scope_id": 12, "title": "Backoffice plain", "owner": "Zz Back"}'); v_b := (d->>'task_id')::uuid;
  d := tsk_save('Zz Boss', '{"scope_id": 14, "title": "Backoffice sensitive", "sensitive": true}'); v_s := (d->>'task_id')::uuid;
  assert (select count(*) from jsonb_array_elements(tsk_snapshot('Zz Rep')->'tasks') z where z->>'title' like 'Backoffice%') = 0, 'the floor does not see backoffice tasks';
  assert (select string_agg(z->>'title', ',' order by z->>'title') from jsonb_array_elements(tsk_snapshot('Zz Back')->'tasks') z) = 'Backoffice plain', 'backoffice without the sensitive right sees the plain one only';
  assert (select count(*) from jsonb_array_elements(tsk_snapshot('Zz Boss')->'tasks') z) = 3, 'the boss sees all three';
  begin perform tsk_task('Zz Rep', v_b); ok := false; exception when others then ok := sqlerrm like '%not found%'; end; assert ok, 'a task on the other ribbon is "not found"';
  begin perform tsk_comment('Zz Back', v_s, 'x'); ok := false; exception when others then ok := sqlerrm like '%not found%'; end; assert ok, 'so is a sensitive one';
  begin perform tsk_save('Zz Back', jsonb_build_object('task_id', v_id, 'title', 'x')); ok := false; exception when others then ok := sqlerrm like '%not found%'; end; assert ok, 'and a floor task for a backoffice-only login';

  -- archive: a manager's call; an archived task leaves the list and cannot be changed until restored
  begin perform tsk_archive('Zz Rep', v_id, true); ok := false; exception when others then ok := sqlerrm like '%Only a manager%'; end; assert ok, 'a rep cannot archive';
  perform tsk_archive('Zz Lead', v_id, true);
  assert (select count(*) from jsonb_array_elements(tsk_snapshot('Zz Rep')->'tasks') z where (z->>'task_id')::uuid = v_id) = 0, 'archived: off the list';
  begin perform tsk_save('Zz Rep', jsonb_build_object('task_id', v_id, 'title', 'x')); ok := false; exception when others then ok := sqlerrm like '%archived%'; end; assert ok, 'archived: no edits';
  begin perform tsk_tick('Zz Rep', v_item, false); ok := false; exception when others then ok := sqlerrm like '%archived%'; end; assert ok, 'archived: no ticks';
  perform tsk_archive('Zz Lead', v_id, false);
  assert (select count(*) from jsonb_array_elements(tsk_snapshot('Zz Rep')->'tasks') z where (z->>'task_id')::uuid = v_id) = 1, 'restored';
  -- a task done long ago leaves the list
  update tsk_tasks set status = 'done', done_at = now() - interval '61 days' where task_id = v_id;
  assert (select count(*) from jsonb_array_elements(tsk_snapshot('Zz Rep')->'tasks') z where (z->>'task_id')::uuid = v_id) = 0, 'done more than 60 days ago: off the list';

  -- the carry-over
  insert into pillars(id, slug, name, sort_order, accent) values (1, 'marketing', 'Marketing', 1, '#000'), (2, 'retail', 'Retail', 2, '#000'), (3, 'operations', 'Operations', 3, '#000'), (4, 'steering', 'Company Steering', 4, '#000') on conflict do nothing;
  insert into weeks(week_start) values (date '2031-06-09') on conflict do nothing;
  insert into topics(pillar_id, title, detail, owner, supporting, status, priority, next_step, due_date, sensitive, archived, created_by, first_raised_week) values
    (2, 'Zz topic live', 'Detail', 'Zz Away', 'Zz Help', 'in_progress', 'high', 'Do the next thing', date '2031-07-01', false, false, 'zz', date '2031-06-09') returning id into v_topic;
  insert into topics(pillar_id, title, status, priority, sensitive, archived, created_by, first_raised_week) values
    (4, 'Zz topic decision', 'needs_decision', 'low', true, false, 'zz', date '2031-06-09') returning id into v_topic2;
  insert into topics(pillar_id, title, status, priority, archived, created_by, first_raised_week) values
    (1, 'Zz topic parked', 'parked', 'medium', false, 'zz', date '2031-06-09'), (1, 'Zz topic done', 'done', 'medium', false, 'zz', date '2031-06-09'),
    (3, 'Zz topic archived', 'in_progress', 'medium', true, 'zz', date '2031-06-09');
  insert into topics(pillar_id, title, status, priority, archived, created_by, first_raised_week) values (3, 'Zz topic fresh', 'not_started', 'medium', false, 'zz', date '2031-06-09') returning id into v_topic3;
  n := tsk_carry_over('Zz Boss');
  assert (select count(*) from tsk_tasks t join topics tp on tp.id = t.source_topic_id where tp.created_by = 'zz') = 3, 'live topics come over; parked, done and archived stay';
  select * into x from (select to_jsonb(t) from tsk_tasks t where t.source_topic_id = v_topic) z(j);
  assert x->>'scope_id' = '12' and x->>'owner' = 'Zz Away' and x->>'helper' = 'Zz Help' and x->>'status' = 'in_progress' and x->>'priority' = 'high' and x->>'due_on' = '2031-07-01' and x->>'notes' = 'Detail', 'a topic as a task: ' || x::text;
  assert (select string_agg(body, ' | ' order by comment_id) from tsk_comments where task_id = (x->>'task_id')::uuid) = 'Next step: Do the next thing', 'its next step is the first comment';
  select * into x from (select to_jsonb(t) from tsk_tasks t where t.source_topic_id = v_topic2) z(j);
  assert x->>'scope_id' = '14' and x->>'status' = 'waiting' and x->>'priority' = 'normal' and (x->>'sensitive')::boolean, 'needs decision becomes waiting, sensitive kept: ' || x::text;
  assert (select body from tsk_comments where task_id = (x->>'task_id')::uuid) = 'On the Weekly Board this was "Needs decision".', 'the Board''s word is kept as a comment';
  assert (select status from tsk_tasks where source_topic_id = v_topic3) = 'todo', 'not started becomes to do';
  assert tsk_carry_over('Zz Boss') = 0, 'a second run adds nothing';
  assert (select title from topics where id = v_topic) = 'Zz topic live', 'the Board''s topics are untouched';
  -- an owner who does not use the tracker stays on the task, and the task can still be edited
  d := tsk_save('Zz Back', jsonb_build_object('task_id', (select task_id from tsk_tasks where source_topic_id = v_topic), 'status', 'waiting'));
  assert d->>'owner' = 'Zz Away' and d->>'status' = 'waiting' and (d->>'from_board')::boolean, 'a carried task keeps its outside owner';

  -- the inbox: for whoever had it on the Board
  update suggestions set state = 'dismissed' where state = 'pending';
  insert into suggestions(kind, target_topic_id, note, next_step, source_meeting, source_date, state, channel) values ('update', v_topic, 'They replied', 'Answer them', 'Zz mail', date '2031-06-10', 'pending', 'email') returning id into v_sug;
  insert into suggestions(kind, pillar_id, title, note, source_meeting, state, channel) values ('new', 1, 'Zz new idea', 'Worth a look', 'Zz call', 'pending', 'zoom') returning id into v_sug2;
  begin perform tsk_inbox('Zz Rep'); ok := false; exception when others then ok := sqlerrm like '%no suggestions inbox%'; end; assert ok, 'no inbox for the floor';
  d := tsk_inbox('Zz Back');
  assert jsonb_array_length(d) = 2 and (tsk_snapshot('Zz Back')->>'inbox')::int = 2 and (tsk_snapshot('Zz Rep')->>'inbox')::int = 0, 'two waiting, counted for the inbox holder only';
  x := (select z from jsonb_array_elements(d) z where (z->>'id')::uuid = v_sug);
  assert x->>'task_title' = 'Zz topic live' and x->>'title' = 'Zz topic live' and x->>'scope_id' = '12', 'a suggestion about a carried topic names its task: ' || x::text;
  d := tsk_inbox_decide('Zz Back', v_sug, true);
  assert (d->>'left')::int = 1 and (select body from tsk_comments where task_id = (d->>'task_id')::uuid order by comment_id desc limit 1) = E'They replied\nNext step: Answer them\n(Zz mail, 10 Jun 2031)', 'accepted: a comment on the task';
  d := tsk_inbox_decide('Zz Back', v_sug2, true);
  assert (select t.title || '/' || t.scope_id || '/' || t.owner || '/' || t.notes from tsk_tasks t where t.task_id = (d->>'task_id')::uuid) = E'Zz new idea/11/Zz Back/Worth a look\n(Zz call)', 'accepted: a new backoffice task';
  begin perform tsk_inbox_decide('Zz Back', v_sug2, false); ok := false; exception when others then ok := sqlerrm like '%already decided%'; end; assert ok, 'a suggestion is decided once';
  assert (select state || '/' || decided_by from suggestions where id = v_sug2) = 'accepted/Zz Back', 'who decided is kept';
  insert into suggestions(kind, pillar_id, title, note, source_meeting, state, channel) values ('new', 1, 'Zz drop', 'n', 'Zz mail', 'pending', 'email') returning id into v_sug;
  d := tsk_inbox_decide('Zz Back', v_sug, false);
  assert d->>'task_id' is null and (select state from suggestions where id = v_sug) = 'dismissed', 'dismissed: no task';

  -- sensitive topics and the inbox (Zz Back has the inbox but not the sensitive right; Zz Boss has both)
  insert into suggestions(kind, target_topic_id, note, source_meeting, state, channel) values ('update', v_topic2, 'Zz secret reply', 'Zz mail', 'pending', 'email') returning id into v_sug;
  assert not exists (select 1 from jsonb_array_elements(tsk_inbox('Zz Back')) z where (z->>'id')::uuid = v_sug) and (tsk_snapshot('Zz Back')->>'inbox')::int = 0,
    'a suggestion about a sensitive task is kept from an inbox without the sensitive right, and not counted';
  begin perform tsk_inbox_decide('Zz Back', v_sug, true); ok := false; exception when others then ok := sqlerrm like '%suggestion was not found%'; end; assert ok, 'nor can it be decided there';
  assert exists (select 1 from jsonb_array_elements(tsk_inbox('Zz Boss')) z where (z->>'id')::uuid = v_sug) and (tsk_snapshot('Zz Boss')->>'inbox')::int = 1, 'the sensitive right sees and counts it';
  -- its task archived: accepting makes a new task, which must stay sensitive
  update tsk_tasks set archived = true where source_topic_id = v_topic2;
  d := tsk_inbox_decide('Zz Boss', v_sug, true);
  assert (select sensitive from tsk_tasks where task_id = (d->>'task_id')::uuid) and (d->>'task_id')::uuid <> (select task_id from tsk_tasks where source_topic_id = v_topic2),
    'a task made from a suggestion about a sensitive topic is sensitive';
  assert (select count(*) from jsonb_array_elements(tsk_snapshot('Zz Back')->'tasks') z where (z->>'task_id')::uuid = (d->>'task_id')::uuid) = 0, 'and stays out of sight without the right';
  -- a sensitive topic that was never carried (parked)
  insert into topics(pillar_id, title, status, priority, sensitive, archived, created_by, first_raised_week) values (4, 'Zz parked secret', 'parked', 'medium', true, false, 'zz', date '2031-06-09') returning id into v_topic3;
  insert into suggestions(kind, target_topic_id, note, source_meeting, state, channel) values ('update', v_topic3, 'Zz more', 'Zz mail', 'pending', 'email') returning id into v_sug;
  assert not exists (select 1 from jsonb_array_elements(tsk_inbox('Zz Back')) z where (z->>'id')::uuid = v_sug), 'the same for a sensitive topic that never came over';
  d := tsk_inbox_decide('Zz Boss', v_sug, true);
  assert (select sensitive and title = 'Zz parked secret' from tsk_tasks where task_id = (d->>'task_id')::uuid), 'its new task is sensitive too';

  raise notice 'tsk_t1 ok';
end $$;
rollback;
