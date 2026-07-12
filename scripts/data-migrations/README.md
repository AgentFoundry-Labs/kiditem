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
- `phase`: optional `pre-schema` or `post-schema`; omitted migrations default to
  `post-schema`
- `run(tx, context)`: idempotent Prisma transaction body. `context.target` is
  the already validated CLI target (`local`, `staging`, or `production`), so a
  migration never has to infer its target from ambient environment variables.

The runner records each execution in `data_migration_runs` with git SHA,
Prisma schema hash, affected rows, details, and failure text.

Run:

```bash
npm run data:migrate -- status
npm run data:migrate -- up --target local --confirm APPLY_DATA_MIGRATIONS
```

Mutating `local` and `staging` runs require the ordinary
`APPLY_DATA_MIGRATIONS` confirmation and reject database URLs whose host or
path looks like production. A `production` target is accepted only when all of
these independent boundaries hold:

- `GITHUB_ACTIONS=true`;
- `DATA_MIGRATION_CONFIRM=APPLY_DATA_MIGRATIONS`;
- `DATA_MIGRATION_PRODUCTION_CONFIRM=DEPLOY_PRODUCTION`.

Release `0.1.8` normalizes operational channel accounts before the schema push
with `v0.1.8:001_normalize_operational_channel_accounts`, then fills and checks
the additive child account column after the push with
`v0.1.8:002_backfill_channel_sku_accounts`, then normalizes the retired
candidate `promoted` status to `sourced` with
`v0.1.8:003_normalize_promoted_candidate_status`. The first migration resolves
evidence in this fixed order: provider seller/vendor identity, linked listing
option/listing, legacy parent listing, then the sole active platform account.
Ambiguous, missing, or conflicting identity stops the release; exact canonical
duplicates are merged only after incoming foreign keys are repointed.

The repeatable preservation gate remains outside the one-shot ledger. Deploy
workflows run `npm run check:sellpia-cutover-preflight` immediately before each
schema push and pass its marker to the exact 0.1.8 warning checker. The
unshipped blanket 0.1.9 rejection is intentionally absent from the registry;
future 0.1.9 migrations must preserve shared-environment data rather than
rejecting staging or production unconditionally.
