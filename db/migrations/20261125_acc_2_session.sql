-- Access tool: its own kind of session, and its sign-ins named in the login log.
-- access-api issues a session that opens the Access tool only (editor_sessions.can_use_access), as every tool's API does
-- for its own tool. The log files such a sign-in under "access" instead of "other".
alter table public.editor_sessions add column if not exists can_use_access boolean not null default false;

create or replace function public.usage_tool_of(s public.editor_sessions) returns text
language sql immutable set search_path = public as $$
  select case
    when s.can_use_access then 'access'
    when s.can_use_perf then 'perf'
    when s.can_use_stock then 'stock'
    when s.can_use_sales then 'sales'
    when s.can_use_tasks then 'tasks'
    when s.can_view_catalogue then 'catalogue'
    when s.can_view_crm then 'crm'
    when s.can_view_board then 'board'
    else 'other' end
$$;
