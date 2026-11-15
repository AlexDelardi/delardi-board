#!/usr/bin/env bash
# Run db/tests/<pattern>*.sql (default pattern: s3_) against the local test DB.
# Usage: db/dev/run_sql_tests.sh [pattern]
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PATTERN="${1:-s3_}"
# shellcheck source=db/dev/env.sh
. "$ROOT/db/dev/env.sh"

cd "$ROOT"
fail=0
shopt -s nullglob
files=(db/tests/"$PATTERN"*.sql)
if [ ${#files[@]} -eq 0 ]; then
  echo "no tests match db/tests/${PATTERN}*.sql"
  exit 1
fi
for f in "${files[@]}"; do
  out=$("${PSQL_CMD[@]}" -v ON_ERROR_STOP=1 -f "$f" 2>&1)
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
