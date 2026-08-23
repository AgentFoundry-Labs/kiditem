# prisma — Shared Schema

`prisma/` is the database schema source of truth. KidItem uses Prisma v7
multi-file schema with domain-owned model files.

## Folder Map

```text
prisma/
├── schema.prisma        # generator + datasource only
├── migrations/
└── models/
    ├── advertising.prisma
    ├── agents.prisma
    ├── ai.prisma
    ├── channels.prisma
    ├── core.prisma
    ├── finance.prisma
    ├── inventory.prisma
    ├── orders.prisma
    ├── sourcing.prisma
    ├── supply.prisma
    └── system.prisma
```

New models go in the owning domain file and include `/// @namespace` and
`/// @describe` comments. Root `prisma.config.ts` points Prisma at the `prisma/`
directory; do not move datasource URL back into `schema.prisma`.

## Owned Surfaces

- Prisma schema and generated client shape
- DB push/migration workflows
- Partial unique indexes
- Fresh Docker bootstrap snapshot: `prisma/init.sql.gz`
- Generated schema navigation artifacts

## Schema Rules

- No native PostgreSQL enums. Use `String` plus DTO/Zod/domain validation.
- PascalCase model names map to snake_case table names with `@@map`.
- camelCase fields map to snake_case columns with `@map`.
- UUID primary keys use `@default(uuid()) @db.Uuid`.
- Timestamps use `@db.Timestamptz`.
- KRW is `Int`; CNY/decimal money uses `Decimal(12,2)`.
- JSON is for one-off raw payload preservation only. Query, aggregate, or IDOR
  guard data should be normalized.
- FK columns need a leading `@@index([foreignKey])`; Prisma does not create FK
  indexes automatically.
- Optional FKs declare `onDelete` explicitly.

## Organization Boundary

- `Organization` / `organization_id` is the SaaS workspace boundary.
- `OrganizationMembership` owns user role and current organization.
- Do not reintroduce `User.organizationId`.
- `LegalEntity` is tax/settlement identity, not a SaaS boundary.
- `ChannelAccount` is marketplace/store identity, not a SaaS boundary.

## Integrated Model Contracts

- Agent OS uses six code-owned persistence models only: `AgentVersion`,
  `AgentSession`, `AgentTask`, `AgentAttempt`, `AgentCapabilityInvocation`, and
  `AgentCapabilityApproval`.
- `AgentVersion` snapshots domains/capability keys/runtime profile but never a
  provider credential, model, or provider session. Task owns only the business
  lifecycle; Attempt owns only the CLI process lifecycle.
- Legacy `AgentDefinition`, `AgentInstance`, `AgentRunRequest`, `AgentRun`,
  runtime state, cost ledgers, event/replay rows, and handle/session keys must
  not return.
- `Marketplace.type` distinguishes `agent` and `workflow`; version publication
  is code-owned and idempotent.

## Partial Unique Indexes

Prisma v7 `partialIndexes` manage active-row uniqueness. Do not add full unique
constraints on the same logical keys.

Current active-row uniqueness includes:

- `channel_listings(organization_id, channel_account_id, external_id)`
- active source-backed `channel_listings(organization_id, source_candidate_id,
  channel_account_id)`
- active `product_preparations(organization_id, source_candidate_id,
  channel_account_id)`
- one primary `supplier_products(sellpia_inventory_sku_id)` row

`MasterProduct` is the canonical KidItem inventory product and sole ABC owner.
Each provider source row may own at most one MasterProduct; Sellpia uses
`SellpiaInventorySku.masterProductId`. Multiple channel listing options may
consume the same MasterProduct through its source SKU.
`ChannelListing.masterProductId` is only a derived single-product summary and
must be null when the option recipes are incomplete or span multiple products.
`ChannelListingOptionInventoryComponent` stores the positive quantity of one
`SellpiaInventorySku` consumed by one channel-option sale, and
`SellpiaInventorySku` is the sole physical Sellpia quantity/source-fact owner.
Never put
`currentStock`, source prices, barcode, raw import payload, or import provenance
back on `MasterProduct`, and never restore ProductVariant or a second recipe
layer.
`MasterProductAbcEvaluation` is the Products-owned one-to-one explanation
snapshot; the only writable official ABC grade remains `MasterProduct.abcGrade`.

All relations among these models are organization-fenced with composite
`[id, organizationId]` references. A nullable channel product summary means the
option recipes are incomplete or span multiple inventory products; an empty
option component list means inventory configuration is required. Candidate
evidence is not persisted as confirmed truth.

Service code should use `findFirst({ where: { ..., isDeleted: false } })`
instead of `findUnique(...)` assumptions over partial keys.

## Data + Migration Flow

After pulling schema changes:

```bash
git pull
npm install --legacy-peer-deps
npm run db:push -- --accept-data-loss   # only when drops are expected
npx prisma generate
npm run data:migrate                    # when release data migrations exist
```

Compatible schema changes share the open root release-train `VERSION`; they do
not bump it per Prisma diff. Use a versioned data migration only when persisted
rows need an idempotent rewrite. Never append a new migration to a train already
promoted to `main`; open the next train first. See
[`docs/runbooks/release-train-versioning.md`](../docs/runbooks/release-train-versioning.md).

Prisma `db push` changes schema only. Durable persisted-data rewrites live under
`scripts/data-migrations/v<app-version>/<sequence>_<name>.ts`, run through
`npm run data:migrate`, and record `data_migration_runs`.

## Development Data

Shared screen/data baselines use Google Drive dev data profiles, not
`init.sql.gz` or synthetic seeds. Standard replay mode is `scoped-replace`, and
Coupang bundles replay through the real ingest path:
`POST /api/ads/extension/sync`.

`prisma/init.sql.gz` is only a fresh Docker volume bootstrap snapshot. Existing
volumes ignore it; deleting a local volume to apply it destroys local data.

## Prisma-Only Boundary

Schema truth stays in Prisma. Do not maintain long-lived RLS, CHECK
constraint, expression index, standalone sequence, or SQL overlay systems.
Tenant isolation is enforced by Nest guards plus application/repository
`organizationId` predicates.

## Verification

After Prisma model or schema-consumer changes:

```bash
npm run db:push
npx prisma generate
npm run build --workspace=packages/shared
npm run db:erd
```

`docs/ERD.md` and `docs/erd/**` are navigation aids only; verify important claims against Prisma and source code.
