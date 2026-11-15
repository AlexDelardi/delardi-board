# Shared settings for the local test database scripts (sourced, not run).
PGBIN=/usr/lib/postgresql/16/bin
PGDIR=/tmp/delardi-pg
PGPORT=5544
PGUSER_OS=pgdev
PSQL_CMD=(psql -h "$PGDIR" -p "$PGPORT" -U postgres -d postgres -X)
