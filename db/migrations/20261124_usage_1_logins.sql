-- Usage: who opened which tool, and when (24 Nov 2026).
--
-- Every tool's API issues a session by inserting into editor_sessions, and each session carries exactly one
-- tool's flag. Sessions are cleared when they run out, so they are no history. This keeps one row per login,
-- for good, written by a trigger on that insert: no tool's API had to change, and a tool added later is logged
-- as soon as its flag is named in usage_tool_of().
--
--   usage_logins   one row per login: when, who, which tool, the IP of the passcode attempt that opened it
--   perf_usage()   the Usage screen of the Performance tool: per person, per tool, per day, the latest logins
--
-- The trigger never stands in the way of a login: if writing the row fails, the session is still issued.
-- Test logins (names starting "Claude") are kept but marked, and left out of every figure.

create table if not exists usage_logins (
  id       bigserial primary key,
  at       timestamptz not null,
  who      text not null,
  tool     text not null,
  ip       text,
  is_test  boolean not null default false,
  source   text not null default 'live'        -- 'live' (the trigger) or 'backfill'
);
create index if not exists usage_logins_at on usage_logins (at desc);
create index if not exists usage_logins_who on usage_logins (who, at desc);
alter table usage_logins enable row level security;   -- no policies: server-only, like every other table
revoke all on usage_logins from public, anon, authenticated;
revoke all on sequence usage_logins_id_seq from public, anon, authenticated;

-- The tool a session opens, from the one flag its API set.
create or replace function usage_tool_of(s editor_sessions) returns text
language sql immutable set search_path = public as $$
  select case
    when s.can_use_perf then 'perf'
    when s.can_use_stock then 'stock'
    when s.can_use_sales then 'sales'
    when s.can_view_catalogue then 'catalogue'
    when s.can_view_crm then 'crm'
    when s.can_view_board then 'board'
    else 'other' end
$$;

create or replace function usage_log_session() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into usage_logins (at, who, tool, ip, is_test, source)
    values (
      coalesce(new.created_at, now()), new.display_name, usage_tool_of(new),
      -- the successful passcode attempt the API recorded just before issuing this session
      (select a.ip from auth_attempts a
        where a.ok and a.created_at between coalesce(new.created_at, now()) - interval '15 seconds' and coalesce(new.created_at, now())
        order by a.created_at desc limit 1),
      new.display_name ilike 'Claude%', 'live');
  exception when others then
    raise warning 'usage_log_session: % (session still issued)', sqlerrm;
  end;
  return new;
end $$;
revoke all on function usage_log_session() from public, anon, authenticated;
revoke all on function usage_tool_of(editor_sessions) from public, anon, authenticated;

drop trigger if exists usage_log_session on editor_sessions;
create trigger usage_log_session after insert on editor_sessions
  for each row execute function usage_log_session();

-- What is still on file from before the log existed.
insert into usage_logins (at, who, tool, ip, is_test, source)
select s.created_at, s.display_name, usage_tool_of(s),
       (select a.ip from auth_attempts a where a.ok and a.created_at between s.created_at - interval '15 seconds' and s.created_at
         order by a.created_at desc limit 1),
       s.display_name ilike 'Claude%', 'backfill'
  from editor_sessions s
 where not exists (select 1 from usage_logins u where u.at = s.created_at and u.who = s.display_name);

-- The Usage screen. p_days: the long window (30); the short one is always 7. Days are the boutique's (Tashkent).
create or replace function perf_usage(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 7), 365);
  now_t timestamptz := now();
  today date := (now() at time zone 'Asia/Tashkent')::date;
  tool_list text[] := array['crm','catalogue','sales','stock','board','perf'];
  doc jsonb;
begin
  with
  log as (
    select u.*, (u.at at time zone 'Asia/Tashkent')::date as day from usage_logins u
     where not u.is_test and u.at >= (today - d + 1)::timestamp at time zone 'Asia/Tashkent'),
  rights as (
    select b.name, b.active, t.tool,
      case t.tool
        when 'crm' then coalesce(b.can_view_crm, false)
        when 'catalogue' then coalesce(b.can_view_catalogue, false)
        when 'sales' then coalesce(b.can_view_sales, false) or coalesce(b.can_post_sales, false)
        when 'stock' then coalesce(b.can_view_stock, false) or coalesce(b.can_manage_stock, false)
        when 'board' then coalesce(b.can_view_board, false)
        when 'perf' then coalesce(b.can_view_performance, false) end as allowed
      from board_users b cross join unnest(tool_list) as t(tool)
     where b.name not ilike 'Claude%'),
  people as (
    select name, bool_or(active) active from (
      select name, active from board_users where active and name not ilike 'Claude%'
      union all select distinct who, false from log) x
    group by name),
  per_tool as (
    select p.name, t.tool,
      coalesce((select bool_and(r.allowed and r.active) from rights r where r.name = p.name and r.tool = t.tool), false) as allowed,
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
      (select u.tool from usage_logins u where u.who = p.name and not u.is_test order by u.at desc limit 1) as last_tool,
      (select jsonb_object_agg(pt.tool, jsonb_build_object('allowed', pt.allowed, 'logins', pt.logins, 'days', pt.days, 'last_at', pt.last_at))
         from per_tool pt where pt.name = p.name) as tools
      from people p)
  select jsonb_build_object(
    'as_of', now_t, 'today', today, 'days', d,
    'since', (select min(at) from usage_logins where not is_test),
    'tools', tool_list,
    'people', coalesce((select jsonb_agg(to_jsonb(x) order by x.active desc, x.last_at desc nulls last, x.name) from person x), '[]'),
    'by_tool', (select jsonb_agg(jsonb_build_object(
        'tool', t.tool,
        'allowed', (select count(*) from rights r where r.tool = t.tool and r.allowed and r.active),
        'users', (select count(distinct l.who) from log l where l.tool = t.tool),
        'logins_7', (select count(*) from log l where l.tool = t.tool and l.day > today - 7),
        'logins', (select count(*) from log l where l.tool = t.tool),
        'last_at', (select max(u.at) from usage_logins u where u.tool = t.tool and not u.is_test)) order by t.ord)
      from unnest(tool_list) with ordinality as t(tool, ord)),
    'daily', (select jsonb_agg(jsonb_build_object('day', g.day,
        'logins', (select count(*) from log l where l.day = g.day),
        'people', (select count(distinct l.who) from log l where l.day = g.day)) order by g.day)
      from (select gs::date as day from generate_series((today - d + 1)::timestamp, today::timestamp, interval '1 day') gs) g),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('at', x.at, 'who', x.who, 'tool', x.tool) order by x.at desc)
      from (select at, who, tool from usage_logins where not is_test order by at desc limit 40) x), '[]')
  ) into doc;
  return doc;
end $$;
revoke all on function perf_usage(int) from public, anon, authenticated;
