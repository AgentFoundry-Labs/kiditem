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
- `run(tx)`: idempotent Prisma transaction body

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

Release `0.1.8` keeps the repeatable channel SKU identity check outside this
one-shot ledger. Deploy workflows run `npm run check:channel-sku-identity`
immediately before every schema push, while
`v0.1.8:001_backfill_channel_sku_accounts` runs once in the default
post-schema phase.
