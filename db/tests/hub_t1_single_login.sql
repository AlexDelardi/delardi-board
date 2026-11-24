-- Single sign-in: which tools a person may open, the log line for a tool opened with a shared session.
-- Invented fixtures only. Rolled back.
begin;
do $$
declare t jsonb; n int; ok boolean;
begin
  insert into board_users(name, passcode_hash, active, can_view_sales, can_post_sales, can_view_stock, can_manage_stock, can_view_crm, can_edit_crm,
      can_view_catalogue, can_manage_catalogue, can_use_floor_tasks, can_use_backoffice_tasks, can_view_performance, can_manage_access) values
    ('Zz All',  'zz-h1', true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true),
    ('Zz Rep',  'zz-h2', true,  false, true,  false, true,  true,  false, true,  false, false, true,  false, false),
    ('Zz None', 'zz-h3', true,  false, false, false, false, false, true,  false, true,  false, false, false, false),
    ('Zz Gone', 'zz-h4', false, true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true);

  assert not has_function_privilege('anon', 'public.hub_tools(text)', 'execute') and not has_function_privilege('authenticated', 'public.hub_open(text,text,text)', 'execute'), 'closed to the page';

  t := hub_tools('Zz All');
  assert (select bool_and(value::boolean) from jsonb_each_text(t)) and (select count(*) from jsonb_each(t)) = 9, 'every right: every tool';
  t := hub_tools('Zz Rep');
  assert (t->>'sales')::boolean and not (t->>'stock')::boolean and (t->>'crm')::boolean and not (t->>'crm_edit')::boolean and (t->>'catalogue')::boolean
     and not (t->>'catalogue_manage')::boolean and (t->>'tasks')::boolean and not (t->>'perf')::boolean and not (t->>'access')::boolean,
     'selling alone opens Sales; managing stock without seeing it does not open Stock; either task scope opens the tracker';
  t := hub_tools('Zz None');
  assert not (select bool_or(value::boolean) from jsonb_each_text(t)), 'edit or manage without the view right opens nothing';
  assert hub_tools('Zz Gone') is null and hub_tools('Nobody') is null, 'switched off or unknown: null';

  -- a shared session writes no log line of its own; a tool session still does
  insert into editor_sessions(token, display_name, expires_at, shared, can_use_sales, can_use_stock, can_use_perf, can_use_tasks, can_use_access, can_view_crm, can_edit_crm, can_view_catalogue, can_view_board)
    values ('zz-shared-token-000000000000', 'Zz All', now() + interval '8 hours', true, true, true, true, true, true, true, true, true, false);
  assert (select count(*) from usage_logins where who = 'Zz All') = 0, 'a shared session is not a tool visit';
  insert into editor_sessions(token, display_name, expires_at, can_use_perf, can_view_crm, can_edit_crm, can_view_catalogue, can_view_board)
    values ('zz-perf-token-0000000000000', 'Zz All', now() + interval '8 hours', true, false, false, false, false);
  assert (select count(*) from usage_logins where who = 'Zz All' and tool = 'perf') = 1, 'a tool session is still logged';

  -- opening a tool
  assert hub_open('Zz All', 'sales', '10.0.0.1'), 'allowed';
  assert (select count(*) from usage_logins where who = 'Zz All' and tool = 'sales' and ip = '10.0.0.1' and not is_test) = 1, 'one line, with the address';
  assert hub_open('Zz All', 'sales', '10.0.0.1'), 'allowed again';
  assert (select count(*) from usage_logins where who = 'Zz All' and tool = 'sales') = 1, 'again within the hour: no second line';
  update usage_logins set at = now() - interval '61 minutes' where who = 'Zz All' and tool = 'sales';
  assert hub_open('Zz All', 'sales', 'unknown'), 'still allowed';
  assert (select count(*) from usage_logins where who = 'Zz All' and tool = 'sales') = 2
     and (select count(*) from usage_logins where who = 'Zz All' and tool = 'sales' and ip is null) = 1, 'after the hour: a new line; an unknown address is left empty';
  assert hub_open('Zz All', 'stock'), 'another tool';
  assert (select count(*) from usage_logins where who = 'Zz All' and tool = 'stock') = 1, 'is its own line';
  assert not hub_open('Zz Rep', 'stock') and not hub_open('Zz Gone', 'sales') and not hub_open('Nobody', 'sales'), 'no right, switched off, unknown: false';
  assert (select count(*) from usage_logins where who in ('Zz Rep', 'Zz Gone', 'Nobody')) = 0, 'and no line';
  begin perform hub_open('Zz All', 'crm_edit'); ok := false; exception when others then ok := sqlerrm like '%not a tool%'; end;
  assert ok, 'only tools';
  begin perform hub_open('Zz All', null); ok := false; exception when others then ok := sqlerrm like '%not a tool%'; end;
  assert ok, 'a tool must be named';
end $$;
select ' ok' as result;
rollback;
