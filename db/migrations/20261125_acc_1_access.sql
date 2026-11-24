-- Access: the tool where the Retail Director manages people, their rights and their passcodes, and reads the login log.
--
-- Rights stay what they were: one switch per person on board_users, read live by every tool. This adds
--   · three switches: can_refund_sales (the refund itself is not built yet), can_manage_access, can_view_logins
--   · a role label per person
--   · acc_log: every change made through the tool — who, when, whom, what, old and new value
--   · a copy of each passcode the tool issues, encrypted by access-api before it gets here (passcode_enc), so the
--     holder of can_manage_access can look it up. Sign-in still checks passcode_hash; passcodes set before this tool
--     have no copy and cannot be shown. Every look is logged.
-- A person is switched off, never deleted: their name stays on tickets, tasks and notes. Switching off, and a new
-- passcode, end that person's sessions at once. A name does not change after it is created, for the same reason.
-- Everything here is called by access-api with the service role; nobody else may execute or read it.

alter table public.board_users
  add column if not exists role text check (role is null or length(role) <= 80),
  add column if not exists can_refund_sales boolean not null default false,
  add column if not exists can_manage_access boolean not null default false,
  add column if not exists can_view_logins boolean not null default false,
  add column if not exists passcode_enc text,
  add column if not exists passcode_set_at timestamptz;
comment on column public.board_users.role is 'Job title, a label only: rights are the can_* switches.';
comment on column public.board_users.can_refund_sales is 'Sales: may refund a sale (the refund itself is built later).';
comment on column public.board_users.can_manage_access is 'Access tool: people, rights, passcodes.';
comment on column public.board_users.can_view_logins is 'Access tool: the login log.';
comment on column public.board_users.passcode_enc is 'The passcode as issued by the Access tool, encrypted by access-api (the key is not in the database). Null: set before the tool, cannot be shown.';

create table public.acc_log (
  log_id    bigserial primary key,
  at        timestamptz not null default now(),
  actor     text not null,
  person_id uuid references public.board_users(id),
  person    text not null,
  action    text not null check (action in ('add', 'profile', 'right', 'active', 'passcode', 'passcode_view')),
  field     text,
  old_value text,
  new_value text
);
create index acc_log_at on public.acc_log (at desc);
create index acc_log_person on public.acc_log (person_id, at desc);
alter table public.acc_log enable row level security;
revoke all on table public.acc_log from public, anon, authenticated;
revoke all on sequence public.acc_log_log_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------- who is asking
create function public.acc_me(p_actor text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u board_users%rowtype;
begin
  select * into u from board_users where name = p_actor and active;
  if not found or not u.can_manage_access then raise exception 'This account does not have access to the Access tool.'; end if;
  return jsonb_build_object('name', u.name, 'person_id', u.id, 'logins', u.can_view_logins);
end $$;
revoke execute on function public.acc_me(text) from public, anon, authenticated;

-- The switches the tool manages, in the order the matrix shows them. Nothing else on board_users can be set through it.
create function public.acc_right_keys() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array[
    'can_view_crm', 'can_edit_crm', 'can_view_all_cockpits', 'can_export_crm', 'can_import_crm',
    'can_view_catalogue', 'can_manage_catalogue',
    'can_view_sales', 'can_post_sales', 'can_void_sales', 'can_refund_sales', 'can_manage_till',
    'can_view_stock', 'can_manage_stock', 'can_view_cost',
    'can_view_performance',
    'can_use_floor_tasks', 'can_use_backoffice_tasks', 'can_manage_tasks', 'can_view_sensitive', 'can_view_email_suggestions',
    'can_manage_access', 'can_view_logins', 'can_view_board']
$$;
revoke execute on function public.acc_right_keys() from public, anon, authenticated;

-- One person as the page reads them. Never a passcode in any form: only whether it can be looked up.
create function public.acc_person_json(p_person uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('person_id', u.id, 'name', u.name, 'active', u.active, 'role', u.role, 'rep', u.crm_rep_label,
    'test', u.name ilike 'Claude%' or u.name ilike 'QA %',
    'passcode', case when u.passcode_enc is not null then 'viewable' else 'earlier' end, 'passcode_set_at', u.passcode_set_at,
    'last_login', (select max(l.at) from usage_logins l where l.who = u.name),
    'rights', (select jsonb_object_agg(k, coalesce((to_jsonb(u)->>k)::boolean, false)) from unnest(acc_right_keys()) k))
  from board_users u where u.id = p_person
$$;
revoke execute on function public.acc_person_json(uuid) from public, anon, authenticated;

create function public.acc_snapshot(p_actor text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me jsonb := acc_me(p_actor);
begin
  return jsonb_build_object('me', me, 'rights', to_jsonb(acc_right_keys()),
    'people', coalesce((select jsonb_agg(acc_person_json(u.id) order by u.active desc, u.created_at, u.name) from board_users u), '[]'),
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.at desc, h.log_id desc) from (
        select log_id, at, actor, person_id, person, action, field, old_value, new_value from acc_log order by at desc, log_id desc limit 200) h), '[]'));
