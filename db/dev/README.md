# Local test database

A throw-away PostgreSQL 16 cluster for running the SQL tests in `db/tests/`
without touching production. It never holds real data: it is built from
`db/schema.sql` plus the `db/migrations/20261113_s3_*.sql` files, and is
deleted and recreated on every start.

Needs PostgreSQL 16 server binaries in `/usr/lib/postgresql/16/bin`. PostgreSQL
refuses to run as root, so the cluster runs as the OS user `pgdev` (created
on first start). It lives in `/tmp/delardi-pg`, port 5544, trust auth.

## Commands

```
db/dev/local_db.sh start            # (re)create the cluster, load schema + S3 migrations
db/dev/local_db.sh stop             # stop it
db/dev/run_sql_tests.sh [pattern]   # run db/tests/<pattern>*.sql (default: s3_)
```

`start` prints the connection command:
`PSQL="psql -h /tmp/delardi-pg -p 5544 -U postgres"`.

`run_sql_tests.sh` prints `PASS <file>` when a test ends with its `... ok`
result row, otherwise `FAIL <file>` with the error, and exits 1 if any test failed.

Loading `schema.sql` reports three harmless errors (`transaction_timeout`,
`schema "public" already exists`, `schema "extensions" does not exist`);
`start` checks the result instead (at least 61 public tables and
`ops_apply_ticket_line(uuid,text)` present).
