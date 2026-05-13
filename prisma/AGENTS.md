# prisma — Shared Schema

Prisma schema is the DB source of truth. KidItem uses Prisma v7 multi-file
schema.

## Layout

```text
prisma/
  schema.prisma        generator + datasource only
  migrations/
  models/
    advertising.prisma
    agents.prisma
    ai.prisma
    channels.prisma
    core.prisma
    finance.prisma
    inventory.prisma
    orders.prisma
    sourcing.prisma
    supply.prisma
    system.prisma
```

Each model gets `/// @namespace` and `/// @describe` comments. New models go in
the owning domain file with those comments. `prisma.config.ts` points Prisma at
the `prisma/` directory; do not move datasource URL back into `schema.prisma`.

## Commands

```bash
npm run db:generate
npm run db:push
npm run db:erd
npm run graphify:schema
npm run db:migrate
npm run db:studio
```

Local `DATABASE_URL` default:
`postgresql://kiditem:kiditem@localhost:5433/kiditem`.

## Pulling Code Does Not Update DB

After pulling schema changes:

```bash
git pull
npm install --legacy-peer-deps
npm run db:push -- --accept-data-loss   # only when drops are expected
npx prisma generate
npm run db:erd
npm run graphify:schema
```

`db:push` applies schema. There is no long-lived SQL overlay to replay.

## Development Data

Shared screen/data baselines use Google Drive dev data profiles, not
`init.sql.gz` or synthetic seeds.

```bash
export KIDITEM_DEV_DATA_DRIVE_DIR="$HOME/.../KidItem Dev Data"
export DEV_DEFAULT_USER_ID="<local dev user uuid>"
npm run data:dev:sync -- --profile workspace --yes
```

Rules:

- Bundle archives stay in Google Drive and `.data/`; never commit them.
- `profiles/*.json` and `coupang/latest.json` identify the current dataset and
  checksum.
- Standard replay mode is `scoped-replace`.
- Coupang bundles replay through the real app ingest path
  `POST /api/ads/extension/sync`.
- Synthetic market-data seed writers are forbidden.
- Durable dev-data flows belong in maintained scripts plus
  `docs/DEV_DATA_BUNDLES.md`; machine setup belongs in `docs/runbooks/`.

## `init.sql.gz`

`prisma/init.sql.gz` is only a fresh Docker volume bootstrap snapshot. Existing
volumes ignore it. Regenerate only when a fresh-volume snapshot is explicitly
needed or the existing snapshot breaks fresh setup.

```bash
docker exec kiditem-postgres pg_dump -U kiditem --data-only --column-inserts \
  --no-owner --no-privileges kiditem | gzip > prisma/init.sql.gz
```

Deleting a local volume to apply it destroys local data.

## Schema Rules

- No native PostgreSQL enums. Use `String` plus DTO/Zod/domain validation.
- PascalCase model names, `@@map("snake_case")` table names.
- camelCase fields, `@map("snake_case")` column names.
- UUID primary keys use `@default(uuid()) @db.Uuid`.
- Timestamps use `@db.Timestamptz`.
- KRW is `Int`; CNY/decimal money uses `Decimal(12,2)`.
- JSON is for one-off raw payload preservation only. Child rows used for
  queries, aggregates, or IDOR guards must be normalized.
- FK columns need a leading `@@index([foreignKey])`; Prisma does not create FK
  indexes automatically.
- Optional FKs must declare `onDelete` explicitly.
- Services keep Zod/shared contracts in sync with `satisfies` where useful.

## Organization Boundary

- `Organization` / `organization_id` is the SaaS workspace boundary.
- `OrganizationMembership` is the source of truth for user role and current
  organization. Do not reintroduce `User.organizationId`.
- `LegalEntity` is tax/settlement identity, not a SaaS boundary.
- `ChannelAccount` is marketplace/store account identity, not a SaaS boundary.
- Agent/chat/system users may have no active membership; HTTP domain routes rely
  on backend guards and application-level `organizationId` predicates.

## Integrated Model Contracts

- Agent OS uses code-owned definitions plus organization-owned
  `AgentInstance`, durable `AgentRunRequest`, execution `AgentRun`, runtime
  state, tool policy, authorization, and cost ledgers.
- Queue/dedupe/audit state belongs to `AgentRunRequest`; `AgentRun` is the
  accepted attempt.
- Legacy `AgentDefinition`, `AgentTask`, `HeartbeatRun`,
  `AgentWakeupRequest`, `AgentEvent`, and `AgentLog` models must not return.
- `Marketplace.type` distinguishes `agent` and `workflow`; agent install goes
  through the Agent OS catalog/bootstrap path.

## Partial Unique Indexes

Prisma v7 `partialIndexes` manage active-row uniqueness. Do not add full unique
constraints on the same logical keys.

Current active-row uniqueness includes:

- `master_products(organization_id, legacy_code)`
- `product_options(master_id, option_name)` including null-option case
- `product_options(organization_id, barcode)`
- `product_options(organization_id, legacy_code)`
- `channel_listings(organization_id, channel, external_id)`

Service code should use `findFirst({ where: { ..., isDeleted: false } })`, not
`findUnique(...)` assumptions over these partial keys.

## Barcode Semantics

- `MasterProduct.barcode` is nullable, non-unique source EAN/product code.
- `ProductOption.barcode` is the scanner/option barcode and is partial-unique by
  `(organizationId, barcode)`.
- Baseline import must not write source EAN into `ProductOption.barcode`.
- If a source provides real option barcode data, use a separate import path.

## Prisma-Only Boundary

Schema truth stays in Prisma. Do not maintain long-lived RLS, CHECK constraint,
expression index, or standalone sequence overlays.

- Tenant isolation is enforced by Nest guards plus application/repository
  `organizationId` predicates.
- Agent/chatbot data access goes through backend application services/ports.
- Value constraints use DTO/Zod/domain policy.
- Computed lookup needs should become normal columns/indexes, not JSONB
  expression indexes.

If Supabase direct DB/PostgREST access becomes a product surface, treat RLS as a
separate platform migration with policies, indexes, verification, and runbook.

## Data Migrations

Prisma `db push` changes schema only. Any durable persisted-data rewrite lives
under `scripts/data-migrations/v<app-version>/<sequence>_<name>.ts`, is
executed by `npm run data:migrate`, and records `data_migration_runs` with
migration id, release version, git SHA, Prisma schema hash, affected rows,
details, and failure text. Use root `VERSION` as the app release source of
truth and the directory boundary; package-local `version` fields are not the
deployment version. Do not drop deprecated columns/tables in the same deploy
that first needs their data; ship expand/backfill/contract and remove the
legacy shape only after the ledger confirms the backfill has run in every
shared environment.

## Generated Navigation

After Prisma model or schema-consumer changes:

```bash
npm run db:erd
npm run graphify:schema
```

`docs/ERD.md`, `docs/erd/**`, and `graphify-out/**` are navigation aids only.
Verify important claims against Prisma and source code.
PR review guardrails fail schema changes that omit these generated navigation
artifact updates.