end $$;
revoke execute on function public.acc_snapshot(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- rights
create function public.acc_set_right(p_actor text, p_person uuid, p_right text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me jsonb := acc_me(p_actor); u board_users%rowtype; was boolean; v_on boolean := coalesce(p_on, false);
begin
  if p_right is null or not (p_right = any (acc_right_keys())) then raise exception 'That is not a right this tool manages.'; end if;
  select * into u from board_users where id = p_person for update;
  if not found then raise exception 'That person was not found.'; end if;
  if p_right = 'can_manage_access' and not v_on and u.id = (me->>'person_id')::uuid then
    raise exception 'You cannot remove your own access to this tool. Ask for it to be done for you.';
  end if;
  was := coalesce((to_jsonb(u)->>p_right)::boolean, false);
  if was is distinct from v_on then
    execute format('update board_users set %I = $1 where id = $2', p_right) using v_on, p_person;   -- p_right is one of acc_right_keys()
    insert into acc_log(actor, person_id, person, action, field, old_value, new_value) values (p_actor, u.id, u.name, 'right', p_right, was::text, v_on::text);
  end if;
  return acc_person_json(p_person);
end $$;
revoke execute on function public.acc_set_right(text, uuid, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- people
-- Add a person (no person_id; needs a name and a passcode) or change one. Only the keys present in p_person are touched:
--   role, rep (the sales rep name in the CRM), active; on adding also name and copy_from (a person whose rights to start with).
create function public.acc_save_person(p_actor text, p_person jsonb, p_hash text default null, p_enc text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me jsonb := acc_me(p_actor); u board_users%rowtype; v_id uuid; v_name text; v_txt text; v_on boolean; src board_users%rowtype; k text;
begin
  if p_person is null or jsonb_typeof(p_person) <> 'object' then raise exception 'person must be an object.'; end if;
  if not (p_person ? 'person_id') or p_person->>'person_id' is null then
    v_name := btrim(coalesce(p_person->>'name', ''));
    if v_name = '' then raise exception 'Give the person a name.'; end if;
    if length(v_name) > 60 then raise exception 'That name is too long.'; end if;
    if exists (select 1 from board_users where lower(name) = lower(v_name)) then raise exception 'There is already a person with that name.'; end if;
    if coalesce(p_hash, '') = '' or coalesce(p_enc, '') = '' then raise exception 'A new person needs a passcode.'; end if;
    if exists (select 1 from board_users where passcode_hash = p_hash) then raise exception 'That passcode is already in use. Generate another.'; end if;
    -- every switch off, whatever the column defaults are: a new person has only what is given here
    insert into board_users(name, passcode_hash, passcode_enc, passcode_set_at, active, role) values (v_name, p_hash, p_enc, now(), true, nullif(btrim(coalesce(p_person->>'role', '')), ''))
      returning id into v_id;
    foreach k in array acc_right_keys() loop execute format('update board_users set %I = false where id = $1', k) using v_id; end loop;
    insert into acc_log(actor, person_id, person, action, field, new_value) values (p_actor, v_id, v_name, 'add', 'role', nullif(btrim(coalesce(p_person->>'role', '')), ''));
    if p_person ? 'copy_from' and p_person->>'copy_from' is not null then
      select * into src from board_users where id = (p_person->>'copy_from')::uuid;
      if not found then raise exception 'The person to copy rights from was not found.'; end if;
      foreach k in array acc_right_keys() loop
        -- access to this tool is given by hand, never copied
        if k <> 'can_manage_access' and coalesce((to_jsonb(src)->>k)::boolean, false) then
          execute format('update board_users set %I = true where id = $1', k) using v_id;
          insert into acc_log(actor, person_id, person, action, field, old_value, new_value) values (p_actor, v_id, v_name, 'right', k, 'false', 'true');
        end if;
      end loop;
    end if;
    return acc_person_json(v_id);
  end if;

  select * into u from board_users where id = (p_person->>'person_id')::uuid for update;
  if not found then raise exception 'That person was not found.'; end if;
  if p_person ? 'name' and btrim(coalesce(p_person->>'name', '')) is distinct from u.name then
    raise exception 'A name cannot be changed: it is on this person''s tickets, tasks and notes. Switch the person off and add a new one.';
  end if;
  if p_person ? 'role' then
    v_txt := nullif(btrim(coalesce(p_person->>'role', '')), '');
    if length(v_txt) > 80 then raise exception 'That role is too long.'; end if;
    if v_txt is distinct from u.role then
      update board_users set role = v_txt where id = u.id;
      insert into acc_log(actor, person_id, person, action, field, old_value, new_value) values (p_actor, u.id, u.name, 'profile', 'role', u.role, v_txt);
    end if;
  end if;
  if p_person ? 'rep' then
    v_txt := nullif(btrim(coalesce(p_person->>'rep', '')), '');
    if length(v_txt) > 40 then raise exception 'That sales rep name is too long.'; end if;
    if v_txt is distinct from u.crm_rep_label then
      update board_users set crm_rep_label = v_txt where id = u.id;
      insert into acc_log(actor, person_id, person, action, field, old_value, new_value) values (p_actor, u.id, u.name, 'profile', 'rep', u.crm_rep_label, v_txt);
    end if;
  end if;
  if p_person ? 'active' then
    v_on := coalesce((p_person->>'active')::boolean, false);
    if not v_on and u.id = (me->>'person_id')::uuid then raise exception 'You cannot switch yourself off.'; end if;
    if v_on is distinct from u.active then
      update board_users set active = v_on where id = u.id;
      if not v_on then delete from editor_sessions where display_name = u.name; end if;
      insert into acc_log(actor, person_id, person, action, field, old_value, new_value) values (p_actor, u.id, u.name, 'active', 'active', u.active::text, v_on::text);
    end if;
  end if;
  return acc_person_json(u.id);
end $$;
revoke execute on function public.acc_save_person(text, jsonb, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- passcodes
-- p_hash is what sign-in checks; p_enc is the same passcode encrypted by access-api. Neither is ever logged.
create function public.acc_set_passcode(p_actor text, p_person uuid, p_hash text, p_enc text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me jsonb := acc_me(p_actor); u board_users%rowtype;
begin
  if coalesce(p_hash, '') = '' or coalesce(p_enc, '') = '' then raise exception 'A passcode is needed.'; end if;
  select * into u from board_users where id = p_person for update;
  if not found then raise exception 'That person was not found.'; end if;
  if exists (select 1 from board_users where passcode_hash = p_hash and id <> p_person) then raise exception 'That passcode is already in use. Generate another.'; end if;
  update board_users set passcode_hash = p_hash, passcode_enc = p_enc, passcode_set_at = now() where id = p_person;
  delete from editor_sessions where display_name = u.name;
  insert into acc_log(actor, person_id, person, action) values (p_actor, u.id, u.name, 'passcode');
  return acc_person_json(p_person);
end $$;
revoke execute on function public.acc_set_passcode(text, uuid, text, text) from public, anon, authenticated;

-- The encrypted copy, for access-api to decrypt and show. Each call is a look, and is logged.
create function public.acc_passcode(p_actor text, p_person uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare me jsonb := acc_me(p_actor); u board_users%rowtype;
begin
  select * into u from board_users where id = p_person;
  if not found then raise exception 'That person was not found.'; end if;
  if u.passcode_enc is null then raise exception 'This passcode was set earlier and cannot be shown. Issue a new one.'; end if;
  insert into acc_log(actor, person_id, person, action) values (p_actor, u.id, u.name, 'passcode_view');
  return u.passcode_enc;
end $$;
revoke execute on function public.acc_passcode(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- logins
-- A task tracker session is the tracker's (it was filed as "other"), and the lines already filed so are corrected:
-- until now only tracker sessions carried no other tool's flag.
create or replace function public.usage_tool_of(s public.editor_sessions) returns text
language sql immutable set search_path = public as $$
  select case
    when s.can_use_perf then 'perf'
    when s.can_use_stock then 'stock'
    when s.can_use_sales then 'sales'
    when s.can_use_tasks then 'tasks'
    when s.can_view_catalogue then 'catalogue'
    when s.can_view_crm then 'crm'
    when s.can_view_board then 'board'
    else 'other' end
$$;
update public.usage_logins set tool = 'tasks' where tool = 'other' and source = 'live' and at >= timestamptz '2026-11-24 00:00+05';

-- Who used what: per person and tool, per day, and the latest sign-ins. Test logins are left out.
-- (Production also has perf_usage(), written for a Performance tab that was never published. It is left alone here;
-- this is the same report with the retired Board dropped from the tool list and the task tracker added.)
create function public.usage_report(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 7), 365);
  today date := (now() at time zone 'Asia/Tashkent')::date;
  tool_list text[] := array['sales', 'stock', 'crm', 'catalogue', 'tasks', 'perf'];
  doc jsonb;
begin
  with
  log as (
    select u.*, (u.at at time zone 'Asia/Tashkent')::date as day from usage_logins u
     where not u.is_test and u.at >= (today - d + 1)::timestamp at time zone 'Asia/Tashkent'),
  rights as (
    select b.name, b.active, t.tool,
      case t.tool
        when 'crm' then b.can_view_crm
        when 'catalogue' then b.can_view_catalogue
        when 'sales' then b.can_view_sales or b.can_post_sales
        when 'stock' then b.can_view_stock or b.can_manage_stock
        when 'tasks' then b.can_use_floor_tasks or b.can_use_backoffice_tasks
        when 'perf' then b.can_view_performance end as allowed
      from board_users b cross join unnest(tool_list) as t(tool)
     where b.name not ilike 'Claude%'),
  people as (
    select name, bool_or(active) active from (
      select name, active from board_users where active and name not ilike 'Claude%'
      union all select distinct who, false from log) x
    group by name),
  per_tool as (
    select p.name, t.tool,
      coalesce((select bool_and(coalesce(r.allowed, false) and r.active) from rights r where r.name = p.name and r.tool = t.tool), false) as allowed,
      (select count(*) from log l where l.who = p.name and l.tool = t.tool) as logins,
      (select count(distinct l.day) from log l where l.who = p.name and l.tool = t.tool) as days,
      (select max(u.at) from usage_logins u where u.who = p.name and u.tool = t.tool and not u.is_test) as last_at
      from people p cross join unnest(tool_list) as t(tool)),
  person as (
    select p.name, p.active,
      (select count(*) from log l where l.who = p.name and l.day > today - 7) as logins_7,
      (select count(*) from log l where l.who = p.name) as logins_n,
      (select count(distinct l.day) from log l where l.who = p.name and l.day > today - 7) as days_7,
      (select count(distinct l.day) from log l where l.who = p.name) as days_n,
      (select max(u.at) from usage_logins u where u.who = p.name and not u.is_test) as last_at,
      (select u.tool from usage_logins u where u.who = p.name and not u.is_test order by u.at desc, u.id desc limit 1) as last_tool,
      (select jsonb_object_agg(pt.tool, jsonb_build_object('allowed', pt.allowed, 'logins', pt.logins, 'days', pt.days, 'last_at', pt.last_at))
         from per_tool pt where pt.name = p.name) as tools
      from people p)
  select jsonb_build_object(
    'as_of', now(), 'today', today, 'days', d,
    'since', (select min(at) from usage_logins where not is_test),
    'tools', to_jsonb(tool_list),
    'people', coalesce((select jsonb_agg(to_jsonb(x) order by x.active desc, x.last_at desc nulls last, x.name) from person x), '[]'),
    'daily', (select jsonb_agg(jsonb_build_object('day', g.day,
        'logins', (select count(*) from log l where l.day = g.day),
        'people', (select count(distinct l.who) from log l where l.day = g.day)) order by g.day)
      from (select gs::date as day from generate_series((today - d + 1)::timestamp, today::timestamp, interval '1 day') gs) g),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('at', x.at, 'who', x.who, 'tool', x.tool) order by x.at desc, x.id desc)
      from (select id, at, who, tool from usage_logins where not is_test order by at desc, id desc limit 100) x), '[]')
  ) into doc;
  return doc;
end $$;
revoke execute on function public.usage_report(integer) from public, anon, authenticated;

create function public.acc_logins(p_actor text, p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me jsonb := acc_me(p_actor);
begin
  if not (me->>'logins')::boolean then raise exception 'This account does not have access to the login log.'; end if;
  return usage_report(p_days);
end $$;
revoke execute on function public.acc_logins(text, integer) from public, anon, authenticated;
