# Data Migrations

Durable persisted-data rewrites live here. Schema shape remains Prisma-owned;
this directory is only for data backfills, persisted href rewrites, and similar
state changes that must run once per shared environment.

## Release Train Assignment

Root `VERSION` is the open deployable release train. Multiple compatible schema
and data PRs may share it; do not bump it for each migration. A migration added
before promotion uses the open train version in its directory, `id`, and
`releaseVersion`. Once that train reaches `release/office` or `main`, its
migration set is immutable, because Office may already have run it. Fixes use a
new idempotent migration in the next train. Follow
[`docs/runbooks/release-train-versioning.md`](../../docs/runbooks/release-train-versioning.md).

An approved hard cutover may make a promoted migration incompatible with the
current Prisma client. Keep its source file unchanged and move its executable
registration to `retired.json`. The entry records the exact source SHA-256,
the promoted baseline commit, and every active replacement migration. Retired
entries appear separately in `data:migrate -- status`; `data:migrate -- up`
never selects them and never fabricates an application ledger row for them.

A promoted migration that already left the registry without an entry can get
one in a later PR. The release contract guard accepts it only when its release
is at or below the higher `VERSION` of `release/office` and `main` and no base
or candidate registry still runs it; the byte, baseline, and replacement checks
still apply. The baseline may be a commit that only `release/office` contains,
so fetch that branch before running the guard. Registrations removed before
`retired.json` existed (v0.1.0–v0.1.3 and `v0.1.7:002` in #325, `v0.1.21:001`
in #481) are exempt and have no entries.

## Layout

```text
scripts/data-migrations/
  v<VERSION>/
    001_<name>.ts
    002_<name>.ts
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
