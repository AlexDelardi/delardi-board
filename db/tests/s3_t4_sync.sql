-- Sprint 3, fix F3: stock sync "missing from export" check skips a piece only when a ticket line holds that piece,
-- not when an old ticket line merely carries the same serial text. Synthetic data only. Rolled back.
begin;
do $$
declare run bigint; p_hist uuid; p_linked uuid; v_tid uuid; r jsonb;
begin
  insert into ops_stores(store_id, code, name)
  select 1, 'S3T-STORE', 'S3T store' where not exists (select 1 from ops_stores where store_id = 1);
  insert into cat_import_runs(source_file, run_at) values ('S3T-run.xlsx', now()) returning id into run;

  -- two live pieces that are not in this catalogue load
  insert into ops_pieces(store_id, brand, serial, state, last_seen_run)
  values (1, 'S3T Brand', 'S3T-SYNC-1', 'in_stock', run) returning piece_id into p_hist;
  insert into ops_pieces(store_id, brand, serial, state, last_seen_run)
  values (1, 'S3T Brand', 'S3T-SYNC-2', 'in_stock', run) returning piece_id into p_linked;

  -- an old sale carrying the first serial as text only, and a line that holds the second piece
  insert into ops_tickets(store_id, source, ticket_no, sold_at)
  values (1, 'colibri', 'S3T-SYNC-T1', date '2023-01-10') returning ticket_id into v_tid;
  insert into ops_ticket_lines(ticket_id, line_no, kind, serial_raw, brand_raw, piece_id) values
    (v_tid, 1, 'sale', ' s3t-sync-1 ', 'S3T Brand', null),
    (v_tid, 2, 'sale', 'S3T-SYNC-2', 'S3T Brand', p_linked);

  r := ops_sync_pieces(run);

  assert exists (select 1 from ops_review where piece_id = p_hist and kind = 'missing_from_export' and status = 'open'),
         'serial only on an old ticket line: piece must be flagged missing_from_export ' || r::text;
  assert not exists (select 1 from ops_review where piece_id = p_linked and kind = 'missing_from_export'),
         'piece held by a ticket line: no missing_from_export review';
end $$;
select 's3_t4_sync ok' as result;
rollback;
