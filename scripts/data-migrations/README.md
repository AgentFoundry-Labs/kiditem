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
  ensure/
    index.ts
    <step>.ts
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

## Ensure Steps

`ensure/` holds state every database needs, whatever its migration history.
A migration runs once per database and its source then stays fixed; an ensure
step is live code maintained with the schema. `data:migrate -- up` runs every
step after the selected migrations in the `post-schema` and `all` phases,
whatever `--release-version` selects, and runs none in `pre-schema`.

- Each step runs in its own transaction with the migration timeout. It is
  idempotent and reports `affectedRows: 0` when its state is already in place.
  A failure rolls back that step and `up` exits 1; fix the cause, then run the
  same `up` again.
- Results appear only in the `up` output, as `status: "ensured"` entries under
  the step id. `data_migration_runs` records nothing for them, and
  `data:migrate -- status` does not list them.
- `ensure:source_import_run_status_check` owns
  `source_import_runs_status_check` (`helpers/source-import-run-status-check.ts`)
  and creates it wherever v0.1.31:012 has not. It fails while a run holds a
  status outside `SOURCE_IMPORT_RUN_STATUSES`: add a pre-schema cleanup
  migration before changing the set.
- `ensure:absolute_product_abc_formula` gives every organization the current
  absolute ABC formula version and a formula state attached to it, the rows
  v0.1.31:002 writes, under the server's product-mapping and ABC publication
  locks. It keeps a mapping-only state's `mappingGeneration` and never changes
  a state that already names a formula. It fails, naming every such
  organization, when a stored formula with the current key and version has
  another checksum, or when a state without a formula is not mapping-only.
- Scripts that create an organization (`dev:bootstrap-user`,
  `inventory:bootstrap:dev`, `seed:agent-os:browser-qa`) call
  `ensureAbsoluteProductAbcFormulaForOrganization` in the same transaction.
  Moving organizations that already use a formula to a new version needs a
  reviewed data migration.
