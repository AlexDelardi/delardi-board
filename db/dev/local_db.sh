#!/usr/bin/env bash
# Throw-away local PostgreSQL 16 for SQL tests. Never holds real data.
# Usage: db/dev/local_db.sh start|stop
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=db/dev/env.sh
. "$ROOT/db/dev/env.sh"

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root (the cluster runs as user $PGUSER_OS)" >&2
  exit 2
fi

as_pgdev() {  # run a command as the OS user pgdev (postgres refuses to run as root), from /tmp
  (cd /tmp && runuser -u "$PGUSER_OS" -- "$@")
}

stop_cluster() {
  if [ -f "$PGDIR/postmaster.pid" ]; then
    as_pgdev "$PGBIN/pg_ctl" -D "$PGDIR" -m fast -w stop >/dev/null || true
  fi
}

start_cluster() {
  # the last migration in the snapshot; must be a real migration file, else every newer one is misjudged
  local base
  base=$(tr -d '[:space:]' < "$ROOT/db/schema.version")
  if [ -z "$base" ] || [ ! -f "$ROOT/db/migrations/$base" ]; then
    echo "db/schema.version names '$base', which is not a file in db/migrations/" >&2
    exit 1
  fi

  id "$PGUSER_OS" >/dev/null 2>&1 || useradd -m "$PGUSER_OS"
  stop_cluster
  rm -rf "$PGDIR"
  mkdir -p "$PGDIR"
  chown "$PGUSER_OS" "$PGDIR"
  chmod 700 "$PGDIR"
  as_pgdev "$PGBIN/initdb" -D "$PGDIR" -U postgres -A trust >/dev/null
  as_pgdev "$PGBIN/pg_ctl" -D "$PGDIR" -o "-p $PGPORT -k $PGDIR" \
    -l "$PGDIR/server.log" -w start >/dev/null

  "${PSQL_CMD[@]}" -v ON_ERROR_STOP=1 -q <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_admin superuser nologin;
SQL

  # schema.sql: drop psql meta-commands (lines starting with a backslash).
  # Three harmless errors are expected (see whitelist below), so no ON_ERROR_STOP.
  grep -v '^\\' "$ROOT/db/schema.sql" | "${PSQL_CMD[@]}" -q -f - >/dev/null 2>"$PGDIR/schema_load.err" || true

  local unexpected
  unexpected=$(grep 'ERROR:' "$PGDIR/schema_load.err" \
    | grep -v -e 'transaction_timeout' -e 'schema "public" already exists' \
              -e 'schema "extensions" does not exist' || true)
  if [ -n "$unexpected" ]; then
    echo "schema load had unexpected errors:" >&2
    echo "$unexpected" >&2
    exit 1
  fi

  local tables fn1 fn2
  tables=$("${PSQL_CMD[@]}" -Atc "select count(*) from pg_tables where schemaname='public'")
  fn1=$("${PSQL_CMD[@]}" -Atc "select to_regprocedure('public.ops_load_tickets(jsonb,text)') is not null")
  fn2=$("${PSQL_CMD[@]}" -Atc "select to_regprocedure('public.ops_link_crm_tickets(text)') is not null")
  if [ "$tables" -lt 61 ] || [ "$fn1" != "t" ] || [ "$fn2" != "t" ]; then
    echo "schema load check failed: tables=$tables ops_load_tickets=$fn1 ops_link_crm_tickets=$fn2" >&2
    echo "schema_load.err:" >&2
    cat "$PGDIR/schema_load.err" >&2
    exit 1
  fi

  # The snapshot has no rows and no privileges; restore the fake seed the tests need.
  "${PSQL_CMD[@]}" -v ON_ERROR_STOP=1 -q -f "$ROOT/db/dev/snapshot_fixup.sql" >/dev/null

  # Migrations newer than the snapshot named in db/schema.version, in name order.
  local f
  for f in "$ROOT"/db/migrations/*.sql; do
    [ -e "$f" ] || continue
    [[ "$(basename "$f")" > "$base" ]] || continue
    echo "applying ${f#"$ROOT"/}"
    "${PSQL_CMD[@]}" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
  done

  echo "PSQL=\"${PSQL_CMD[*]}\""
}

case "${1:-}" in
  start) start_cluster ;;
  stop)  stop_cluster ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
