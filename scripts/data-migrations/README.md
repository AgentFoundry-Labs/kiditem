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
  index.ts
  ledger.ts
  retired.json
  source-identity.ts
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

The runner records each execution in `data_migration_runs` (`ledger.ts`) with
git SHA, Prisma schema hash, affected rows, details, failure text, and the
source it ran. A succeeded id never runs again, and its row is never rewritten.

## Source drift

Each run records the file it executed in `details._runner`:

- `sourcePath`: `scripts/data-migrations/v<VERSION>/<sequence>_<name>.ts`. The
  runner derives it from the id and reads it from its own checkout, not from
  the working directory.
- `sourceSha256`: the SHA-256 of that file after each CRLF becomes LF
  (`hashAlgorithm: "sha256-lf"`), so Windows and LF checkouts agree. For an LF
  file it equals `sha256sum` and the hash `retired.json` records.

`_runner` is reserved: a migration that returns it in its own `details` fails
and is rolled back. Ledger rows written before this record existed stay as they
are.

`data:migrate -- status` adds `runner` (the recorded `_runner`, or `null`) and
`sourceCheck` to every ledger row:

| `sourceCheck` | Meaning |
|---|---|
| `match`, `drift` | The recorded hash equals, or differs from, the current file. |
| `unrecorded-derived-match`, `unrecorded-derived-drift` | No recorded hash; the file at the row's `git_sha` equals, or differs from, the current file. |
| `unrecorded-unknown` | No recorded hash, and this checkout does not have the row's `git_sha`. |
| `retired` | The id is in `retired.json`. |
| `unregistered` | The id is no longer registered. The row is only reported. |

`database.sourceDrift` lists succeeded rows in `drift` or
`unrecorded-derived-drift` with `migrationId`, `sourceCheck`, `sourcePath`,
`ranSourceSha256`, `currentSourceSha256`, and `gitSha`. Failed or interrupted
rows are not listed, because the next `up` runs them again from the current
file.

`data:migrate -- up` checks only the migrations it selected. For each one that
already succeeded from a different recorded source, it warns on stderr, still
skips the migration, lists it in the output's `sourceDrift`, and exits 0. Drift
means an applied migration was edited: restore its source and put the fix in a
new migration id.

`--fail-on-source-drift`, or `DATA_MIGRATION_FAIL_ON_SOURCE_DRIFT=1`, makes
`status` exit 3 on recorded drift and makes `up` stop before its first
migration. Derived drift never changes the exit code. The Office deployer sets
neither.

## Running migrations

Run:

```bash
npm run data:migrate -- status
npm run data:migrate -- status --fail-on-source-drift
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
