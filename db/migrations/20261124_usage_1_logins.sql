-- Login log: who signed in, when, and to which tool.
--
-- This migration was applied to production on 24 Nov 2026 (as usage_1_logins) from another working session and never
-- reached the repository. It is written back here from the production definitions on 24 Nov 2026 so the repository and
-- the local test database match production. It is safe to run where it already exists.
--
-- Every tool's API issues a session (editor_sessions) flagged for exactly one tool; a trigger on that insert writes the
-- log line, so no API had to change. The log is never cleared. Test logins (names starting "Claude") are marked.

create table if not exists public.usage_logins (
  id      bigserial primary key,
  at      timestamptz not null,
  who     text not null,
  tool    text not null,
  ip      text,
  is_test boolean not null default false,
  source  text not null default 'live'
);
create index if not exists usage_logins_at on public.usage_logins (at desc);
create index if not exists usage_logins_who on public.usage_logins (who, at desc);
alter table public.usage_logins enable row level security;
revoke all on table public.usage_logins from public, anon, authenticated;
revoke all on sequence public.usage_logins_id_seq from public, anon, authenticated;

create or replace function public.usage_tool_of(s public.editor_sessions) returns text
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
revoke execute on function public.usage_tool_of(public.editor_sessions) from public, anon, authenticated;

create or replace function public.usage_log_session() returns trigger
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
revoke execute on function public.usage_log_session() from public, anon, authenticated;

drop trigger if exists usage_log_session on public.editor_sessions;
create trigger usage_log_session after insert on public.editor_sessions for each row execute function public.usage_log_session();
-- Production also has perf_usage(p_days), a report written for a Performance tab that was never published; it is not
-- reproduced here. The Access tool reads the log through usage_report() (20261125_acc_1_access.sql).
