-- Single sign-in on the home page.
--
-- hub-api issues one session per sign-in that every tool's API accepts (editor_sessions.shared, with every tool's flag
-- on). The flags only say which API may be asked; what the person may do is decided, as before, by each API reading
-- that person's rights in board_users on every request. So a right taken away, or a person switched off, takes effect
-- at once, and a shared session gives nobody anything their rights do not.
--
-- The login log keeps its meaning: one line is one person opening one tool. A shared session is not a tool, so the
-- session trigger skips it, and hub_open() writes the line when a tool is opened with it.

alter table public.editor_sessions add column if not exists shared boolean not null default false;

create or replace function public.usage_log_session() returns trigger
language plpgsql security definer set search_path = public as $$
declare t timestamptz := coalesce(new.created_at, now()); v_ip text := new.ip;
begin
  if new.shared then return new; end if;          -- tool opens are logged by hub_open()
  begin
    if v_ip is null then
      select min(a.ip) into v_ip from auth_attempts a where a.ok and a.created_at between t - interval '15 seconds' and t
      having count(*) = 1;
    end if;
    insert into usage_logins (at, who, tool, ip, is_test, source)
    values (t, new.display_name, usage_tool_of(new), v_ip, new.display_name ilike 'Claude%', 'live');
  exception when others then
    raise warning 'usage_log_session: % (session still issued)', sqlerrm;
  end;
  return new;
end $$;
revoke execute on function public.usage_log_session() from public, anon, authenticated;

-- Which tools a person may open, by the same rule each tool's API applies at its door. A person who is switched off,
-- or unknown, gets null.
create or replace function public.hub_tools(p_name text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'sales', b.can_view_sales or b.can_post_sales,
    'stock', b.can_view_stock,
    'crm', b.can_view_crm,
    'catalogue', b.can_view_catalogue,
    'tasks', b.can_use_floor_tasks or b.can_use_backoffice_tasks,
    'perf', b.can_view_performance,
    'access', b.can_manage_access,
    'crm_edit', b.can_view_crm and b.can_edit_crm,
    'catalogue_manage', b.can_view_catalogue and b.can_manage_catalogue)
  from board_users b where b.name = p_name and b.active
$$;
revoke execute on function public.hub_tools(text) from public, anon, authenticated;

-- A tool was opened with a shared session: one log line, unless the same person opened the same tool within the hour
-- (a reload or a second tab is not another visit). → whether the person may open that tool.
create or replace function public.hub_open(p_name text, p_tool text, p_ip text default null) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare t jsonb := hub_tools(p_name);
begin
  if p_tool is null or p_tool not in ('sales', 'stock', 'crm', 'catalogue', 'tasks', 'perf', 'access') then
    raise exception 'That is not a tool.';
  end if;
  if t is null or not coalesce((t->>p_tool)::boolean, false) then return false; end if;
  if not exists (select 1 from usage_logins u where u.who = p_name and u.tool = p_tool and u.at > now() - interval '1 hour') then
    insert into usage_logins (at, who, tool, ip, is_test, source)
    values (now(), p_name, p_tool, nullif(p_ip, 'unknown'), p_name ilike 'Claude%', 'live');
  end if;
  return true;
end $$;
revoke execute on function public.hub_open(text, text, text) from public, anon, authenticated;
