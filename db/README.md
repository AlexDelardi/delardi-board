# Database structure

`schema.sql` is the structure of the live Supabase database (schema `public`):
54 tables, their keys, indexes, views, triggers and 80 functions.
**No data and no keys** — it is a `pg_dump --schema-only` taken on 11 November 2026.

- It is a snapshot, not a migration history. The 76 migrations applied so far
  live in the database itself (`supabase_migrations.schema_migrations`).
- Refresh it after every migration with the same command used for the backups
  (see `S1_Map_Reality_Report_11Nov2026.md` in the Delardi project, §7),
  adding `--schema-only -f schema.sql`, and commit it with the change.
- Full backups (`*.dump`) hold client data and never go into this repository.

The four edge functions now all have their source here:

| Function | Source |
|---|---|
| `board-api` | `board/src/api/index.ts` |
| `crm-api` | `crm/src/api/index.ts` |
| `crm-import` | `crm/src/import-api/index.ts` |
| `catalogue-api` | `catalogue/src/api/index.ts` + `filter-v2.ts` |
