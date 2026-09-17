# Data Migrations

Durable persisted-data rewrites live here. Schema shape remains Prisma-owned;
this directory is only for data backfills, persisted href rewrites, and similar
state changes that must run once per shared environment.

## Release Train Assignment

Root `VERSION` is the open deployable release train. Multiple compatible schema
and data PRs may share it; do not bump it for each migration. A migration added
before promotion uses the open train version in its directory, `id`, and
`releaseVersion`. Once that train reaches `main`, its migration set is
immutable. Fixes use a new idempotent migration in the next train. Follow
[`docs/runbooks/release-train-versioning.md`](../../docs/runbooks/release-train-versioning.md).

An approved hard cutover may make a promoted migration incompatible with the
current Prisma client. Keep its source file unchanged and move its executable
registration to `retired.json`. The entry records the exact source SHA-256,
the promoted baseline commit, and every active replacement migration. Retired
entries appear separately in `data:migrate -- status`; `data:migrate -- up`
never selects them and never fabricates an application ledger row for them.

## Layout

```text
scripts/data-migrations/
  v<VERSION>/
    001_<name>.ts
    002_<name>.ts
  helpers/
  index.ts
  retired.json
  types.ts
```

`VERSION` is the root app release version. Package-local `version` fields are
not release boundaries. Each migration exports a `DataMigration` with:

- `id`: `v<VERSION>:<sequence>_<name>`
- `releaseVersion`: the same root `VERSION` without `v`
- `name`: human-readable purpose
- `phase`: optional `pre-schema` or `post-schema`; omitted migrations default to
  `post-schema`.
- `run(tx, context)`: idempotent Prisma transaction body. `context.target` is
  the already validated CLI target (`local` or `office`), so a
  migration never has to infer its target from ambient environment variables.

The runner records each execution in `data_migration_runs` with git SHA,
Prisma schema hash, affected rows, details, and failure text.

Run:

```bash
npm run data:migrate -- status
npm run data:migrate -- up --target local --confirm APPLY_DATA_MIGRATIONS
npm run data:migrate -- up --target office --confirm APPLY_DATA_MIGRATIONS
```

Mutating `local` and `office` runs require the
`APPLY_DATA_MIGRATIONS` confirmation. Both targets reject database URLs whose
host or path looks like an unrelated production database. Office migrations
run from the protected Office release workflow against the Office-local
PostgreSQL instance.

Release `0.1.8` is a schema-only database rebuild. It deliberately has no data
migration: legacy product, inventory, option, and identity-map rows are not
read or transformed. The guarded reset creates the final schema, after which
approved Sellpia and channel sources are replayed through application imports.

## Rows that cannot hold a new required column

When a schema step adds a required column with no database default, `db push`
stops on any table that still has rows. Under the
[data-loss policy](../../docs/runbooks/deployment-architecture.md#data-loss-policy),
a pre-schema migration deletes those rows with
`helpers/required-column-row-cleanup.ts` instead of backfilling them. The
migration declares only `{ table, requiredColumn, reason }` entries with
`defineRequiredColumnCleanups` and runs them with
`removeRowsBlockingRequiredColumns`, as `v0.1.31/014` does:

- A missing table is skipped. A table that already has the column is left
  alone, so a run after `db push` deletes nothing.
- Any other listed table loses all of its rows. `details` reports each table,
  and `affectedRows` is the total.
- The helper refuses a table on `ADR_0010_KEPT_TABLES`, the tables behind
  ADR-0010's keep list, and a list whose deletes would cascade into one of
  them or null a reference in one. Both checks run before any delete.

During an Office cutover, the deployer's survey then stops before `db push`
if a row still blocks it.
