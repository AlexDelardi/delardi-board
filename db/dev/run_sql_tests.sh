#!/usr/bin/env bash
# Run db/tests/<pattern>*.sql (default pattern: s3_) against the local test DB.
# Usage: db/dev/run_sql_tests.sh [pattern]
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PATTERN="${1:-s3_}"
PSQL_CMD=(psql -h /tmp/delardi-pg -p 5544 -U postgres -d postgres -v ON_ERROR_STOP=1 -X)

cd "$ROOT"
fail=0
shopt -s nullglob
for f in db/tests/"$PATTERN"*.sql; do
  out=$("${PSQL_CMD[@]}" -f "$f" 2>&1)
  rc=$?
  if [ $rc -eq 0 ] && grep -q ' ok' <<<"$out"; then
    echo "PASS $f"
  else
    echo "FAIL $f"
    echo "$out"
    fail=1
  fi
done
exit $fail
