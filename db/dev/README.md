# Local test database

A throw-away PostgreSQL 16 cluster for running the SQL tests in `db/tests/`
without touching production. It never holds real data: it is built from
`db/schema.sql` (a snapshot of production) plus any migration newer than that
snapshot, and is deleted and recreated on every start.

Needs PostgreSQL 16 server binaries in `/usr/lib/postgresql/16/bin`. PostgreSQL
refuses to run as root, so the cluster runs as the OS user `pgdev` (created
on first start), so the scripts must be run as root (`local_db.sh` exits 2
otherwise). It lives in `/tmp/delardi-pg`, port 5544, trust auth.

## Snapshot and `db/schema.version`

`db/schema.sql` already contains the migrations up to a certain point.
`db/schema.version` holds the one-line file name of the last migration included
in the snapshot. `start` loads `db/schema.sql`, then applies every
`db/migrations/*.sql` whose file name sorts after that name, in name order
(with `ON_ERROR_STOP=1`). After refreshing `db/schema.sql`, set
`db/schema.version` to the last migration it contains; otherwise `start` fails
re-applying migrations the snapshot already has.

`db/schema.sql` is schema-only (no rows, no GRANT/REVOKE), so `start` also runs
`db/dev/snapshot_fixup.sql` before the migrations: it adds fake seed rows (the
store, Alex with the manage-stock right) and re-applies the production
revokes on `ops_*`. The `s2_t2`-`s2_t5` tests also need production-sized
catalogue and CRM data, so they cannot pass on this database; the `s3_` tests can.

## Commands

```
db/dev/local_db.sh start            # (re)create the cluster, load snapshot + newer migrations
db/dev/local_db.sh stop             # stop it
db/dev/run_sql_tests.sh [pattern]   # run db/tests/<pattern>*.sql (default: s3_)
```

`start` prints the connection command:
`PSQL="psql -h /tmp/delardi-pg -p 5544 -U postgres -d postgres -X"`.

`run_sql_tests.sh` prints `PASS <file>` when a test ends with its `... ok`
result row, otherwise `FAIL <file>` with the error. It exits 1 if any test
failed or if no file matches (`no tests match db/tests/<pattern>*.sql`).

Loading `schema.sql` reports three harmless errors, and `start` whitelists
exactly these: `transaction_timeout`, `schema "public" already exists`,
`schema "extensions" does not exist`. Any other `ERROR:` line in
`schema_load.err` fails the start. It also checks at least 61 public tables and
that `ops_load_tickets(jsonb,text)` and `ops_link_crm_tickets(text)` exist.
