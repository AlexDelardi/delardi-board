-- Task tracker: the tool that takes over from the Weekly Board.
--
-- Two ribbons, each with its own scopes:
--   floor       Operations · CRM · Brand · Aftersales · Sales          (the boutique team)
--   backoffice  Marketing · Retail · Operations · Company Steering     (what the Board's pillars were)
-- A task has an owner, a due date, a priority, a status, a checklist, comments, and may be tagged with CRM clients
-- and one catalogue piece. Work is tracked as tasks, not as topics reviewed week by week.
--
-- Rights are on the login (board_users) and re-read on every call:
--   can_use_floor_tasks        sees and works the floor ribbon
--   can_use_backoffice_tasks   sees and works the backoffice ribbon
--   can_manage_tasks           gives a task to someone else, archives
-- Without the manage right a person creates tasks for themselves, and updates and comments on any task they can see.
-- A sensitive task (backoffice only) is seen only with board_users.can_view_sensitive.
-- A client's name on a tag is given only with board_users.can_view_crm; without it the tag says a client is attached.
--
-- The Board's own tables (topics, topic_updates, weeks, suggestions, scoreboard) are not altered. tsk_carry_over()
-- copies its live topics in once; the suggestions inbox is read from where it is.
-- Everything here is called by tasks-api with the service role; nobody else may execute or read it.

alter table public.board_users
  add column if not exists can_use_floor_tasks boolean not null default false,
  add column if not exists can_use_backoffice_tasks boolean not null default false,
  add column if not exists can_manage_tasks boolean not null default false;
comment on column public.board_users.can_use_floor_tasks is 'Task tracker: sees and works the shop-floor ribbon.';
comment on column public.board_users.can_use_backoffice_tasks is 'Task tracker: sees and works the backoffice ribbon.';
comment on column public.board_users.can_manage_tasks is 'Task tracker: may give a task to someone else and archive tasks.';
alter table public.editor_sessions add column if not exists can_use_tasks boolean not null default false;

create table public.tsk_scopes (
  scope_id   smallint primary key,
  ribbon     text not null check (ribbon in ('floor', 'backoffice')),
  slug       text not null,
  name_en    text not null,
  name_ru    text not null,
  sort_order smallint not null,
  unique (ribbon, slug)
);
insert into public.tsk_scopes(scope_id, ribbon, slug, name_en, name_ru, sort_order) values
  (1,  'floor', 'operations', 'Operations', 'Операции', 1),
  (2,  'floor', 'crm',        'CRM',        'CRM',      2),
  (3,  'floor', 'brand',      'Brand',      'Бренды',   3),
  (4,  'floor', 'aftersales', 'Aftersales', 'Сервис',   4),
  (5,  'floor', 'sales',      'Sales',      'Продажи',  5),
  -- 10 + the Board's pillar id, so a topic's pillar maps straight to its scope
  (11, 'backoffice', 'marketing',  'Marketing',        'Маркетинг',            1),
  (12, 'backoffice', 'retail',     'Retail',           'Ритейл',               2),
  (13, 'backoffice', 'operations', 'Operations',       'Операции',             3),
  (14, 'backoffice', 'steering',   'Company Steering', 'Управление компанией', 4);

create table public.tsk_tasks (
  task_id         uuid primary key default gen_random_uuid(),
  scope_id        smallint not null references public.tsk_scopes(scope_id),
  store_id        smallint not null default 1 references public.ops_stores(store_id),
  title           text not null check (btrim(title) <> '' and length(title) <= 200),
  notes           text check (notes is null or length(notes) <= 8000),
  owner           text,
  helper          text,
  due_on          date,
  priority        text not null default 'normal' check (priority in ('normal', 'high')),
  status          text not null default 'todo' check (status in ('todo', 'in_progress', 'waiting', 'done')),
  sensitive       boolean not null default false,
  piece_ref       text check (piece_ref is null or length(piece_ref) <= 80),
  source_topic_id uuid unique,                      -- the Board topic this was carried over from, if any
  archived        boolean not null default false,
  created_by      text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  done_at         timestamptz
);
create index tsk_tasks_open on public.tsk_tasks(scope_id) where not archived;

create table public.tsk_checklist (
  item_id    bigint generated always as identity primary key,
  task_id    uuid not null references public.tsk_tasks(task_id) on delete cascade,
  body       text not null check (btrim(body) <> '' and length(body) <= 300),
  done       boolean not null default false,
  sort_order integer not null default 0,
  done_by    text,
  done_at    timestamptz
);
create index tsk_checklist_task on public.tsk_checklist(task_id);

create table public.tsk_comments (
  comment_id bigint generated always as identity primary key,
  task_id    uuid not null references public.tsk_tasks(task_id) on delete cascade,
  body       text not null check (btrim(body) <> '' and length(body) <= 4000),
  author     text not null,
  created_at timestamptz not null default now()
);
create index tsk_comments_task on public.tsk_comments(task_id);

create table public.tsk_task_clients (
  task_id   uuid not null references public.tsk_tasks(task_id) on delete cascade,
  client_id text not null references public.crm_clients(client_id),
  added_by  text not null,
  added_at  timestamptz not null default now(),
  primary key (task_id, client_id)
);
create index tsk_task_clients_client on public.tsk_task_clients(client_id);

create table public.tsk_log (
  log_id  bigint generated always as identity primary key,
  task_id uuid,
  action  text not null,
  actor   text not null,
  payload jsonb,
  at      timestamptz not null default now()
);
create index tsk_log_task on public.tsk_log(task_id);

alter table public.tsk_scopes enable row level security;
alter table public.tsk_tasks enable row level security;
alter table public.tsk_checklist enable row level security;
alter table public.tsk_comments enable row level security;
alter table public.tsk_task_clients enable row level security;
alter table public.tsk_log enable row level security;
revoke all on table public.tsk_scopes, public.tsk_tasks, public.tsk_checklist, public.tsk_comments, public.tsk_task_clients, public.tsk_log from public, anon, authenticated;
revoke all on sequence public.tsk_checklist_item_id_seq, public.tsk_comments_comment_id_seq, public.tsk_log_log_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------- who is asking
-- The person's rights as they stand now. Refuses a login with neither ribbon.
create function public.tsk_me(p_user text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u board_users%rowtype;
begin
  select * into u from board_users where name = p_user and active;
  if not found or not (u.can_use_floor_tasks or u.can_use_backoffice_tasks) then
    raise exception 'This account does not have access to the task tracker.';
  end if;
  return jsonb_build_object('name', u.name, 'floor', u.can_use_floor_tasks, 'backoffice', u.can_use_backoffice_tasks,
    'manage', u.can_manage_tasks, 'sensitive', u.can_view_sensitive and u.can_use_backoffice_tasks, 'crm', u.can_view_crm,
    -- the suggestions inbox was the Board's; it stays with whoever had it there, on the backoffice side
    'inbox', u.can_view_email_suggestions and u.can_use_backoffice_tasks);
end $$;
revoke execute on function public.tsk_me(text) from public, anon, authenticated;

-- May this person see this task? (its ribbon, and the sensitive rule)
create function public.tsk_can_see(p_me jsonb, p_ribbon text, p_sensitive boolean) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select coalesce((p_me->>p_ribbon)::boolean, false) and (not coalesce(p_sensitive, false) or coalesce((p_me->>'sensitive')::boolean, false))
$$;
revoke execute on function public.tsk_can_see(jsonb, text, boolean) from public, anon, authenticated;

-- One task as the page reads it. Client names only with the CRM right.
create function public.tsk_task_json(p_task_id uuid, p_me jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'task_id', t.task_id, 'ribbon', s.ribbon, 'scope_id', t.scope_id, 'title', t.title, 'notes', t.notes, 'owner', t.owner, 'helper', t.helper,
    'due_on', t.due_on, 'priority', t.priority, 'status', t.status, 'sensitive', t.sensitive, 'piece_ref', t.piece_ref, 'archived', t.archived,
    'from_board', t.source_topic_id is not null, 'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at, 'done_at', t.done_at,
    'checklist', coalesce((select jsonb_agg(jsonb_build_object('item_id', c.item_id, 'body', c.body, 'done', c.done) order by c.sort_order, c.item_id)
                             from tsk_checklist c where c.task_id = t.task_id), '[]'::jsonb),
    'clients', coalesce((select jsonb_agg(jsonb_build_object('client_id', case when (p_me->>'crm')::boolean then k.client_id end,
                                                             'name', case when (p_me->>'crm')::boolean then q.display_name end) order by k.added_at, k.client_id)
                           from tsk_task_clients k left join crm_queue q on q.client_id = k.client_id where k.task_id = t.task_id), '[]'::jsonb),
    'comments', (select count(*) from tsk_comments m where m.task_id = t.task_id))
  from tsk_tasks t join tsk_scopes s on s.scope_id = t.scope_id where t.task_id = p_task_id
$$;
revoke execute on function public.tsk_task_json(uuid, jsonb) from public, anon, authenticated;

-- A suggestion about a sensitive Board topic, or about the sensitive task that topic became, is for the sensitive right
-- only: the Board kept such suggestions from everyone else, and so does the inbox here.
create function public.tsk_suggestion_visible(p_topic_id uuid, p_me jsonb) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((p_me->>'sensitive')::boolean, false)
      or not (coalesce((select tp.sensitive from topics tp where tp.id = p_topic_id), false)
              or exists (select 1 from tsk_tasks t where t.source_topic_id = p_topic_id and t.sensitive))
$$;
revoke execute on function public.tsk_suggestion_visible(uuid, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------------- reading
-- Everything the page opens with: who I am, the scopes and people of my ribbons, the live tasks.
-- A finished task stays in the list for 60 days, then is found only by opening it.
create function public.tsk_snapshot(p_user text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me jsonb := tsk_me(p_user);
begin
  return jsonb_build_object(
    'me', me,
    'scopes', coalesce((select jsonb_agg(jsonb_build_object('scope_id', s.scope_id, 'ribbon', s.ribbon, 'slug', s.slug, 'name_en', s.name_en, 'name_ru', s.name_ru)
                          order by s.ribbon desc, s.sort_order) from tsk_scopes s where (me->>s.ribbon)::boolean), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('name', u.name, 'floor', u.can_use_floor_tasks, 'backoffice', u.can_use_backoffice_tasks) order by u.name)
                          from board_users u where u.active and (u.can_use_floor_tasks or u.can_use_backoffice_tasks)), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(tsk_task_json(t.task_id, me) order by t.due_on nulls last, t.created_at)
                         from tsk_tasks t join tsk_scopes s on s.scope_id = t.scope_id
                        where not t.archived and tsk_can_see(me, s.ribbon, t.sensitive)
                          and (t.status <> 'done' or t.done_at > now() - interval '60 days')), '[]'::jsonb),
    'inbox', case when (me->>'inbox')::boolean then (select count(*) from suggestions g where g.state = 'pending' and tsk_suggestion_visible(g.target_topic_id, me)) else 0 end);
end $$;
revoke execute on function public.tsk_snapshot(text) from public, anon, authenticated;

-- One task with its comments and its history.
create function public.tsk_task(p_user text, p_task_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me jsonb := tsk_me(p_user); v_ribbon text; v_sens boolean;
begin
  select s.ribbon, t.sensitive into v_ribbon, v_sens from tsk_tasks t join tsk_scopes s on s.scope_id = t.scope_id where t.task_id = p_task_id;
  if not found or not tsk_can_see(me, v_ribbon, v_sens) then raise exception 'That task was not found.'; end if;
  return tsk_task_json(p_task_id, me) || jsonb_build_object(
    'comment_list', coalesce((select jsonb_agg(jsonb_build_object('comment_id', m.comment_id, 'body', m.body, 'author', m.author, 'at', m.created_at) order by m.created_at, m.comment_id)
                                from tsk_comments m where m.task_id = p_task_id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(z.j order by z.at desc) from (
                   select jsonb_build_object('action', l.action, 'actor', l.actor, 'at', l.at, 'what', l.payload) j, l.at
                     from tsk_log l where l.task_id = p_task_id order by l.at desc, l.log_id desc limit 40) z), '[]'::jsonb));
end $$;
revoke execute on function public.tsk_task(text, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------- writing
-- Create a task (no task_id) or change one. Only the keys present in p_task are touched.
--   title, notes, scope_id, owner, helper, due_on, priority, status, sensitive, piece_ref,
--   clients: [client_id, …]            the full set of tags (needs the CRM right)
--   checklist: [{item_id?, body, done}] the full list, in order
create function public.tsk_save(p_user text, p_task jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me jsonb := tsk_me(p_user); v_manage boolean := (me->>'manage')::boolean;
  v_id uuid := nullif(p_task->>'task_id', '')::uuid; t tsk_tasks%rowtype; v_new boolean := false;
  v_ribbon text; v_scope smallint; v_scope_ribbon text; v_owner text; v_status text; v_changed text[] := '{}';
  v_title text; v_item jsonb; v_pos int := 0; v_keep bigint[] := '{}'; v_item_id bigint; v_body text; v_done boolean; v_c text; v_ids text[];
begin
  if v_id is null then
    v_new := true;
    v_scope := (p_task->>'scope_id')::smallint;
    select ribbon into v_ribbon from tsk_scopes where scope_id = v_scope;
    if v_ribbon is null then raise exception 'Choose a scope for the task.'; end if;
    if not coalesce((me->>v_ribbon)::boolean, false) then raise exception 'This account cannot add tasks there.'; end if;
    v_title := btrim(coalesce(p_task->>'title', ''));
    if v_title = '' then raise exception 'Give the task a title.'; end if;
    insert into tsk_tasks(scope_id, title, owner, created_by) values (v_scope, left(v_title, 200), p_user, p_user) returning * into t;
    v_changed := array['created'];
  else
    select * into t from tsk_tasks where task_id = v_id for update;
    if found then select ribbon into v_ribbon from tsk_scopes where scope_id = t.scope_id; end if;
    if not found or not tsk_can_see(me, v_ribbon, t.sensitive) then raise exception 'That task was not found.'; end if;
    if t.archived then raise exception 'This task is archived. Restore it to change it.'; end if;
    if p_task ? 'title' then
      v_title := btrim(coalesce(p_task->>'title', ''));
      if v_title = '' then raise exception 'Give the task a title.'; end if;
      if left(v_title, 200) is distinct from t.title then t.title := left(v_title, 200); v_changed := array_append(v_changed, 'title'::text); end if;
    end if;
    if p_task ? 'scope_id' and (p_task->>'scope_id')::smallint is distinct from t.scope_id then
      select ribbon into v_scope_ribbon from tsk_scopes where scope_id = (p_task->>'scope_id')::smallint;
      if v_scope_ribbon is distinct from v_ribbon then raise exception 'A task stays on its ribbon: choose one of its scopes.'; end if;
      t.scope_id := (p_task->>'scope_id')::smallint; v_changed := array_append(v_changed, 'scope'::text);
    end if;
  end if;

  if p_task ? 'owner' then
    v_owner := nullif(btrim(coalesce(p_task->>'owner', '')), '');
    if v_owner is distinct from t.owner then
      if v_owner is distinct from p_user and not v_manage then raise exception 'Only a manager can give a task to someone else.'; end if;
      if v_owner is not null and not exists (select 1 from board_users u where u.name = v_owner and u.active
             and case v_ribbon when 'floor' then u.can_use_floor_tasks else u.can_use_backoffice_tasks end) then
        raise exception 'That person does not use this part of the tracker.';
      end if;
      t.owner := v_owner; v_changed := array_append(v_changed, 'owner'::text);
    end if;
  end if;
  if p_task ? 'helper' and nullif(btrim(coalesce(p_task->>'helper', '')), '') is distinct from t.helper then
    t.helper := left(nullif(btrim(coalesce(p_task->>'helper', '')), ''), 80); v_changed := array_append(v_changed, 'helper'::text);
  end if;
  if p_task ? 'notes' and nullif(btrim(coalesce(p_task->>'notes', '')), '') is distinct from t.notes then
    t.notes := left(nullif(btrim(coalesce(p_task->>'notes', '')), ''), 8000); v_changed := array_append(v_changed, 'notes'::text);
  end if;
  if p_task ? 'due_on' and nullif(p_task->>'due_on', '')::date is distinct from t.due_on then
    t.due_on := nullif(p_task->>'due_on', '')::date; v_changed := array_append(v_changed, 'due'::text);
  end if;
  if p_task ? 'priority' and (p_task->>'priority') is distinct from t.priority then
    if (p_task->>'priority') not in ('normal', 'high') then raise exception 'Priority is normal or high.'; end if;
    t.priority := p_task->>'priority'; v_changed := array_append(v_changed, 'priority'::text);
  end if;
  if p_task ? 'status' and (p_task->>'status') is distinct from t.status then
    v_status := p_task->>'status';
    if v_status not in ('todo', 'in_progress', 'waiting', 'done') then raise exception 'That is not a status.'; end if;
    t.done_at := case when v_status = 'done' then now() end;
    t.status := v_status; v_changed := array_append(v_changed, ('status:' || v_status)::text);
  end if;
  if p_task ? 'sensitive' and coalesce((p_task->>'sensitive')::boolean, false) is distinct from t.sensitive then
    if v_ribbon <> 'backoffice' or not (me->>'sensitive')::boolean then raise exception 'This account cannot mark a task sensitive.'; end if;
    t.sensitive := coalesce((p_task->>'sensitive')::boolean, false); v_changed := array_append(v_changed, 'sensitive'::text);
  end if;
  if p_task ? 'piece_ref' and nullif(btrim(coalesce(p_task->>'piece_ref', '')), '') is distinct from t.piece_ref then
    t.piece_ref := left(nullif(btrim(coalesce(p_task->>'piece_ref', '')), ''), 80); v_changed := array_append(v_changed, 'piece'::text);
  end if;

  update tsk_tasks set scope_id = t.scope_id, title = t.title, notes = t.notes, owner = t.owner, helper = t.helper, due_on = t.due_on, priority = t.priority,
         status = t.status, done_at = t.done_at, sensitive = t.sensitive, piece_ref = t.piece_ref, updated_at = now() where task_id = t.task_id;

  if p_task ? 'clients' then
    if not (me->>'crm')::boolean then raise exception 'Tagging a client needs CRM access.'; end if;
    if jsonb_typeof(p_task->'clients') <> 'array' then raise exception 'clients must be a list.'; end if;
    select coalesce(array_agg(distinct x), '{}') into v_ids from jsonb_array_elements_text(p_task->'clients') x;
    if coalesce(array_length(v_ids, 1), 0) > 30 then raise exception 'A task takes up to 30 clients.'; end if;
    foreach v_c in array v_ids loop
      if not exists (select 1 from crm_clients k where k.client_id = v_c) then raise exception 'That client was not found.'; end if;
    end loop;
    if exists (select 1 from tsk_task_clients k where k.task_id = t.task_id and not (k.client_id = any(v_ids)))
       or exists (select 1 from unnest(v_ids) x where not exists (select 1 from tsk_task_clients k where k.task_id = t.task_id and k.client_id = x)) then
      delete from tsk_task_clients k where k.task_id = t.task_id and not (k.client_id = any(v_ids));
      insert into tsk_task_clients(task_id, client_id, added_by) select t.task_id, x, p_user from unnest(v_ids) x on conflict do nothing;
      v_changed := array_append(v_changed, 'clients'::text);
    end if;
  end if;

  if p_task ? 'checklist' then
    if jsonb_typeof(p_task->'checklist') <> 'array' then raise exception 'checklist must be a list.'; end if;
    if jsonb_array_length(p_task->'checklist') > 40 then raise exception 'A checklist takes up to 40 steps.'; end if;
    for v_item in select * from jsonb_array_elements(p_task->'checklist') loop
      v_pos := v_pos + 1;
      v_body := left(btrim(coalesce(v_item->>'body', '')), 300); v_done := coalesce((v_item->>'done')::boolean, false);
      if v_body = '' then continue; end if;
      v_item_id := nullif(v_item->>'item_id', '')::bigint;
      if v_item_id is not null and exists (select 1 from tsk_checklist c where c.item_id = v_item_id and c.task_id = t.task_id) then
        update tsk_checklist c set body = v_body, sort_order = v_pos,
               done_by = case when v_done and not c.done then p_user when not v_done then null else c.done_by end,
               done_at = case when v_done and not c.done then now() when not v_done then null else c.done_at end, done = v_done
         where c.item_id = v_item_id;
      else
        insert into tsk_checklist(task_id, body, done, sort_order, done_by, done_at)
        values (t.task_id, v_body, v_done, v_pos, case when v_done then p_user end, case when v_done then now() end) returning item_id into v_item_id;
      end if;
      v_keep := array_append(v_keep, v_item_id);
    end loop;
    delete from tsk_checklist c where c.task_id = t.task_id and not (c.item_id = any(v_keep));
    v_changed := array_append(v_changed, 'checklist'::text);
  end if;

  if array_length(v_changed, 1) > 0 then
    insert into tsk_log(task_id, action, actor, payload) values (t.task_id, case when v_new then 'created' else 'changed' end, p_user, jsonb_build_object('changed', to_jsonb(v_changed)));
  end if;
  return tsk_task_json(t.task_id, me);
end $$;
revoke execute on function public.tsk_save(text, jsonb) from public, anon, authenticated;

-- Tick or untick one checklist step.
create function public.tsk_tick(p_user text, p_item_id bigint, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me jsonb := tsk_me(p_user); v_task uuid; v_ribbon text; v_sens boolean; v_arch boolean;
begin
  select t.task_id, s.ribbon, t.sensitive, t.archived into v_task, v_ribbon, v_sens, v_arch
    from tsk_checklist c join tsk_tasks t on t.task_id = c.task_id join tsk_scopes s on s.scope_id = t.scope_id where c.item_id = p_item_id;
  if not found or not tsk_can_see(me, v_ribbon, v_sens) then raise exception 'That task was not found.'; end if;
  if v_arch then raise exception 'This task is archived. Restore it to change it.'; end if;
  update tsk_checklist set done = coalesce(p_done, false), done_by = case when p_done then p_user end, done_at = case when p_done then now() end where item_id = p_item_id;
  update tsk_tasks set updated_at = now() where task_id = v_task;
  return tsk_task_json(v_task, me);
end $$;
revoke execute on function public.tsk_tick(text, bigint, boolean) from public, anon, authenticated;

create function public.tsk_comment(p_user text, p_task_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me jsonb := tsk_me(p_user); v_ribbon text; v_sens boolean;
begin
  select s.ribbon, t.sensitive into v_ribbon, v_sens from tsk_tasks t join tsk_scopes s on s.scope_id = t.scope_id where t.task_id = p_task_id;
  if not found or not tsk_can_see(me, v_ribbon, v_sens) then raise exception 'That task was not found.'; end if;
  if btrim(coalesce(p_body, '')) = '' then raise exception 'Write the comment first.'; end if;
  insert into tsk_comments(task_id, body, author) values (p_task_id, left(btrim(p_body), 4000), p_user);
  update tsk_tasks set updated_at = now() where task_id = p_task_id;
  return tsk_task(p_user, p_task_id);
end $$;
revoke execute on function public.tsk_comment(text, uuid, text) from public, anon, authenticated;

-- Archive or restore. A manager's call: an archived task leaves every list but is never destroyed.
create function public.tsk_archive(p_user text, p_task_id uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me jsonb := tsk_me(p_user); v_ribbon text; v_sens boolean;
begin
  select s.ribbon, t.sensitive into v_ribbon, v_sens from tsk_tasks t join tsk_scopes s on s.scope_id = t.scope_id where t.task_id = p_task_id;
  if not found or not tsk_can_see(me, v_ribbon, v_sens) then raise exception 'That task was not found.'; end if;
  if not (me->>'manage')::boolean then raise exception 'Only a manager can archive a task.'; end if;
  update tsk_tasks set archived = coalesce(p_on, true), updated_at = now() where task_id = p_task_id;
  insert into tsk_log(task_id, action, actor) values (p_task_id, case when coalesce(p_on, true) then 'archived' else 'restored' end, p_user);
  return tsk_task_json(p_task_id, me);
end $$;
revoke execute on function public.tsk_archive(text, uuid, boolean) from public, anon, authenticated;

-- Find a client to tag: by name or by reference. CRM right only; live records only.
create function public.tsk_client_search(p_user text, p_q text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me jsonb := tsk_me(p_user); v_q text := btrim(coalesce(p_q, ''));
begin
  if not (me->>'crm')::boolean then raise exception 'Tagging a client needs CRM access.'; end if;
  if length(v_q) < 2 then return '[]'::jsonb; end if;
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  return coalesce((select jsonb_agg(jsonb_build_object('client_id', z.client_id, 'name', z.display_name) order by z.display_name, z.client_id) from (
      select q.client_id, q.display_name from crm_queue q join crm_clients k on k.client_id = q.client_id
       where q.merged_into is null and k.record_state in ('open', 'confirmed', 'parked')
         and (q.display_name ilike '%' || v_q || '%' or q.client_id ilike v_q || '%')
       order by q.display_name, q.client_id limit 12) z), '[]'::jsonb);
end $$;
revoke execute on function public.tsk_client_search(text, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ the inbox
-- The Board's suggestions (drafted from emails and calls), for whoever had them there.
create function public.tsk_inbox(p_user text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me jsonb := tsk_me(p_user);
begin
  if not (me->>'inbox')::boolean then raise exception 'This account has no suggestions inbox.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'kind', g.kind, 'title', coalesce(g.title, tp.title), 'note', g.note, 'next_step', g.next_step,
             'owner', g.owner, 'channel', g.channel, 'source', g.source_meeting, 'source_date', g.source_date, 'evidence', g.evidence,
             'scope_id', 10 + coalesce(g.pillar_id, tp.pillar_id), 'task_id', tk.task_id, 'task_title', tk.title) order by g.source_date desc nulls last, g.created_at desc)
      from suggestions g left join topics tp on tp.id = g.target_topic_id left join tsk_tasks tk on tk.source_topic_id = g.target_topic_id and not tk.archived
     where g.state = 'pending' and tsk_suggestion_visible(g.target_topic_id, me)), '[]'::jsonb);
end $$;
revoke execute on function public.tsk_inbox(text) from public, anon, authenticated;

-- Accept: a suggestion about a task already here becomes a comment on it; any other becomes a new backoffice task.
-- Dismiss: it leaves the inbox. Either way the suggestion keeps who decided and when.
create function public.tsk_inbox_decide(p_user text, p_suggestion_id uuid, p_accept boolean, p_scope_id smallint default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me jsonb := tsk_me(p_user); g suggestions%rowtype; v_task uuid; v_scope smallint; v_title text; v_body text; v_sens boolean;
begin
  if not (me->>'inbox')::boolean then raise exception 'This account has no suggestions inbox.'; end if;
  select * into g from suggestions where id = p_suggestion_id for update;
  if not found or not tsk_suggestion_visible(g.target_topic_id, me) then raise exception 'That suggestion was not found.'; end if;
  if g.state <> 'pending' then raise exception 'That suggestion was already decided.'; end if;
  if coalesce(p_accept, false) then
    select task_id into v_task from tsk_tasks where source_topic_id = g.target_topic_id and not archived;
    v_body := concat_ws(E'\n', nullif(btrim(coalesce(g.note, '')), ''), case when nullif(btrim(coalesce(g.next_step, '')), '') is not null then 'Next step: ' || btrim(g.next_step) end,
                        case when g.source_meeting is not null then '(' || g.source_meeting || coalesce(', ' || to_char(g.source_date, 'DD Mon YYYY'), '') || ')' end);
    if v_task is not null then
      if v_body <> '' then insert into tsk_comments(task_id, body, author) values (v_task, left(v_body, 4000), p_user); end if;
      update tsk_tasks set updated_at = now() where task_id = v_task;
      insert into tsk_log(task_id, action, actor, payload) values (v_task, 'suggestion_accepted', p_user, jsonb_build_object('suggestion', g.id));
    else
      v_title := coalesce(nullif(btrim(coalesce(g.title, '')), ''), (select title from topics where id = g.target_topic_id), 'Suggestion');
      v_scope := coalesce(p_scope_id, (10 + coalesce(g.pillar_id, (select pillar_id from topics where id = g.target_topic_id)))::smallint);
      if not exists (select 1 from tsk_scopes where scope_id = v_scope and ribbon = 'backoffice') then raise exception 'Choose a backoffice scope for the task.'; end if;
      -- what was sensitive on the Board stays sensitive here: a topic that was not carried over, or whose task is archived
      v_sens := coalesce((select tp.sensitive from topics tp where tp.id = g.target_topic_id), false)
                or exists (select 1 from tsk_tasks t where t.source_topic_id = g.target_topic_id and t.sensitive);
      insert into tsk_tasks(scope_id, title, notes, owner, sensitive, created_by) values (v_scope, left(v_title, 200), nullif(left(v_body, 8000), ''), p_user, v_sens, p_user) returning task_id into v_task;
      insert into tsk_log(task_id, action, actor, payload) values (v_task, 'created', p_user, jsonb_build_object('suggestion', g.id));
    end if;
  end if;
  update suggestions set state = case when coalesce(p_accept, false) then 'accepted' else 'dismissed' end, decided_by = p_user, decided_at = now() where id = g.id;
  return jsonb_build_object('task_id', v_task, 'left', (select count(*) from suggestions where state = 'pending'));
end $$;
revoke execute on function public.tsk_inbox_decide(text, uuid, boolean, smallint) from public, anon, authenticated;

-- -------------------------------------------------------------- the carry-over
-- Copies the Board's live topics in as backoffice tasks. Run once on the day of the move; running it again adds only
-- topics not yet carried. Decided, done and parked topics stay in the Board.
--   not_started → todo · in_progress → in_progress · blocked / needs_decision → waiting (the Board's word kept as a comment)
-- The topic's next step becomes the first comment. Its week-by-week history stays in the Board.
create function public.tsk_carry_over(p_actor text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_task uuid; n integer := 0;
begin
  for r in select tp.* from topics tp where not tp.archived and tp.status in ('not_started', 'in_progress', 'blocked', 'needs_decision')
             and not exists (select 1 from tsk_tasks t where t.source_topic_id = tp.id) order by tp.pillar_id, tp.sort_order, tp.created_at loop
    insert into tsk_tasks(scope_id, title, notes, owner, helper, due_on, priority, status, sensitive, source_topic_id, created_by)
    values ((10 + r.pillar_id)::smallint, left(r.title, 200), nullif(left(btrim(coalesce(r.detail, '')), 8000), ''),
            nullif(btrim(coalesce(r.owner, '')), ''), nullif(left(btrim(coalesce(r.supporting, '')), 80), ''), r.due_date,
            case when r.priority = 'high' then 'high' else 'normal' end,
            case r.status when 'not_started' then 'todo' when 'in_progress' then 'in_progress' else 'waiting' end,
            coalesce(r.sensitive, false), r.id, p_actor)
    returning task_id into v_task;
    if r.status in ('blocked', 'needs_decision') then
      insert into tsk_comments(task_id, body, author) values (v_task, 'On the Weekly Board this was "' || case r.status when 'blocked' then 'Blocked' else 'Needs decision' end || '".', p_actor);
    end if;
    if nullif(btrim(coalesce(r.next_step, '')), '') is not null then
      insert into tsk_comments(task_id, body, author) values (v_task, 'Next step: ' || left(btrim(r.next_step), 3900), p_actor);
    end if;
    insert into tsk_log(task_id, action, actor, payload) values (v_task, 'carried_over', p_actor, jsonb_build_object('topic', r.id));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.tsk_carry_over(text) from public, anon, authenticated;
