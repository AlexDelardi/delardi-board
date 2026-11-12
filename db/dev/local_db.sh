#!/usr/bin/env bash
# Throw-away local PostgreSQL 16 for SQL tests. Never holds real data.
# Usage: db/dev/local_db.sh start|stop
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGBIN=/usr/lib/postgresql/16/bin
PGDIR=/tmp/delardi-pg
PGPORT=5544
PGUSER_OS=pgdev
PSQL_CMD="psql -h $PGDIR -p $PGPORT -U postgres"

as_pgdev() {  # run a command as the OS user pgdev (postgres refuses to run as root)
  if [ "$(id -u)" -eq 0 ]; then runuser -u "$PGUSER_OS" -- "$@"; else "$@"; fi
}

stop_cluster() {
  if [ -f "$PGDIR/postmaster.pid" ]; then
    as_pgdev "$PGBIN/pg_ctl" -D "$PGDIR" -m fast -w stop >/dev/null || true
  fi
}

start_cluster() {
  id "$PGUSER_OS" >/dev/null 2>&1 || useradd -m "$PGUSER_OS"
  stop_cluster
  rm -rf "$PGDIR"
  mkdir -p "$PGDIR"
  chown "$PGUSER_OS" "$PGDIR"
  chmod 700 "$PGDIR"
  as_pgdev "$PGBIN/initdb" -D "$PGDIR" -U postgres -A trust >/dev/null
  as_pgdev "$PGBIN/pg_ctl" -D "$PGDIR" -o "-p $PGPORT -k $PGDIR" \
    -l "$PGDIR/server.log" -w start >/dev/null

  $PSQL_CMD -v ON_ERROR_STOP=1 -q -d postgres <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_admin superuser nologin;
SQL

  # schema.sql: drop psql meta-commands (lines starting with a backslash).
  # Three harmless errors are expected (transaction_timeout, schema "public"
  # already exists, schema "extensions" does not exist), so no ON_ERROR_STOP.
  grep -v '^\\' "$ROOT/db/schema.sql" | $PSQL_CMD -q -d postgres -f - >/dev/null 2>"$PGDIR/schema_load.err" || true

  local tables fn
  tables=$($PSQL_CMD -d postgres -Atc "select count(*) from pg_tables where schemaname='public'")
  fn=$($PSQL_CMD -d postgres -Atc "select to_regprocedure('public.ops_apply_ticket_line(uuid,text)') is not null")
  if [ "$tables" -lt 61 ] || [ "$fn" != "t" ]; then
    echo "schema load check failed: tables=$tables ops_apply_ticket_line_present=$fn" >&2
    cat "$PGDIR/schema_load.err" >&2
    exit 1
  fi

  local f
  for f in "$ROOT"/db/migrations/20261113_s3_*.sql; do
    [ -e "$f" ] || continue
    echo "applying ${f#"$ROOT"/}"
    $PSQL_CMD -v ON_ERROR_STOP=1 -q -d postgres -f "$f" >/dev/null
  done

  echo "PSQL=\"$PSQL_CMD\""
}

case "${1:-}" in
  start) start_cluster ;;
  stop)  stop_cluster ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
