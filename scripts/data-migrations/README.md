# Data Migrations

Durable persisted-data rewrites live here. Schema shape remains Prisma-owned;
this directory is only for data backfills, persisted href rewrites, and similar
state changes that must run once per shared environment.

## Layout

```text
scripts/data-migrations/
  v<VERSION>/
    001_<name>.ts
    002_<name>.ts
  index.ts
  types.ts
```

`VERSION` is the root app release version. Package-local `version` fields are
not release boundaries. Each migration exports a `DataMigration` with:

- `id`: `v<VERSION>:<sequence>_<name>`
- `releaseVersion`: the same root `VERSION` without `v`
- `name`: human-readable purpose
- `run(tx)`: idempotent Prisma transaction body

The runner records each execution in `data_migration_runs` with git SHA,
Prisma schema hash, affected rows, details, and failure text.

Run:

```bash
npm run data:migrate -- status
npm run data:migrate -- up --target local --confirm APPLY_DATA_MIGRATIONS
```
