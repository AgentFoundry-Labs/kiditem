# Selling catalog cutover

Channels owns common selling products, option prices, reusable registration
targets and execution records under ADR-0020. MasterProduct remains the source
inventory identity. This runbook covers the data transition, not marketplace
submission or permission to deploy.

## Preconditions

Use the exact reviewed SHA and the open release train. Stop writers through the
[deployment cutover](deployment-architecture.md#schema-and-data-boundary), which
captures the database dump before running pre-schema migrations. Read migration
status and source drift first. Never run an older application against contracted
selling-product tables.

The registered order is intentional, not numeric: `019_prepare_selling_catalog_sources`
runs before immutable `016_master_product_inventory_cutover`. It copies exact
same-organization legacy SKU-to-MasterProduct references for selling templates
and removes only their known legacy SKU foreign keys before 016 drops that table.
It also advances the shared allocator above existing KIDs without rewinding it.
A database that never had selling catalog tables is a no-op.

After 016–018, `020_selling_catalog_cutover` materializes the legacy base price
plus option extra as each option's final sale price. It keeps existing final
prices, moves the old tag price to optional normal price, preserves UUIDs and
bootstrap identifiers, and uses the bounded KID allocator. A linked option's
existing KID is preserved; an initially confirmed singleton may reuse the source
KID. External sellerSku, provider identifiers and frozen execution evidence are
not rewritten.

After 020, `022_registration_target_cutover` creates the minimal catalog shape if
it never existed, then links saved registration preparations to selling products.
It uses only explicit stored names, priced variants and option values; missing
prices, conflicting common definitions, ambiguous option mappings or cross-organization
references abort the transaction. Existing preparation UUIDs, settings, external
identifiers and frozen execution rows/hashes remain unchanged. Already linked
settings are not overwritten. Successful legacy preparations become reusable;
explicitly cancelled or deleted settings retain their archive time.

Legacy account overrides become registration targets with the same UUID. The old
base-plus-extra and explicit-price-before-rate behavior is materialized once as
final selected-option prices. No persistent price ratio or independent cost
source is created. Prisma adds the remaining nullable/defaulted catalog columns
and owner relations after this backfill. An abort keeps writers stopped; correct
the ambiguous input with an explicit decision before retrying. This procedure
was approved on 2026-09-22; it does not authorize running it on Office here.

## Execution and verification

Run these steps through `npm run data:migrate` with the target, release, phase
and `APPLY_DATA_MIGRATIONS` confirmation required by the migration runner; use
the deployer's explicit `--cutover --confirm APPLY_SCHEMA_DATA` path for Office.
Do not call migration modules manually against an operating database.

1. Run the exact SHA's pre-schema migrations and inspect every ledger outcome.
2. Run the read-only cutover blocker survey. A conflicting or missing source
   mapping requires a decision; do not invent a match from names or drop a
   confirmed recipe to pass the survey.
3. Apply the reviewed Prisma contraction, regenerate clients and run post-schema
   migrations/ensure steps. The global KID ensure validates allowed identity
   reuse and prevents sequence rewind.
4. Compare UUID counts, selected-option prices, bootstrap identifiers, external
   listing/option IDs, sellerSku and execution hashes with the pre-cutover dump.
5. Verify product editing, target selection and execution history through the
   NestJS APIs. Keep real marketplace registration, stock submission and order
   transmission out of QA.

The focused Testcontainers suite is
`apps/server/src/channels/__tests__/selling-catalog-cutover.pg.integration.spec.ts`.
It checks final-price conversion, repeatability, source-table removal ordering
and rollback when an exact source mapping is missing. The companion
`registration-target-cutover.pg.integration.spec.ts` covers saved preparation
bootstrap, override conversion, frozen execution preservation and repeatability. Follow the shared cutover
runbook for the disposable local QA database and wider application checks.

## Recovery

A schema/data failure keeps writers stopped. Runtime-only rollback cannot
reverse the contraction. Follow the deployment runbook's database-dump and
data-loss policy; preserve accounts, confirmed recipes, orders and transport
receipts. Review any unresolved human-entered data before choosing a new cleanup
migration. Never reuse an allocated KID to fill a gap left by a failed attempt.
