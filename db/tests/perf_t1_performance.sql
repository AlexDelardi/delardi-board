-- Performance tool: one definition of a sale, the month's figures, the bridge and the incentive estimate.
-- Invented fixtures only, in 2030–2031 so no other test's tickets fall in the periods. Rolled back.
begin;
do $$
declare
  d jsonb; c jsonb; x jsonb; b jsonb; i jsonb; s jsonb; f text;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid; a6 uuid; a7 uuid; t uuid;
  function_list text[] := array['perf_fx(smallint,date)', 'perf_tickets(date,date,smallint)', 'perf_period(date,date,smallint)',
    'perf_bridge(numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric)', 'perf_incentive(date,smallint)', 'perf_month(date,smallint)',
    'perf_span(smallint)', 'perf_save_month(jsonb,text)', 'perf_mark_ticket(uuid,jsonb,text)', 'perf_year(integer,smallint)', 'perf_brands(date,date,smallint)',
    'perf_load_arrivals(jsonb,text)'];
begin
  -- rights: Alex only
  assert (select can_view_performance from board_users where name = 'Alex') and (select count(*) from board_users where can_view_performance) = 1, 'only Alex opens Performance';
  assert ops_has_right('Alex', 'view_performance'), 'the right is readable';
  assert (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'editor_sessions' and column_name = 'can_use_perf') = 1, 'session flag';

  insert into crm_clients(client_id, record_type, name_colibri) values
    ('DLD-9101', 'client', 'Zztest One'), ('DLD-9102', 'client', 'Zztest Two'), ('DLD-9103', 'client', 'Zztest Founder'), ('DLD-9104', 'client', 'Zztest Four');
  insert into cat_models(model_id, article, brand, category, retail_category) values ('ZZ-PERF-W1', 'ZZ-PERF-W1', 'Zz Focus', 'watch', 'Watches'), ('ZZ-PERF-J1', 'ZZ-PERF-J1', 'Zz Brand', 'jewellery', 'Rings');
  insert into perf_basis_rules(kind, pattern, basis) values ('client', 'DLD-9103', 'founder'), ('note', 'zzstaff', 'staff');
  insert into perf_seller_rules(pattern, seller) values ('zzsold bee', 'Zz Bee');

  -- history and last year
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status, seller, client_id) values (1, 'colibri', 'PF-H1', '2030-01-10', 'posted', 'Zz Ann', 'DLD-9101') returning ticket_id into t;
  insert into ops_ticket_lines(ticket_id, line_no, kind, item_name, qty, price_current, net, brand_raw) values (t, 1, 'sale', 'Zz', 1, 10000000, 10000000, 'Zz Brand');
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status, seller, client_id) values (1, 'colibri', 'PF-L1', '2030-10-05', 'posted', 'Zz Ann', 'DLD-9102') returning ticket_id into t;
  insert into ops_ticket_lines(ticket_id, line_no, kind, item_name, qty, price_current, net, brand_raw) values (t, 1, 'sale', 'Zz', 1, 40000000, 40000000, 'Zz Brand');
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status, seller) values (1, 'colibri', 'PF-L2', '2030-10-20', 'posted', 'Zz Ann') returning ticket_id into t;
  insert into ops_ticket_lines(ticket_id, line_no, kind, item_name, qty, price_current, net, brand_raw) values (t, 1, 'sale', 'Zz', 1, 150000000, 150000000, 'Zz Brand');
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status, seller, client_id) values (1, 'colibri', 'PF-M1', '2031-06-01', 'posted', 'Zz Ann', 'DLD-9102') returning ticket_id into t;
  insert into ops_ticket_lines(ticket_id, line_no, kind, item_name, qty, price_current, net, brand_raw) values (t, 1, 'sale', 'Zz', 1, 20000000, 20000000, 'Zz Other');

  -- October 2031
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status, seller, client_id, note) values (1, 'colibri', 'PF-A1', '2031-10-02', 'posted', 'Zz Ann', 'DLD-9101', 'card; ZZSOLD BEE') returning ticket_id into a1;
  insert into ops_ticket_lines(ticket_id, line_no, kind, item_name, qty, price_current, net, brand_raw, model_id) values
    (a1, 1, 'sale', 'Zz ring', 1, 30000000, 30000000, 'Zz Brand', 'ZZ-PERF-J1'), (a1, 2, 'sale', 'Zz watch', 1, 25000000, 20000000, 'Zz Focus', 'ZZ-PERF-W1');
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status, seller, client_id) values (1, 'colibri', 'PF-A2', '2031-10-10', 'posted', 'Zz Ann', 'DLD-9102') returning ticket_id into a2;
  insert into ops_ticket_lines(ticket_id, line_no, kind, item_name, qty, price_current, net, brand_raw) values (a2, 1, 'sale', 'Zz', 1, 130000000, 130000000, 'Zz Other');
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status, seller, client_id) values (1, 'delardi', 'PF-A3', '2031-10-12', 'posted', 'Zz Ann', 'DLD-9104') returning ticket_id into a3;
  insert into ops_ticket_lines(ticket_id, line_no, kind, item_name, qty, price_current, net, brand_raw) values (a3, 1, 'sale', 'Zz', 1, 24000000, 24000000, 'Zz Other');
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status, seller, client_id) values (1, 'colibri', 'PF-A4', '2031-10-15', 'posted', 'Zz Ann', 'DLD-9103') returning ticket_id into a4;
  insert into ops_ticket_lines(ticket_id, line_no, kind, item_name, qty, price_current, net, brand_raw) values (a4, 1, 'sale', 'Zz', 1, 10000000, 5000000, 'Zz Other');
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status, seller, client_id, note) values (1, 'colibri', 'PF-A5', '2031-10-16', 'posted', 'Zz Ann', 'DLD-9104', 'Zzstaff discount') returning ticket_id into a5;
  insert into ops_ticket_lines(ticket_id, line_no, kind, item_name, qty, price_current, net, brand_raw) values (a5, 1, 'sale', 'Zz', 1, 16000000, 8000000, 'Zz Other');
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status, seller) values (1, 'colibri', 'PF-A6', '2031-10-20', 'posted', 'Zz Ann') returning ticket_id into a6;
  insert into ops_ticket_lines(ticket_id, line_no, kind, item_name, qty, price_current, net, brand_raw) values (a6, 1, 'sale', 'Zz', 1, 16000000, 16000000, 'Zz Other');
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status, seller, client_id) values (1, 'colibri', 'PF-A7', '2031-10-25', 'posted', 'Zz Ann', 'DLD-9102') returning ticket_id into a7;
  insert into ops_ticket_lines(ticket_id, line_no, kind, item_name, qty, price_current, net, brand_raw) values (a7, 1, 'refund', 'Zz', 1, 10000000, 10000000, 'Zz Other');
  -- never counted: a training sale and a voided one
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status, seller) values (1, 'training', 'PF-T1', '2031-10-21', 'posted', 'Zz Ann') returning ticket_id into t;
  insert into ops_ticket_lines(ticket_id, line_no, kind, item_name, qty, price_current, net) values (t, 1, 'sale', 'Zz', 1, 99000000, 99000000);
  insert into ops_tickets(store_id, source, ticket_no, sold_at, status, seller, void_reason, voided_by, voided_at) values (1, 'delardi', 'PF-V1', '2031-10-22', 'void', 'Zz Ann', 'test', 'Alex', now()) returning ticket_id into t;
  insert into ops_ticket_lines(ticket_id, line_no, kind, item_name, qty, price_current, net) values (t, 1, 'sale', 'Zz', 1, 77000000, 77000000);

  -- the month without any input: figures, last year, no plan
  d := perf_month('2031-10-15');
  c := d->'cur';
  assert d->>'month' = '2031-10-01' and (d->>'fx')::numeric = 12000 and (d->>'large_from_uzs')::numeric = 120000000, 'month head: ' || (d - 'tickets' - 'trend')::text;
  assert (c->>'net')::numeric = 210000000 and (c->>'gross')::numeric = 215000000 and (c->>'discount_pct')::numeric = 0.0233, 'net, gross, discount: ' || c::text;
  assert (c->>'tickets')::int = 4 and (c->>'units')::int = 4 and (c->>'upt')::numeric = 1.00 and (c->>'atv')::numeric = 52500000 and (c->>'asp')::numeric = 52500000, 'tickets, units, averages: ' || c::text;
  assert (c->>'multi_item_share')::numeric = 0.25 and (c->>'net_usd')::numeric = 17500 and (c->>'clients')::int = 3, 'multi-item, usd, clients: ' || c::text;
  assert c->'large' = '{"tickets":1,"net":130000000}'::jsonb and c->'base' = '{"tickets":3,"net":80000000,"avg":26666667}'::jsonb, 'large and base: ' || c::text;
  assert c->'lifecycle' = '{"new":{"tickets":1,"net":24000000},"returning":{"tickets":1,"net":130000000},"recaptured":{"tickets":1,"net":50000000},"no_record":{"tickets":1,"net":16000000}}'::jsonb,
    'lifecycle: ' || (c->'lifecycle')::text;
  assert c->'excluded' = '{"tickets":2,"net":13000000}'::jsonb, 'excluded: ' || (c->'excluded')::text;
  assert d->'excluded' = '[{"basis":"founder","tickets":1,"net":5000000},{"basis":"staff","tickets":1,"net":8000000}]'::jsonb, 'excluded by basis: ' || (d->'excluded')::text;
  assert (d->'ly'->>'net')::numeric = 190000000 and (d->'ly'->>'tickets')::int = 2 and d->'ly'->'large' = '{"tickets":1,"net":150000000}'::jsonb, 'last year: ' || (d->'ly')::text;
  assert (d->'ytd'->>'net')::numeric = 230000000 and (d->'ytd'->>'tickets')::int = 5 and (d->'ytd_ly'->>'net')::numeric = 200000000 and (d->'ytd_ly'->>'tickets')::int = 3, 'year to date';
  assert d->'plan' = 'null'::jsonb and d->'bridge'->'plan' = 'null'::jsonb and d->'funnel'->'conversion' = 'null'::jsonb and d->'incentive' = 'null'::jsonb, 'no plan, no funnel, no scheme yet';
  assert jsonb_array_length(d->'trend') = 13 and d->'trend'->0->>'month' = '2030-10-01' and (d->'trend'->0->>'net')::numeric = 190000000
     and d->'trend'->12->>'month' = '2031-10-01' and (d->'trend'->12->>'net')::numeric = 210000000 and (d->'trend'->8->>'net')::numeric = 20000000
     and (d->'trend'->5->>'tickets')::int = 0, 'trend: ' || (d->'trend')::text;
  -- every ticket of the month is listed with how it was counted; the training and the voided one are not there
  assert jsonb_array_length(d->'tickets') = 7, 'seven tickets listed: ' || jsonb_array_length(d->'tickets');
  x := d->'tickets'->0;
  assert x->>'ticket_no' = 'PF-A1' and x->>'seller' = 'Zz Bee' and x->>'basis' = 'retail' and x->>'lifecycle' = 'recaptured' and (x->>'days_since')::int = 630
     and (x->>'net')::numeric = 50000000 and (x->>'units')::int = 2 and not (x->>'large')::boolean and not (x->>'marked')::boolean, 'first ticket: ' || x::text;
  assert d->'tickets'->3->>'basis' = 'founder' and d->'tickets'->4->>'basis' = 'staff' and d->'tickets'->3->'lifecycle' = 'null'::jsonb, 'excluded tickets are marked';
  assert (d->'tickets'->6->>'net')::numeric = -10000000 and (d->'tickets'->1->>'large')::boolean and d->'tickets'->1->>'lifecycle' = 'returning', 'refund and large ticket';

  -- the bridge from last year: three parts that add up to the gap
  b := d->'bridge'->'ly';
  assert b = '{"from":190000000,"to":210000000,"tickets":190000000,"mix":-110000000,"size":-60000000}'::jsonb, 'bridge from last year: ' || b::text;
  assert perf_bridge(0, 0, 0, 0, 4, 1, 210, 130) is null, 'no bridge from an empty reference';
  b := perf_bridge(3, 0, 90, 0, 4, 1, 210, 130);
  assert (b->>'tickets')::numeric + (b->>'mix')::numeric + (b->>'size')::numeric = 120, 'a reference without large tickets still adds up: ' || b::text;

  -- inputs: rights, checks, the plan, the funnel
  insert into board_users(name, passcode_hash, can_view_stock, can_manage_stock) values ('PF Other', 'not-a-real-hash-pf', true, true);
  begin perform perf_save_month('{"month":"2031-10-01","plan_uzs":1}', 'PF Other'); assert false, 'someone without the right saved'; exception when raise_exception then null; end;
  begin perform perf_mark_ticket(a6, '{"basis":"trade"}', 'PF Other'); assert false, 'someone without the right marked'; exception when raise_exception then null; end;
  begin perform perf_save_month('{"month":"2031-10-01","plan_uzs":100,"plan_tickets":2,"plan_large_tickets":3}', 'Alex'); assert false, 'more large tickets than tickets'; exception when raise_exception then null; end;
  begin perform perf_save_month('{"month":"2031-10-01","visits":3,"visits_appointment":4}', 'Alex'); assert false, 'more appointments than visits'; exception when raise_exception then null; end;
  begin perform perf_save_month('{"month":"2031-10-01","fx":0}', 'Alex'); assert false, 'a zero rate'; exception when raise_exception then null; end;
  d := perf_save_month('{"month":"2031-10-09","plan_uzs":200000000,"plan_tickets":5,"plan_large_tickets":1,"plan_large_uzs":100000000,"visits":16,"visits_appointment":4,"note":"  first plan ",
    "sellers":[{"seller":"Zz Ann","plan_uzs":150000000,"paid_uzs":1400000},{"seller":" Zz Bee ","plan_uzs":50000000,"commission":false},{"seller":"  "}]}', 'Alex');
  assert d->'plan' = '{"plan":200000000,"attainment":1.0500,"gap":10000000}'::jsonb, 'plan: ' || (d->'plan')::text;
  assert d->'funnel' = '{"visits":16,"visits_appointment":4,"conversion":0.2500}'::jsonb, 'funnel: ' || (d->'funnel')::text;
  assert d->'inputs'->>'note' = 'first plan' and d->'inputs'->>'updated_by' = 'Alex' and jsonb_array_length(d->'inputs'->'sellers') = 2
     and d->'inputs'->'sellers'->1->>'seller' = 'Zz Bee' and not (d->'inputs'->'sellers'->1->>'commission')::boolean, 'inputs come back: ' || (d->'inputs')::text;
  assert (d->'trend'->12->>'plan')::numeric = 200000000 and (d->'trend'->12->>'conversion')::numeric = 0.25, 'trend carries plan and conversion';
  b := d->'bridge'->'plan';
  assert b = '{"from":200000000,"to":210000000,"tickets":-40000000,"mix":15000000,"size":35000000}'::jsonb, 'bridge from plan: ' || b::text;
  assert (select count(*) from perf_input_log where what = 'month' and ref = '2031-10-01' and actor = 'Alex' and old is null) = 1, 'the save is logged';
  perform perf_save_month('{"month":"2031-10-09","plan_uzs":200000000,"plan_tickets":5,"plan_large_tickets":1,"plan_large_uzs":100000000,"visits":16,"visits_appointment":4,"note":"first plan",
    "sellers":[{"seller":"Zz Ann","plan_uzs":150000000,"paid_uzs":1400000},{"seller":"Zz Bee","plan_uzs":50000000,"commission":false}]}', 'Alex');
  assert (select count(*) from perf_input_log where what = 'month') = 1, 'saving the same again logs nothing';
  -- a typed rate moves the large-ticket line and the USD figure
  d := perf_save_month('{"month":"2031-10-01","plan_uzs":200000000,"plan_tickets":5,"plan_large_tickets":1,"plan_large_uzs":100000000,"visits":16,"visits_appointment":4,"fx":13500,
    "sellers":[{"seller":"Zz Ann","plan_uzs":150000000,"paid_uzs":1400000},{"seller":"Zz Bee","plan_uzs":50000000,"commission":false}]}', 'Alex');
  assert (d->>'fx')::numeric = 13500 and (d->>'large_from_uzs')::numeric = 135000000 and (d->'cur'->'large'->>'tickets')::int = 0 and (d->'cur'->>'net_usd')::numeric = 15555.56, 'rate: ' || (d->'cur')::text;
  d := perf_save_month('{"month":"2031-10-01","plan_uzs":200000000,"plan_tickets":5,"plan_large_tickets":1,"plan_large_uzs":100000000,"visits":16,"visits_appointment":4,
    "sellers":[{"seller":"Zz Ann","plan_uzs":150000000,"paid_uzs":1400000},{"seller":"Zz Bee","plan_uzs":50000000,"commission":false}]}', 'Alex');
  assert (d->>'fx')::numeric = 12000 and d->'inputs'->'fx' = 'null'::jsonb, 'clearing the rate goes back to the internal one';

  -- incentive: the scheme in force from the month on
  insert into perf_schemes(valid_from, name, rules) values ('2031-11-01', 'Zz later scheme', '{"bands":[],"programmes":[]}'),
    ('2031-10-01', 'Zz scheme', '{"bands":[{"from":0.8,"rate":0.005},{"from":1.0,"rate":0.008},{"from":1.2,"rate":0.01}],
      "guardrail":[{"from":1.0,"factor":1},{"from":0.9,"factor":0.95},{"from":0.8,"factor":0.9},{"from":0,"factor":0.85}],
      "person_cap":1000000,
      "programmes":[{"key":"two_piece","label":"Two-piece ticket","pays":250000,"max":1,"rule":{"kind":"multi_item"}},
        {"key":"focus","label":"Watch focus","pays":600000,"max":2,"rule":{"kind":"category","category":"watch","exclude_brands":["Zz Skip"]}},
        {"key":"brandx","label":"Brand","pays":300000,"max":1,"rule":{"kind":"brand","brands":["zz brand"]}},
        {"key":"recaptured","label":"Client recaptured","pays":400000,"max":1,"rule":{"kind":"lifecycle","value":"recaptured"}},
        {"key":"newc","label":"New client","pays":200000,"max":1,"rule":{"kind":"lifecycle","value":"new"}}]}');
  i := perf_incentive('2031-10-01');
  assert i->'scheme'->>'name' = 'Zz scheme' and i->'store' = '{"net":210000000,"plan":200000000,"attainment":1.0500,"guardrail":1}'::jsonb, 'scheme and store: ' || (i->'store')::text;
  s := i->'sellers'->0;
  assert s->>'seller' = 'Zz Ann' and (s->>'net')::numeric = 160000000 and (s->>'tickets')::int = 3 and (s->>'attainment')::numeric = 1.0667 and (s->>'rate')::numeric = 0.008
     and (s->>'commission')::numeric = 1280000 and (s->>'programmes_total')::numeric = 200000 and (s->>'total')::numeric = 1480000 and (s->>'paid')::numeric = 1400000, 'first seller: ' || s::text;
  s := i->'sellers'->1;
  assert s->>'seller' = 'Zz Bee' and (s->>'net')::numeric = 50000000 and not (s->>'commission_applies')::boolean and (s->>'commission')::numeric = 0
     and (s->>'programmes_before_cap')::numeric = 1550000 and (s->>'programmes_total')::numeric = 1000000 and (s->>'total')::numeric = 1000000, 'second seller: ' || s::text;
  assert (select jsonb_agg((p->>'key') || ':' || (p->>'auto') || ':' || (p->>'amount')) from jsonb_array_elements(s->'programmes') p)
       = '["two_piece:1:250000","focus:1:600000","brandx:1:300000","recaptured:1:400000","newc:0:0"]'::jsonb, 'programme counts: ' || (s->'programmes')::text;
  assert i->'total' = '{"commission":1280000,"programmes":1200000,"total":2480000,"pct_of_sales":0.0118,"paid":1400000}'::jsonb, 'incentive total: ' || (i->'total')::text;
  -- a count typed by hand replaces the automatic one; the cap on pieces still holds
  d := perf_save_month('{"month":"2031-10-01","plan_uzs":200000000,"plan_tickets":5,"plan_large_tickets":1,"plan_large_uzs":100000000,"visits":16,"visits_appointment":4,
    "sellers":[{"seller":"Zz Ann","plan_uzs":150000000},{"seller":"Zz Bee","plan_uzs":50000000,"commission":false,"programme_counts":{"focus":0,"brandx":5,"newc":null,"bad":"x"}}]}', 'Alex');
  s := d->'incentive'->'sellers'->1;
  assert (s->>'programmes_before_cap')::numeric = 950000 and (s->'programmes'->1->>'count')::int = 0 and (s->'programmes'->1->>'overridden')::boolean
     and (s->'programmes'->2->>'paid_count')::int = 1 and not (s->'programmes'->4->>'overridden')::boolean, 'override: ' || s::text;
  -- the store below plan cuts commission, never programmes; a seller below 80% of plan earns none
  d := perf_save_month('{"month":"2031-10-01","plan_uzs":250000000,"sellers":[{"seller":"Zz Ann","plan_uzs":150000000},{"seller":"Zz Bee","plan_uzs":70000000}]}', 'Alex');
  i := d->'incentive';
  assert (i->'store'->>'guardrail')::numeric = 0.9 and (i->'sellers'->0->>'commission')::numeric = 1152000 and (i->'sellers'->0->>'programmes_total')::numeric = 200000
     and (i->'sellers'->1->>'rate')::numeric = 0 and (i->'sellers'->1->>'commission')::numeric = 0, 'guardrail and bands: ' || i::text;
  assert d->'bridge'->'plan' = 'null'::jsonb and (d->'plan'->>'attainment')::numeric = 0.84, 'a plan without tickets has attainment but no bridge';
  assert perf_incentive('2031-09-01') is null, 'no scheme before its first month';
  -- a piece sold and returned in the month earns no programme payout, and a count never goes below zero
  begin
    insert into ops_tickets(store_id, source, ticket_no, sold_at, status, seller) values (1, 'colibri', 'PF-A8', '2031-10-27', 'posted', 'Zz Bee') returning ticket_id into t;
    insert into ops_ticket_lines(ticket_id, line_no, kind, item_name, qty, price_current, net, brand_raw, model_id) values
      (t, 1, 'refund', 'Zz', 1, 1, 1, 'Zz Focus', 'ZZ-PERF-W1'), (t, 2, 'refund', 'Zz', 1, 1, 1, 'Zz Focus', 'ZZ-PERF-W1'), (t, 3, 'refund', 'Zz', 5, 1, 1, 'Zz Brand', 'ZZ-PERF-J1');
    i := perf_incentive('2031-10-01');
    assert (select (pg->>'auto')::int from jsonb_array_elements(i->'sellers') sl, jsonb_array_elements(sl->'programmes') pg where sl->>'seller' = 'Zz Bee' and pg->>'key' = 'focus') = 0,
      'a returned watch is taken off the count, never below zero: ' || (i->'sellers')::text;
    assert (select (pg->>'auto')::int from jsonb_array_elements(i->'sellers') sl, jsonb_array_elements(sl->'programmes') pg where sl->>'seller' = 'Zz Bee' and pg->>'key' = 'brandx') = 0, 'a returned brand piece is taken off the count';
    raise exception 'undo';
  exception when raise_exception then if sqlerrm <> 'undo' then raise; end if; end;

  -- corrections by hand: basis, seller, client; and taking them back
  perform perf_mark_ticket(a6, '{"basis":"trade","note":"wholesale"}', 'Alex');
  d := perf_month('2031-10-01');
  assert (d->'cur'->>'net')::numeric = 194000000 and (d->'cur'->>'tickets')::int = 3 and d->'tickets'->5->>'basis' = 'trade' and d->'tickets'->5->>'basis_by' = 'mark'
     and (d->'tickets'->5->>'marked')::boolean and d->'tickets'->5->'mark' = '{"basis":"trade","seller":null,"client_id":null,"note":"wholesale"}'::jsonb
     and d->'tickets'->0->'mark' = 'null'::jsonb, 'marked off the retail basis: ' || (d->'tickets'->5)::text;
  perform perf_mark_ticket(a4, '{"basis":"retail"}', 'Alex');
  assert (perf_month('2031-10-01')->'cur'->>'net')::numeric = 199000000, 'a mark can put a ticket back on the retail basis';
  perform perf_mark_ticket(a4, '{}', 'Alex');
  perform perf_mark_ticket(a6, '{"seller":"Zz Bee","client_id":"dld-9104"}', 'Alex');
  d := perf_month('2031-10-01');
  assert (d->'cur'->>'net')::numeric = 210000000 and d->'tickets'->5->>'seller' = 'Zz Bee' and d->'tickets'->5->>'client_id' = 'DLD-9104' and d->'tickets'->5->>'lifecycle' = 'returning'
     and (d->'tickets'->5->>'days_since')::int = 8 and (d->'cur'->'lifecycle'->'no_record'->>'tickets')::int = 0, 'seller and client corrected: ' || (d->'tickets'->5)::text;
  assert d->'tickets'->5->>'client' = 'Zztest Four', 'a corrected client shows under the corrected name: ' || (d->'tickets'->5)::text;
  begin perform perf_mark_ticket(a6, '{"client_id":"DLD-0000-NOPE"}', 'Alex'); assert false, 'an unknown client'; exception when raise_exception then null; end;
  begin perform perf_mark_ticket(a6, '{"basis":"gift"}', 'Alex'); assert false, 'an unknown basis'; exception when raise_exception then null; end;
  begin perform perf_mark_ticket(gen_random_uuid(), '{"basis":"trade"}', 'Alex'); assert false, 'an unknown ticket'; exception when raise_exception then null; end;
  perform perf_mark_ticket(a6, '{}', 'Alex');
  assert not exists (select 1 from perf_ticket_marks) and (select count(*) from perf_input_log where what = 'ticket') = 5, 'marks removed, every change logged';

  assert perf_span() ->> 'last' >= '2031-10-01', 'span: ' || perf_span()::text;

  -- closed to the API roles
  foreach f in array function_list loop
    assert not has_function_privilege('anon', 'public.' || f, 'execute') and not has_function_privilege('authenticated', 'public.' || f, 'execute'), f || ' is open';
  end loop;
  foreach f in array array['perf_basis_rules', 'perf_seller_rules', 'perf_ticket_marks', 'perf_months', 'perf_seller_months', 'perf_schemes', 'perf_input_log'] loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || f)::regclass), f || ' has no RLS';
    assert not has_table_privilege('anon', 'public.' || f, 'select') and not has_table_privilege('authenticated', 'public.' || f, 'select'), f || ' is readable';
  end loop;
  raise notice 'perf_t1 ok';

  -- ---- the year
  d := perf_year(2031);
  assert jsonb_array_length(d->'months') = 12 and d->>'through' = '2031-10-01' and not (d->>'complete')::boolean, 'twelve months, to date through October: ' || (d - 'months')::text;
  assert (d->'cur'->>'net')::numeric = (perf_period('2031-01-01', '2031-11-01')->>'net')::numeric
     and (d->'ly'->>'net')::numeric = (perf_period('2030-01-01', '2030-11-01')->>'net')::numeric, 'year to date and the same months last year';
  assert (d->'months'->9->>'net')::numeric = (perf_period('2031-10-01', '2031-11-01')->>'net')::numeric and (d->'months'->9->>'ly_net')::numeric = 190000000
     and (d->'months'->9->>'in_period')::boolean and not (d->'months'->10->>'in_period')::boolean and (d->'months'->5->>'net')::numeric = 20000000, 'months carry their own figures and last year''s: ' || (d->'months'->9)::text;
  assert (d->'plan'->>'to_date')::numeric = (select sum(plan_uzs) from perf_months where month >= '2031-01-01' and month < '2031-11-01')
     and (d->'plan'->>'net_planned_months')::numeric = (select sum((perf_period(month, (month + interval '1 month')::date)->>'net')::numeric) from perf_months where plan_uzs is not null and month >= '2031-01-01' and month < '2031-11-01'),
     'plan to date, and sales of the planned months only: ' || (d->'plan')::text;
  assert ((d->'bridge'->'ly'->>'tickets')::numeric + (d->'bridge'->'ly'->>'mix')::numeric + (d->'bridge'->'ly'->>'size')::numeric) = (d->'cur'->>'net')::numeric - (d->'ly'->>'net')::numeric, 'the year bridge adds up';
  assert (perf_year(2030)->>'through') = '2030-10-01' and (perf_year(2029)->'cur'->>'net')::numeric = 0 and (perf_year(2029)->>'complete')::boolean, 'a year with no tickets is empty and whole';

  -- ---- brands
  b := perf_brands('2031-10-01', '2031-11-01');
  assert (b->'total'->>'net')::numeric = (perf_period('2031-10-01', '2031-11-01')->>'net')::numeric
     and (select sum((x2->>'net')::numeric) from jsonb_array_elements(b->'brands') x2) = (b->'total'->>'net')::numeric, 'brands add up to the month: ' || (b->'total')::text;
  assert b->'brands'->0->>'brand' = 'Zz Other' and (select (x2->>'ly_net')::numeric from jsonb_array_elements(b->'brands') x2 where x2->>'brand' = 'Zz Brand') = 190000000, 'largest brand first, last year beside it: ' || (b->'brands'->0)::text;
  assert (select round(sum((x2->>'share')::numeric), 2) from jsonb_array_elements(b->'brands') x2 where (x2->>'net')::numeric <> 0) = 1.00, 'shares add up';
  -- arrivals: loaded whole, summed by brand and year, shown for the year of the period
  begin perform perf_load_arrivals('{"rows":[{"month":"2031-10","brand":"Zz Brand","units":1}]}', 'Karina'); assert false, 'not reached';
  exception when raise_exception then assert sqlerrm = 'Your account cannot open Performance.', sqlerrm; end;
  assert perf_load_arrivals('{"source":"zz.xlsx","rows":[{"month":"2031-10","brand":"Zz Brand","units":3,"rrp_usd":9000,"sold_units":1,"left_units":2},{"month":"2031-10","brand":"zz brand ","units":2,"rrp_usd":1000,"sold_units":2,"left_units":0},{"month":"2031-03","brand":"Zz Focus","units":7,"rrp_usd":700,"sold_units":0,"left_units":7},{"month":"2030-05","brand":"Zz Other","units":4,"rrp_usd":500,"sold_units":0,"left_units":4}]}', 'Alex') = 3, 'rows are summed by month and brand';
  b := perf_brands('2031-10-01', '2031-11-01');
  assert (select x2->>'arr_units' from jsonb_array_elements(b->'brands') x2 where x2->>'brand' = 'Zz Brand') = '5'
     and (select (x2->>'arr_rrp_usd')::numeric from jsonb_array_elements(b->'brands') x2 where x2->>'brand' = 'Zz Brand') = 10000
     and (select x2->>'arr_units' from jsonb_array_elements(b->'brands') x2 where x2->>'brand' = 'Zz Other') is null
     and (select x2->>'arr_units' from jsonb_array_elements(b->'brands') x2 where x2->>'brand' = 'Zz Focus') is null, 'arrivals of the month on screen only, matched to the brand whatever its spelling';
  assert jsonb_array_length(b->'arrival_years') = 2 and (b->'arrival_years'->0->>'year')::int = 2030 and (b->'arrival_years'->1->>'units')::int = 12 and (b->'total'->>'arr_units')::int = 5, 'arrivals by year';
  assert jsonb_array_length(b->'arrival_months') = 12 and (b->'arrival_months'->2->>'units')::int = 7 and (b->'arrival_months'->9->>'units')::int = 5 and (b->'arrival_months'->0->>'units')::int = 0, 'arrivals month by month through the year';
  assert (select (x2->>'arr_units')::int from jsonb_array_elements(perf_brands('2031-01-01', '2032-01-01')->'brands') x2 where x2->>'brand' = 'Zz Focus') = 7, 'the year takes every month of it';
  assert (b->'on_hand_by_arrival'->>'unknown') is not null and jsonb_typeof(b->'on_hand_by_arrival'->'years') = 'array', 'what is on hand, by arrival year';
end $$;
rollback;
