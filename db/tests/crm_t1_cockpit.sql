-- CRM cockpit: one rep's dates, people to contact, purchases to follow up and open requests.
-- Invented fixtures only. Rolled back.
begin;
do $$
declare
  d jsonb; t date := date '2031-06-15'; x jsonb;
begin
  insert into crm_sales_reps(id, source_name, label, active) values (9901, 'ZZ ANN SRC', 'Zz Ann', true), (9902, 'ZZ BOB SRC', 'Zz Bob', true);
  insert into crm_clients(client_id, record_type, name_confirmed, client_owner, assigned_owner, lifetime_spend_uzs, dob_confirmed, dob_colibri, do_not_contact, last_purchase_at) values
    ('ZZC-1', 'client', 'Zz One',   'ZZ ANN SRC', null,         50000000, date '1990-06-20', null, false, t - 3),
    ('ZZC-2', 'client', 'Zz Two',   'ZZ ANN SRC', null,         90000000, null, null, false, t - 20),
    ('ZZC-3', 'client', 'Zz Three', 'ZZ ANN SRC', null,         70000000, null, date '1985-07-01', false, t - 16),
    ('ZZC-4', 'client', 'Zz Four',  'ZZ ANN SRC', null,         10000000, null, null, true,  null),
    ('ZZC-5', 'client', 'Zz Five',  'ZZ BOB SRC', null,         99000000, date '1991-06-16', null, false, null),
    ('ZZC-6', 'client', 'Zz Six',   'ZZ BOB SRC', 'ZZ ANN SRC', 20000000, null, null, false, null),
    ('ZZC-7', 'client', 'Zz Seven', 'ZZ ANN SRC', null,          5000000, date '1980-09-09', null, false, null);
  insert into crm_contacts(client_id, contacted_on, by_name, channel, created_by) values
    ('ZZC-2', t - 10, 'Zz Ann', 'call', 'Zz Ann'), ('ZZC-3', t - 300, 'Zz Ann', 'visit', 'Zz Ann'), ('ZZC-7', t - 230, 'Zz Ann', 'call', 'Zz Ann');
  insert into crm_important_dates(client_id, kind, label, month, day, year, created_by) values
    ('ZZC-2', 'anniversary', 'Wedding', 6, 25, 2020, 'Zz Ann'), ('ZZC-3', 'child_birthday', null, 6, 12, null, 'Zz Ann'), ('ZZC-2', 'other', 'Far', 8, 20, null, 'Zz Ann');
  insert into crm_transactions(client_id, sold_at, brand, item, qty, net_uzs) values
    ('ZZC-1', t - 3, 'Zz', 'Ring', 1, 30000000), ('ZZC-2', t - 20, 'Zz', 'Ring', 1, 40000000), ('ZZC-3', t - 16, 'Zz', 'Ring', 2, 25000000), ('ZZC-3', t - 200, 'Zz', 'Old', 1, 1000000);
  insert into crm_missed_demand(telegram_id, client_id, asked_at, kind, brand, excerpt, status, source) values
    ('zz1', 'ZZC-2', t - 5, 'not_in_stock', 'Zz', 'asked for a ring', 'open', 'zz'), ('zz2', 'ZZC-2', t - 6, 'not_in_stock', 'Zz', 'closed one', 'closed', 'zz'), ('zz3', 'ZZC-5', t - 5, 'awaiting', 'Zz', 'other rep', 'open', 'zz');

  -- rights: the API's service role only
  assert not has_function_privilege('anon', 'public.crm_cockpit(text,date,integer)', 'execute')
     and not has_function_privilege('authenticated', 'public.crm_cockpit(text,date,integer)', 'execute'), 'the cockpit is not open to the page directly';

  d := crm_cockpit('zz ann', t);
  assert d->>'rep' = 'Zz Ann' and (d->>'days')::int = 230 and d->>'as_of' = '2031-06-15', 'who and when: ' || (d - 'dates' - 'to_contact' - 'follow_ups' - 'missed')::text;
  -- attached clients: six of Ann's, one of them by assignment; Bob's own client is not hers
  assert (d->'summary'->>'clients')::int = 6 and (d->'summary'->>'spend')::numeric = 245000000, 'her clients and their spend: ' || (d->'summary')::text;
  assert (d->'summary'->>'contacted_30d')::int = 1, 'one contacted in the last 30 days';

  -- dates: a missed one three days ago, a birthday in 5 days, an anniversary in 10, a birthday on file but unconfirmed in 16; nothing beyond 30 days
  assert (select string_agg((z->>'client_id') || ':' || (z->>'kind') || ':' || (z->>'in_days'), ',' order by (z->>'in_days')::int) from jsonb_array_elements(d->'dates') z)
       = 'ZZC-3:child_birthday:-3,ZZC-1:birthday:5,ZZC-2:anniversary:10,ZZC-3:birthday:16', 'the dates in order: ' || (d->'dates')::text;
  x := (select z from jsonb_array_elements(d->'dates') z where z->>'client_id' = 'ZZC-1');
  assert x->>'name' = 'Zz One' and x->>'on' = '2031-06-20' and (x->>'confirmed')::boolean and (x->>'years')::int = 41, 'a confirmed birthday with the age it brings: ' || x::text;
  x := (select z from jsonb_array_elements(d->'dates') z where z->>'kind' = 'anniversary');
  assert x->>'label' = 'Wedding' and (x->>'years')::int = 11, 'an anniversary with its count: ' || x::text;
  assert not ((select z from jsonb_array_elements(d->'dates') z where z->>'client_id' = 'ZZC-3' and z->>'kind' = 'birthday')->>'confirmed')::boolean, 'an unconfirmed birthday says so';
  assert (d->'summary'->>'dates_next_30')::int = 3, 'three dates ahead';

  -- to contact: never approached, or not in 230 days; do-not-contact left out; highest spend first
  assert (select string_agg((z->>'client_id') || ':' || (z->>'reason'), ',' order by ord) from jsonb_array_elements(d->'to_contact') with ordinality as q(z, ord))
       = 'ZZC-3:overdue,ZZC-1:never,ZZC-6:never,ZZC-7:overdue', 'who to contact, by value: ' || (d->'to_contact')::text;
  assert ((select z from jsonb_array_elements(d->'to_contact') z where z->>'client_id' = 'ZZC-3')->>'days_since')::int = 300
     and ((select z from jsonb_array_elements(d->'to_contact') z where z->>'client_id' = 'ZZC-7')->>'days_since')::int = 230, 'days since the last approach; day 230 counts';
  assert (d->'summary'->>'never_contacted')::int = 2 and (d->'summary'->>'overdue')::int = 2 and (d->>'to_contact_total')::int = 4, 'the counts: ' || (d->'summary')::text;
  assert (crm_cockpit('Zz Ann', t, 400)->>'to_contact_total')::int = 2, 'the threshold can be moved';

  -- purchases to follow up: bought recently and not approached since
  assert (select string_agg((z->>'client_id') || ':' || (z->>'stage') || ':' || (z->>'days_since'), ',' order by (z->>'days_since')::int) from jsonb_array_elements(d->'follow_ups') z)
       = 'ZZC-1:two_days:3,ZZC-3:two_weeks:16', 'follow-ups by stage; a client approached since the purchase is not listed: ' || (d->'follow_ups')::text;
  assert ((select z from jsonb_array_elements(d->'follow_ups') z where z->>'client_id' = 'ZZC-3')->>'net')::numeric = 25000000, 'the purchase being followed up';

  -- a message on the day of the purchase is the follow-up; the visit in which it was bought is not
  insert into crm_contacts(client_id, contacted_on, by_name, channel, created_by) values ('ZZC-1', t - 3, 'Zz Ann', 'visit', 'Zz Ann');
  assert (select count(*) from jsonb_array_elements(crm_cockpit('Zz Ann', t)->'follow_ups') z where z->>'client_id' = 'ZZC-1') = 1, 'the purchase visit itself does not close the follow-up';
  insert into crm_contacts(client_id, contacted_on, by_name, channel, created_by) values ('ZZC-1', t - 3, 'Zz Ann', 'telegram', 'Zz Ann');
  assert (select count(*) from jsonb_array_elements(crm_cockpit('Zz Ann', t)->'follow_ups') z where z->>'client_id' = 'ZZC-1') = 0, 'a thank-you sent the same day closes it';

  -- open requests of her clients only
  assert jsonb_array_length(d->'missed') = 1 and d->'missed'->0->>'client_id' = 'ZZC-2' and d->'missed'->0->>'excerpt' = 'asked for a ring', 'open requests: ' || (d->'missed')::text;

  -- another rep, and nobody
  assert (crm_cockpit('Zz Bob', t)->'summary'->>'clients')::int = 1, 'Bob has his own';
  begin perform crm_cockpit('Zz Nobody', t); assert false, 'not reached';
  exception when raise_exception then assert sqlerrm = 'No sales rep with that name.', sqlerrm; end;
  raise notice 'crm_t1_cockpit ok';
end $$;
rollback;
