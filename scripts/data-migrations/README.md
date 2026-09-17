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
  helpers/
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

## Rows a schema step cannot take

Under the
[data-loss policy](../../docs/runbooks/deployment-architecture.md#data-loss-policy),
a pre-schema migration deletes rows that would stop `db push`, or that the new
release cannot read, instead of backfilling them. Two declarative helpers do
the work on one shared engine, `helpers/dependent-row-removal.ts`;
`v0.1.31/014` uses both.

### Rows that depend on a removed row

An entry may declare `dependents`: every foreign key into a table it deletes
from, in execution order, as `{ action, table, column, references }`.

- `delete` (with `kind`: `collected`, `derived`, or `human-entered`) removes
  the rows that point at a removed row first; a step on its own table follows
  the chain to its end.
- `unlink` (with optional `alsoClear`) clears the pointer and keeps the row.
- `keep` refuses the removal while a row points at a removed row.

A step whose foreign key the database does not have is skipped, and a foreign
key into a deleted table that no step declares stops the run before any
change. `ADR_0010_KEPT_TABLES`, the tables behind ADR-0010's keep list, are
never deleted: a step on one may only `unlink` or `keep`. An entry that deletes
`human-entered` rows must carry `ownerApproval`: `'pending'` stops the
migration before its first statement, and `{ by, at, scope }` records the
owner's approval. Scripts record the approver's role; the Linear issue records
the name.

### Rows that cannot hold a new required column

When a schema step adds a required column with no database default, `db push`
stops on any table that still has rows. A migration declares
`{ table, requiredColumn, reason, dependents?, ownerApproval? }` entries with
`defineRequiredColumnCleanups` and runs them with
`removeRowsBlockingRequiredColumns` from `helpers/required-column-row-cleanup.ts`:

- A missing table is skipped. A table that already has the column is left
  alone, so a run after `db push` deletes nothing.
- Any other listed table loses all of its rows, after its dependents.
  `details` reports each table with `dependentRows` and `unlinkedRows`, and
  `affectedRows` is the total.
- The helper also refuses a listed table on `ADR_0010_KEPT_TABLES`, and a list
  whose deletes would cascade into a kept table or null a reference in one.

### Rows that duplicate a new unique key

When a schema step adds a unique index over columns a table already has,
`db push` stops on existing duplicates. A migration declares
`{ table, index, columns, where, neutralize?, reason, dependents?, ownerApproval? }`
entries with `defineUniqueKeyCleanups` and runs them with
`removeRowsBlockingUniqueKeys` from `helpers/unique-key-row-cleanup.ts`.
`where` spells the partial-index predicate as `equals` and `isNotNull` terms,
in the schema's order:

- A missing table, or an index that already exists, is skipped. A key,
  predicate, or `created_at` column the table lacks stops the run.
- Among rows the index would cover, the newest `created_at` (then the highest
  `id`) of each key stays. Every other row goes with its dependents.
- When those dependents reach a kept row, `neutralize` sets a predicate
  column to a value that takes the row out of the index instead. Without it,
  kept rows are unlinked, and a kept row that cannot be unlinked stops the run.
- A key whose column arrives with the schema step needs no entry: without a
  database default the column is NULL on old rows, which never collide. With a
  default, evaluate the predicate as the default would; `v0.1.31/014` records
  each such key and why it needs no entry in `UNIQUE_KEYS_WITHOUT_CLEANUP`.

During an Office cutover, the deployer's survey then stops before `db push`
if a row still blocks it.

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
