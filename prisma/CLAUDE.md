Before working in this directory, always read this document first rather than relying on memory.

# prisma — Shared Schema

`prisma/` is the database schema source of truth. KidItem uses Prisma v7
multi-file schema with domain-owned model files. This guide covers schema,
database-change safety, and bootstrap artifacts; business behavior belongs in
the owning domain guide or architecture documentation.

PostgreSQL schema, index, constraint, migration, or query-performance work in
this scope uses the `supabase-postgres-best-practices` skill and only its
relevant references. Repository-specific contracts below take precedence over
generic guidance.

## Schema Ownership

- Keep generator and datasource configuration in `schema.prisma`. Root
  `prisma.config.ts` supplies the datasource URL and points Prisma at this
  directory.
- Add models to the owning `models/<domain>.prisma` file with `/// @namespace`
  and `/// @describe` comments.
- Prisma schema and source code are authoritative. `docs/ERD.md` and
  `docs/erd/**` are generated navigation aids.

## Schema Rules

- Represent enum-like values as `String` and validate them through DTO, Zod,
  and domain contracts.
- Map PascalCase models and camelCase fields to lowercase snake_case tables and
  columns with `@@map` and `@map`.
- UUID primary keys use `@default(uuid()) @db.Uuid`; timestamps use
  `@db.Timestamptz`.
- A bounded atomic KRW value may use `Int` only when its domain maximum is below
  the signed 32-bit limit. Cumulative or aggregate KRW uses `BigInt`; fractional
  currency uses `Decimal`. Monetary values never use floating-point types.
- JSON is only for raw or genuinely document-shaped payloads. Normalize data
  used for joins, filtering, aggregation, ownership, or IDOR guards.
- Give every FK an index usable for joins and parent update/delete checks. Reuse
  an existing composite index when its leftmost columns cover the FK access path.
- Optional FKs declare `onDelete` explicitly.
- A reference to another owner's row is a plain id column with an index and no
  `@relation`; validate it through the owner's public contract. Same-owner
  relations retain their constraints. For Channels-related boundaries,
  organization/user and `SourceImportRun` references are also explicit migration
  exceptions rather than automatic exemptions (ADR-0021); other domains retain
  ADR-0013's scoped exceptions until their boundary changes. Retained Inventory transfer history
  follows the scoped SKU-reference exception in
  [ADR-0016](../docs/adr/0016-inventory-history-retains-deleted-sku-identities.md).
  `npm run check:cross-owner-fk`
  fails an unlisted cross-owner relation and a stale
  `scripts/cross-owner-fk.json` entry; it cannot stop an entry being added, so
  a PR that adds one states why, and a PR that drops a `@relation` drops its
  entry too
  ([ADR-0013](../docs/adr/0013-cross-owner-references-are-ids-not-foreign-keys.md)).

## Organization Boundary

- `Organization` / `organization_id` is the workspace boundary, and
  `OrganizationMembership` owns user role and current organization.
- Use `Organization` / `organizationId` as the only workspace identifier; keep
  `tenantId` and `User.organizationId` absent.
- `LegalEntity` is tax/settlement identity; `ChannelAccount` is marketplace or
  store identity. Neither is the workspace boundary.
- Organization-owned cross-model relations use composite `[id, organizationId]`
  references unless a durable owner contract documents an exception.

## Indexes And Database Objects

- Design indexes from actual filter, join, and ordering shapes. Put equality
  columns before range columns in composite indexes and use a partial index only
  when its predicate matches the stable query contract.
- Use Prisma v7 `partialIndexes` for predicate-backed uniqueness. Keep the same
  logical key free of a full unique constraint, and query partial keys with a
  predicate-aware selector instead of `findUnique`.
- Verify performance-sensitive index changes against representative data with
  `EXPLAIN (ANALYZE, BUFFERS)`; an index inventory in documentation is not
  evidence that a query can use it.
- Manage database objects through Prisma. When a required RLS policy, CHECK
  constraint, expression index, sequence, trigger, extension, or other object
  cannot be represented there, give it a durable owner and rationale, an ensure
  step in `scripts/data-migrations/ensure/` that every post-schema
  `data:migrate -- up` re-applies (rows it would reject first need a pre-schema
  cleanup migration), proof that Prisma workflows preserve it, and a regression
  gate.
- KidItem currently exposes data through NestJS rather than direct database
  clients, so organization isolation is enforced by guards and repository
  predicates. Any direct client, database API, or new bypass path requires an
  explicit RLS and privilege review before merge.

## Schema And Data Changes

- Prisma `db push` changes schema only. Persisted-row rewrites use an idempotent
  versioned migration under
  `scripts/data-migrations/v<app-version>/<sequence>_<name>.ts`, run through
  `npm run data:migrate`, and record `data_migration_runs`.
- Compatible schema changes share the open root release-train `VERSION`. Never
  append a migration to a train already promoted to `release/office` or `main`;
  open the next train. Follow
  [`release-train-versioning.md`](../docs/runbooks/release-train-versioning.md).
- Run `db push` only against an explicitly confirmed disposable or local target.
  Drops, narrowing type changes, or `--accept-data-loss` reach Office only
  through the deployment cutover, which may discard data that no longer fits
  ([data-loss policy](../docs/runbooks/deployment-architecture.md#data-loss-policy)).
  Keep them out of routine post-pull setup.
- A schema change that existing rows can stop (a required column without a
  database default, SET NOT NULL, a type change, or a unique, primary, or
  foreign key on an existing table) needs an entry in
  `scripts/cutover-blocker-coverage.json`: the pre-schema migration that
  removes or fixes those rows, or why no row can stop it. PR checks run
  `npm run check:cutover-blocker-coverage`, which diffs the schema against
  `origin/release/office` offline.

## Verification

After Prisma model or schema-consumer changes:

```bash
npx prisma format
npx prisma validate
npm run db:sync:local       # local developer database only; see docs/runbooks/local-development.md
npx prisma generate
npm run build --workspace=packages/shared
npm run db:erd
npm run check:cutover-blocker-coverage   # needs origin/release/office fetched
```
