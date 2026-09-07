# Sellpia MasterProduct and Channel Reconstruction Implementation Plan

> **SUPERSEDED:** Do not execute this three-release preservation plan. On
> 2026-07-13 the user approved discarding existing database data in every
> environment. Execute
> `docs/superpowers/plans/2026-07-13-sellpia-single-release-rebuild.md` instead.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan. Use `superpowers:subagent-driven-development` only at the reviewer-sized task boundaries below; use one consolidated review per release, not one review per checklist item.

**Goal:** Replace the competing `InventorySku`/product-family identities with one Sellpia-code `MasterProduct`, account-scoped channel listings and sellable SKUs, confirmed component recipes, and listing/candidate-owned content while preserving shared-environment data through three sequential releases.

**Architecture:** Sellpia full snapshots are the only writer of physical stock on `MasterProduct`. `ChannelAccount -> ChannelListing -> ChannelListingOption` owns marketplace metadata, `ChannelSkuComponent` owns the positive-quantity recipe to physical Masters, and `ContentWorkspace` owns source/listing content. Persistent environments move through 0.1.8 expand, 0.1.9 backfill/switch, and 0.1.10 contract; none of these release gates may be collapsed.

**Tech Stack:** Prisma 7/PostgreSQL, NestJS, Next.js/React Query, Zod, Vitest, durable TypeScript data migrations, GitHub Actions, GStack browser QA.

## Global Constraints

- The approved authority is `docs/superpowers/specs/2026-07-12-sellpia-authoritative-inventory-cutover-design.md`.
- `develop` is the 0.1.7 base. Produce, merge, and deploy 0.1.8 before starting the deployable 0.1.9 release; do the same before 0.1.10.
- Do not stage, rename, delete, or embed the operator workbooks under `docs/references/`. The current deleted/untracked workbook state is user-owned.
- Shared staging/production databases are never reset. A local reset is allowed only after the effective target is proven local.
- Keep the public Sellpia routes: `POST /api/inventory/sellpia-sync/import`, `GET /api/inventory/sellpia-skus`, and `GET /api/inventory/sellpia-sync/import-runs`.
- Keep the public Wing workbook route `POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing`.
- Sellpia import is the only path that writes `MasterProduct.currentStock`, source prices, active membership, raw source JSON, or import provenance.
- Channel imports never write stock, confirmed recipes, source-candidate provenance, current content selections, or KidItem-authored commercial fields.
- Final listing-owned operational fields are `abcGrade`, `profitTag`, `adTier`, `adBudgetLimit`, `healthScore`, and `healthUpdatedAt`. Final SKU-owned commercial fields are `costPriceOverride`, `commissionRate`, `shippingCost`, and `otherCost`.
- Effective channel-SKU cost is `costPriceOverride` when present, otherwise the sum of known `MasterProduct.purchasePrice * component.quantity`; missing mapping or component price is unknown, never zero.
- Supplier revenue for a multi-component channel SKU is attributed only to each component Master's primary supplier, weighted by extended component purchase cost. If any weight or primary supplier is missing, preserve the physical-unit counts but report that line's revenue under `unallocatedRevenue`; never duplicate the full line revenue across suppliers.
- Every cross-model organization relation uses composite organization-safe foreign keys, and every mutation receives `organizationId` from the authenticated server context.
- Keep TDD tests that encode business invariants. Do not replace behavioral tests with schema-string checks alone.
- Before editing a new path, rediscover and read every applicable `AGENTS.md` from the repository root to that path.

## Current Branch Disposition

Retain the existing Sellpia and Wing workbook parsers, upload controllers, `SourceImportRun` claim/attempt/advisory-lock fencing, batched imports, component replacement transaction, manual candidate search, nullable capacity projection, and related architecture/wiring tests. Rewrite the final owner from `InventorySku` to `MasterProduct`, replace status-only refresh with exact automatic matching, replace Master-grouped registered products with listing identity, and remove the unshipped blanket 0.1.9 blocker.

---

### Task 1: Release 0.1.8 — Add the non-destructive schema, migration ledger, and deployment guards

**Files:**

- Modify: `VERSION`
- Modify: `prisma/models/core.prisma`
- Modify: `prisma/models/inventory.prisma`
- Modify: `prisma/models/channels.prisma`
- Modify: `prisma/models/sourcing.prisma`
- Modify: `prisma/models/ai.prisma`
- Modify: `prisma/models/orders.prisma`
- Modify: `prisma/models/supply.prisma`
- Modify: `prisma/models/advertising.prisma`
- Modify: `prisma/models/finance.prisma`
- Create: `scripts/data-migrations/v0.1.8/001_normalize_operational_channel_accounts.ts`
- Modify/rename: `scripts/data-migrations/v0.1.8/001_backfill_channel_sku_accounts.ts` -> `scripts/data-migrations/v0.1.8/002_backfill_channel_sku_accounts.ts`
- Create: `scripts/check-sellpia-cutover-preflight.ts`
- Create: `scripts/check-sellpia-db-push-warning.mjs`
- Create: `scripts/__tests__/sellpia-master-expand-contract.test.mjs`
- Create: `scripts/__tests__/check-sellpia-cutover-preflight.spec.ts`
- Create: `scripts/__tests__/check-sellpia-db-push-warning.test.mjs`
- Modify: `scripts/data-migrations/index.ts`
- Modify: `scripts/__tests__/run-data-migrations.spec.ts`
- Modify: `scripts/data-migrations/README.md`
- Modify: `scripts/README.md`
- Modify: `scripts/check-script-inventory.mjs`
- Modify: `scripts/__tests__/check-script-inventory.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/staging-deploy.yml`
- Modify: `.github/workflows/production-deploy.yml`
- Delete after replacement tests pass: `scripts/check-channel-sku-identity.ts`
- Delete after replacement tests pass: `scripts/check-channel-sku-db-push-warning.mjs`
- Delete after replacement tests pass: `scripts/__tests__/check-channel-sku-identity.spec.ts`
- Delete after replacement tests pass: `scripts/__tests__/check-channel-sku-db-push-warning.test.mjs`

**Step 1: Write the failing expand-contract tests**

In `sellpia-master-expand-contract.test.mjs`, assert all legacy models and columns still exist at 0.1.8, every staged target exists, and the migration registry contains no 0.1.9 entry. The central expectations are:

```js
assert.match(coreSchema, /model MasterProduct[\s\S]*sellpiaProductCode\s+String\?/);
assert.match(coreSchema, /model ProductOption\s+\{/);
assert.match(inventorySchema, /model InventorySku\s+\{/);
assert.match(inventorySchema, /model InventorySkuMasterProductMap\s+\{/);
assert.match(channelsSchema, /model ChannelSkuComponent[\s\S]*masterProductId\s+String\?/);
assert.doesNotMatch(registry, /blockPersistentSellpiaInventoryCutover/);
assert.equal(version.trim(), '0.1.8');
```

In the preflight spec, cover null/duplicate operational accounts, duplicate active/inactive listing identity, parent/child account mismatch, cross-tenant FKs, ownerless retained content, ambiguous `ProductOption` references, and bounded sample reporting. In the warning spec, prove an additive/composite-key-only warning set passes and any drop, rename, extra warning, or missing preflight marker fails.

Run:

```bash
rtk node --test scripts/__tests__/sellpia-master-expand-contract.test.mjs scripts/__tests__/check-sellpia-db-push-warning.test.mjs
rtk npm exec vitest -- run --config scripts/vitest.config.ts scripts/__tests__/check-sellpia-cutover-preflight.spec.ts scripts/__tests__/run-data-migrations.spec.ts
```

Expected: FAIL because the branch is currently 0.1.9, legacy schema pieces were removed, and the replacement guards do not exist.

**Step 2: Add only expand-safe schema**

Set `VERSION` to `0.1.8`. Restore every model/column removed relative to `develop` before adding target columns. Do not drop or require a newly added nullable field in this release.

Add staged physical fields to legacy `MasterProduct`: nullable `sellpiaProductCode`, `sellpiaName`, `sellpiaBarcode`, `optionName`, `currentStock`, `purchasePrice`, `salePrice`, `isActive`, `rawJson`, and `lastImportRunId`; add unique `(organizationId, sellpiaProductCode)` where non-null and composite `(id, organizationId)`. A staged physical row keeps the old required columns compatible by using deterministic `code = SELLPIA::<organizationId>::<sha256(sellpiaProductCode).slice(0,24)>`, `name = sellpiaName`, `isTemporary = true`, `temporaryReason = sellpia_master_cutover`, and `lifecycleState = inventory_staged`. Existing family Masters keep `sellpiaProductCode = null` and are never inferred as physical inventory.

Add `InventorySkuMasterProductMap` with `organizationId`, unique `inventorySkuId`, unique `masterProductId`, `resolution`, `details`, and timestamps; both FKs must include `organizationId`. Add nullable `masterProductId` to `ChannelSkuComponent` alongside the retained `inventorySkuId`.

Add the following without removing old columns:

- `ChannelAccount` composite `(id, organizationId)`;
- `SourceImportRun.publicationSequence` and composite account/import relations;
- `ChannelListing.sourceCandidateId`, `isActive`, listing-owned operational fields, composite account/import/source relations, and composite `(id, organizationId)`;
- `ChannelListingOption.attributesJson`, SKU-owned commercial fields, and composite parent ownership;
- `SourcingCandidate.provenanceMasterProductId` as the audited optional 1:1 physical provenance link while retaining `promotedMasterId` only as an unwired migration source;
- `ProductPreparation.channelAccountId`, required `sourceContentWorkspaceId`, nullable `channelListingId`, `submissionKey`, `providerSubmissionId`, `lastError`, `registrationResult`, `submissionPayloadJson`, and `submissionPayloadHash` next to the retained legacy preparation columns;
- `ContentWorkspace.channelListingId`, `originWorkspaceId`, and `currentThumbnailSelectionId`, plus the additive `ContentWorkspaceThumbnailSelection` model;
- `ContentGenerationGroup.contentWorkspaceId` and `ContentAsset.originGenerationGroupId` next to their retained legacy owner columns;
- target content owner, preparation, order, return, shipment-item, supplier, purchase-order, picking, transfer, and snapshot fields described in the approved design;
- nullable target FKs next to all retained legacy FKs.

The final-only non-null constraints, column removals, and model removals belong to 0.1.10.

**Step 3: Implement deterministic account normalization and preflight**

`001_normalize_operational_channel_accounts.ts` applies evidence in this order: source seller/vendor identity, linked listing option/listing account, legacy parent listing account, then the sole active account for the platform. It repoints all incoming FKs before merging exact canonical duplicates and throws on ambiguity or missing identity. `002_backfill_channel_sku_accounts.ts` retains the existing child-from-parent backfill and adds orphan, tenant, and mismatch assertions.

`check-sellpia-cutover-preflight.ts` must report counts and at most 20 examples for every preservation lane: InventorySku, legacy Master/ProductOption, components, suppliers, orders/returns/shipments/unshipped, content, listings/options, analytics, and ads. Its machine-readable result includes `status: 'passed'`, the target release, row counts, and blocking issue codes.

Replace the channel-only warning checker in both deploy workflows with `check-sellpia-db-push-warning.mjs`. The 0.1.8 allowlist accepts only the exact additive/composite-constraint warnings observed after the passing preflight and rejects all drop/rename warnings. Remove `001_block_persistent_sellpia_inventory_cutover.ts` from the registry now; it is unshipped and must not block shared targets.

**Step 4: Run schema and migration gates**

```bash
rtk npm run test:scripts
rtk npm run check:scripts-inventory
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
```

Expected: all script tests pass; Prisma reports no unapproved destructive change; client generation and the shared build succeed. Do not use `--accept-data-loss` unless the captured output is accepted by the release-specific checker.

**Step 5: Commit the expand foundation**

```bash
rtk git add VERSION prisma scripts package.json .github/workflows
rtk git commit -m "feat: expand Sellpia MasterProduct cutover schema"
```

Do not stage `docs/references/` or `.understand-anything/`.

---

### Task 2: Release 0.1.8 — Dual-write imports and install account-scoped registration/content contracts

**Files — inventory and channel reuse/cutover:**

- Modify: `apps/server/src/inventory/application/service/sellpia-inventory-import.service.ts`
- Modify: `apps/server/src/inventory/application/port/out/repository/inventory-sku-import.repository.port.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/inventory-sku-import.repository.adapter.ts`
- Modify: `apps/server/src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/inventory/application/service/sellpia-inventory-import.service.spec.ts`
- Modify: `apps/server/src/channels/application/service/channel-catalog-import.service.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-catalog-import.repository.adapter.ts`
- Modify: `apps/server/src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/channels/application/service/__tests__/channel-catalog-import.service.spec.ts`

**Files — shared sourcing/listing contracts:**

- Modify: `packages/shared/src/sourcing/candidate-status.ts`
- Modify: `packages/shared/src/sourcing/__tests__/candidate-status.spec.ts`
- Create: `packages/shared/src/sourcing/product-preparation.ts`
- Create: `packages/shared/src/sourcing/product-preparation.spec.ts`
- Create: `packages/shared/src/channel-listing.ts`
- Create: `packages/shared/src/channel-listing.spec.ts`
- Modify: `packages/shared/src/sourcing/index.ts`
- Modify: `packages/shared/package.json`

**Files — AI content ownership:**

- Modify: `apps/server/src/ai/application/port/out/repository/content-workspace-lifecycle.repository.port.ts`
- Modify: `apps/server/src/ai/application/service/content-workspace.service.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/content-workspace-lifecycle.repository.adapter.ts`
- Create: `apps/server/src/ai/application/port/in/workspace/registration-content-workspace.port.ts`
- Create: `apps/server/src/ai/application/port/out/repository/registration-content-workspace.repository.port.ts`
- Create: `apps/server/src/ai/application/service/registration-content-workspace.service.ts`
- Create: `apps/server/src/ai/adapter/out/repository/registration-content-workspace.repository.adapter.ts`
- Create: `apps/server/src/ai/application/service/registration-content-workspace.service.spec.ts`
- Create: `apps/server/src/ai/adapter/out/repository/registration-content-workspace.repository.adapter.spec.ts`
- Create: `apps/server/src/ai/application/service/content-workspace-thumbnail-selection.service.ts`
- Create: `apps/server/src/ai/application/port/out/repository/content-workspace-thumbnail-selection.repository.port.ts`
- Create: `apps/server/src/ai/adapter/out/repository/content-workspace-thumbnail-selection.repository.adapter.ts`
- Create: `apps/server/src/ai/application/service/content-workspace-thumbnail-selection.service.spec.ts`
- Modify: `apps/server/src/ai/application/port/out/repository/content-asset-library.repository.port.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/content-asset-library.repository.adapter.ts`
- Modify: `apps/server/src/ai/application/service/content-asset.service.ts`
- Modify: `apps/server/src/ai/application/service/content-archive.service.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/content-archive.repository.adapter.ts`
- Modify: `apps/server/src/ai/ai.module.ts`

**Files — registration state machine:**

- Create: `apps/server/src/sourcing/application/port/out/repository/product-preparation.repository.port.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/product-preparation.repository.adapter.ts`
- Create: `apps/server/src/sourcing/domain/product-preparation-payload.ts`
- Create: `apps/server/src/sourcing/domain/product-preparation-payload.spec.ts`
- Create: `apps/server/src/sourcing/application/service/product-registration.service.ts`
- Create: `apps/server/src/sourcing/application/service/product-registration.service.spec.ts`
- Create: `apps/server/src/sourcing/__tests__/product-registration.pg.integration.spec.ts`
- Create: `apps/server/src/sourcing/application/port/out/cross-domain/channel-product-registration.port.ts`
- Create: `apps/server/src/sourcing/adapter/out/channels/channel-product-registration.adapter.ts`
- Create: `apps/server/src/sourcing/application/port/out/cross-domain/registration-content-workspace.port.ts`
- Create: `apps/server/src/sourcing/adapter/out/ai/registration-content-workspace.adapter.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/dto/create-product-preparation.dto.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/dto/update-product-preparation.dto.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-candidate-workspace.controller.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/dto/index.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Modify: `apps/server/src/channels/application/port/in/capability/marketplace-registration.port.ts`
- Modify: `apps/server/src/channels/application/service/marketplace-registration.service.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/marketplace-registration.repository.adapter.ts`
- Modify: `apps/server/src/channels/channels.module.ts`

**Step 1: Write failing dual-write and state-machine tests**

Extend the Sellpia PG test to prove one completed publication atomically writes the same stock/source fields to `InventorySku`, staged `MasterProduct`, and the ledger; missing rows become zero/inactive in both; a failed/losing attempt publishes neither; a reappearing code reuses the same target Master. Extend the Wing PG test to prove inactive identity reuse, account scoping, and recipe/content preservation.

Write `product-preparation-payload.spec.ts` against a stable canonical JSON/hash function. Write `product-registration.service.spec.ts` and PG integration cases for concurrent draft uniqueness, frozen hash and key reuse, provider failure, uncertain provider success followed by local failure and reconciliation, failed-edit cancellation/new key, and one transaction for listing/workspace/registered finalization.

Core service surface:

```ts
createDraft(orgId, candidateId, userId, input): Promise<{ preparationId: string; status: 'draft' }>;
updateDraft(orgId, preparationId, userId, input): Promise<{ preparationId: string; status: 'draft' }>;
submit(orgId, preparationId, userId): Promise<{ preparationId: string; status: ProductPreparationStatus; listingId?: string }>;
cancel(orgId, preparationId, userId): Promise<{ preparationId: string; status: 'cancelled' }>;
```

Run the focused tests and confirm they fail before implementation:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/sourcing/product-preparation.spec.ts src/channel-listing.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory/application/service/sellpia-inventory-import.service.spec.ts src/channels/application/service/channel-catalog-import.service.spec.ts src/sourcing/domain/product-preparation-payload.spec.ts src/sourcing/application/service/product-registration.service.spec.ts src/ai/application/service/registration-content-workspace.service.spec.ts src/ai/application/service/content-workspace-thumbnail-selection.service.spec.ts
```

Expected: FAIL on the missing contracts and target writes.

**Step 2: Add serialized dual writes without changing public routes**

Reuse the current full-file parse-before-write, attempt token, advisory lock, claim/retry, batching, and transaction boundaries. Allocate `publicationSequence` monotonically per `(organizationId, sourceType)`. The winning Sellpia publication writes both legacy and staged representations plus the identity ledger; retries of the same completed hash return the prior result. The winning Wing full-account publication upserts by account identity, reactivates existing rows, and deactivates unseen rows without deletion or recipe/content changes.

**Step 3: Implement content workspace ownership and safe asset adoption**

Make workspace lifecycle accept `sourcing_candidate`, `channel_listing`, or `direct_detail_page`; add listing/origin/current-thumbnail projection while retaining old target columns only for 0.1.8 rollback. Implement `branchToListing` so it clones selected artifact/revision metadata and HTML into listing-owned rows, reuses storage URLs, creates a listing-owned thumbnail selection pointing to the same managed asset, and never clones generation jobs/candidates.

Add `PATCH /api/ai/content-workspaces/:workspaceId/current-thumbnail`. The DTO accepts exactly one of `contentAssetId`, `sourceThumbnailGenerationId` with `sourceThumbnailCandidateId`, or `externalUrl`. External URLs must pass through `IMAGE_FETCH_PORT` and `IMAGE_STORAGE_PORT`; active generation usage or thumbnail selection blocks asset deletion/GC.

**Step 4: Replace Master promotion semantics with preparation semantics**

`ProductPreparationRepositoryPort` owns all preparation writes; do not grow the candidate repository. Repository methods are `createOrGetActiveDraft`, `replaceDraftInput`, `claimForSubmission`, `loadFrozenSubmission`, `recordProviderResult`, `markFailed`, and `finalizeRegistered`, all tenant-scoped and row-locked.

Provider calls occur outside the DB transaction. On each retry, reconcile by submission key/provider identity before calling create again. The final local transaction resolves the account-scoped listing, attaches immutable `sourceCandidateId`, branches content, and marks the preparation registered.

Expose:

- `POST /api/sourcing/candidates/:id/preparations`;
- `PATCH /api/sourcing/preparations/:id`;
- `POST /api/sourcing/preparations/:id/submit`;
- `POST /api/sourcing/preparations/:id/cancel`.

For 0.1.8 only, keep `POST /api/sourcing/candidates/:id/promote` as a deprecated alias to `createDraft` with the same body and `{ preparationId, status: 'draft' }` response. It must never create or return a Master. Candidate status is `sourced|rejected`; registration state is derived from preparations/listings.

**Step 5: Run focused, tenant, and boot verification**

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/sourcing/product-preparation.spec.ts src/channel-listing.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory src/channels src/sourcing src/ai
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts src/sourcing/__tests__/product-registration.pg.integration.spec.ts
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run build --workspace=apps/server
rtk npm run dev:server
```

Expected: all focused/unit/PG tests pass; tenant scanners pass; Nest starts without unresolved providers. Stop the dev server after observing successful boot.

**Step 6: Commit and complete the 0.1.8 release gate**

```bash
rtk git add apps/server packages/shared prisma scripts VERSION package.json .github/workflows docs/ARCHITECTURE.md
rtk git commit -m "feat: add dual-compatible channel registration owners"
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

Perform one consolidated review of the complete 0.1.8 diff. Merge and deploy 0.1.8 through GitHub Actions before beginning the deployable 0.1.9 work. Record preflight/account-normalization counts in the release evidence.

---

### Task 3: Release 0.1.9 — Backfill every owner, publish a fresh Sellpia snapshot, and switch core inventory/channel contracts

**Files — migrations and release checks:**

- Modify: `VERSION`
- Delete: `scripts/data-migrations/v0.1.9/001_block_persistent_sellpia_inventory_cutover.ts`
- Create: `scripts/data-migrations/v0.1.9/001_build_sellpia_master_identity_map.ts`
- Create: `scripts/data-migrations/v0.1.9/002_repoint_channel_sku_components.ts`
- Create: `scripts/data-migrations/v0.1.9/003_backfill_final_owner_relations.ts`
- Create: `scripts/data-migrations/v0.1.9/004_verify_fresh_sellpia_snapshot.ts`
- Create: `scripts/data-migrations/v0.1.9/005_verify_channel_catalog_cutover.ts`
- Create: `scripts/__tests__/sellpia-cutover-migrations.spec.ts`
- Modify: `scripts/data-migrations/index.ts`
- Modify: `scripts/__tests__/run-data-migrations.spec.ts`

**Files — final-named inventory contracts:**

- Create: `apps/server/src/inventory/application/port/out/repository/sellpia-master-import.repository.port.ts`
- Create: `apps/server/src/inventory/adapter/out/repository/sellpia-master-import.repository.adapter.ts`
- Create: `apps/server/src/inventory/application/port/in/stock/sellpia-master-product-read.port.ts`
- Create: `apps/server/src/inventory/application/port/out/repository/sellpia-master-product-read.repository.port.ts`
- Create: `apps/server/src/inventory/application/service/sellpia-master-product-read.service.ts`
- Create: `apps/server/src/inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter.ts`
- Modify: `apps/server/src/inventory/application/service/sellpia-inventory-import.service.ts`
- Modify: `apps/server/src/inventory/adapter/in/http/sellpia-inventory-import.controller.ts`
- Modify: `apps/server/src/inventory/adapter/in/http/inventory-sku-snapshot.controller.ts`
- Modify: `apps/server/src/inventory/application/service/inventory-sku-snapshot-list.service.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/inventory-sku-snapshot-list.repository.adapter.ts`
- Modify: `apps/server/src/inventory/inventory.module.ts`
- Modify: `packages/shared/src/schemas/source-import.ts`
- Modify: `packages/shared/src/schemas/source-import.spec.ts`
- Modify: `packages/shared/src/schemas/inventory-snapshot.ts`
- Modify: `packages/shared/src/schemas/inventory-snapshot.spec.ts`

**Files — Wing import and automatic mapping:**

- Modify: `apps/server/src/channels/application/service/coupang-wing-workbook.parser.ts`
- Modify: `apps/server/src/channels/application/service/coupang-wing-workbook.parser.spec.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-catalog-import.repository.adapter.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-account.repository.adapter.ts`
- Create: `apps/server/src/channels/domain/channel-sku-automatic-match.ts`
- Create: `apps/server/src/channels/domain/channel-sku-automatic-match.spec.ts`
- Modify: `apps/server/src/channels/application/service/channel-sku-mapping.service.ts`
- Modify: `apps/server/src/channels/application/port/out/repository/channel-sku-mapping.repository.port.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.ts`
- Modify: `apps/server/src/channels/application/service/channel-sku-availability.service.ts`
- Modify: `apps/server/src/channels/adapter/out/inventory/inventory-sku-read.adapter.ts`
- Modify: `packages/shared/src/schemas/channel-sku-matching.ts`
- Modify: `packages/shared/src/schemas/channel-sku-matching.spec.ts`
- Modify: `packages/shared/src/schemas/channel-sku-availability.ts`
- Modify: `packages/shared/src/schemas/channel-sku-availability.spec.ts`

**Step 1: Write failing migration-preservation and automatic-match tests**

`sellpia-cutover-migrations.spec.ts` must create fixtures for UUID collision/no collision, duplicate barcode, null/unknown mapping source, non-positive quantities, ambiguous ProductOption mapping, account mismatch, orphan return, duplicate listing identity, ownerless content, supplier conflict, and rerun idempotency. Assert a complete mapping ledger and equal component multiset after canonicalizing unknown sources to `legacy_migrated`.

The pure matcher tests must encode exactly:

```ts
expect(resolve({ productCode: 'SP-1', barcode: 'B-1' }, activeMasters)).toEqual({
  status: 'matched', source: 'product_code', masterProductId: 'master-code', quantity: 1,
});
expect(resolve({ productCode: null, barcode: 'DUP' }, duplicateBarcodeMasters)).toEqual({
  status: 'needs_review', component: null,
});
expect(resolve({ productCode: null, barcode: null }, activeMasters)).toEqual({
  status: 'unmatched', component: null,
});
```

Add repository tests proving `status-refresh` skips all SKUs with confirmed components and atomically changes both recipe and status for unconfirmed SKUs.

Run:

```bash
rtk npm exec vitest -- run --config scripts/vitest.config.ts scripts/__tests__/sellpia-cutover-migrations.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/channels/domain/channel-sku-automatic-match.spec.ts src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.spec.ts
```

Expected: FAIL until the new migrations and resolver exist.

**Step 2: Build and validate the identity and preservation ledger**

Set `VERSION` to `0.1.9`. `001_build_sellpia_master_identity_map.ts` maps each `(organizationId, InventorySku.sellpiaProductCode)` to one staged Master, reuses the source UUID only when collision-free, preserves source fields/timestamps/import provenance, and blocks unresolved collisions. `002_repoint_channel_sku_components.ts` rejects non-positive quantity, canonicalizes source, fills `masterProductId`, and verifies the component multiset. `003_backfill_final_owner_relations.ts` executes the full preservation matrix for orders, returns, shipment items, unshipped rows, supplier products, PO/picking/transfer/return records, content owners, listings, metrics, and ads; every source row is mapped, explicitly split, or blocks.

Run all migrations twice against the fixture DB. Expected: the second run reports zero new writes and the same audit counts.

**Step 3: Switch Sellpia public contracts from SKU naming to physical Master identity**

Keep the three route paths but return `masterProductId`, `code`, `name`, `optionName`, `barcode`, `currentStock`, `purchasePrice`, `salePrice`, `isActive`, stock value, and import provenance. Keep compatibility TypeScript re-exports in 0.1.9 only; no final 0.1.10 response contains `inventorySkuId`.

The final read port supports tenant-scoped `findByIds`, `findByCodes`, `findByBarcodes`, and `search`, and filters automatic-match candidates to active rows. The import adapter writes staged Masters as the primary representation and does not infer active state from stock.

**Step 4: Switch Wing import, exact matching, and capacity**

Normalize Wing search-attribute pairs into `attributesJson`, preserve all provider columns in `rawJson`, and maintain 1,225 parent/2,241 SKU parsing. Operational accounts require canonical `externalAccountId`; Wing remains `channel='coupang'` and Rocket remains `channel='rocket'`.

Change `POST /api/channels/sku-mappings/status-refresh` into the atomic exact-match pass. Exact unique product code precedes exact unique barcode; conflicts/duplicates become `needs_review`; absence remains `unmatched`; names and fuzzy scores are evidence only. Manual replacement accepts `{ masterProductId, quantity }[]`, enforces positive quantities, and calculates capacity at read time with the minimum floor formula. Unmatched/review capacity is null.

**Step 5: Publish and verify a fresh Sellpia snapshot in every organization**

Deploy the 0.1.9 application with an explicit `snapshot required` state until the operator imports a new complete workbook. For each organization, call the real Sellpia import endpoint after deployment. `004_verify_fresh_sellpia_snapshot.ts` passes only when the completed publication sequence is newer than the recorded 0.1.8 expand point and sets `isActive` strictly from membership in that publication; `005_verify_channel_catalog_cutover.ts` verifies listing/SKU/account identity and recipe/status equivalence.

For the approved clean local source, assert 1,964 active Masters. Do not proceed to application-read verification with a stale snapshot.

**Step 6: Run focused gates**

```bash
rtk npm run test:scripts
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/source-import.spec.ts src/schemas/inventory-snapshot.spec.ts src/schemas/channel-sku-matching.spec.ts src/schemas/channel-sku-availability.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory src/channels
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts
rtk npm run check:idor
rtk npm run check:tenant-scope
```

Expected: all pass; import count is 1,964 on the approved clean fixture; Wing count is 1,225/2,241; mapping partitions sum to 2,241; confirmed components and manual recipes survive recollection.

**Step 7: Commit the 0.1.9 core switch**

```bash
rtk git add VERSION prisma scripts apps/server/src/inventory apps/server/src/channels packages/shared
rtk git commit -m "feat: switch inventory and channel mapping to Sellpia Masters"
```

---

### Task 4: Release 0.1.9 — Switch registration, orders, supply, advertising, analytics, and registered-product reads

**Files — registered listing and content cutover:**

- Modify: `apps/server/src/channels/application/port/out/repository/channel-listing.repository.port.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-listing.repository.adapter.ts`
- Modify: `apps/server/src/channels/application/service/channel-listing-query.service.ts`
- Modify: `apps/server/src/channels/adapter/in/http/channel-listing.controller.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/marketplace-registration.repository.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/out/repository/sourcing-candidate.repository.adapter.ts`
- Modify: `apps/server/src/sourcing/application/port/out/repository/sourcing-candidate.repository.port.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/detail-page-generation.repository.adapter.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/detail-page-query.repository.adapter.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/content-workspace-lifecycle.repository.adapter.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/content-archive.repository.adapter.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/sourcing-workspace-archive.repository.adapter.ts`

**Files — shared and orders:**

- Modify: `packages/shared/src/schemas/order.ts`
- Modify: `packages/shared/src/schemas/order.spec.ts`
- Modify: `apps/server/src/channels/application/port/out/repository/channel-sync.repository.port.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-sync.repository.adapter.ts`
- Modify: `apps/server/src/channels/application/service/channel-sync.service.ts`
- Modify: `apps/server/src/channels/application/port/out/provider/coupang-provider.port.ts`
- Modify: `apps/server/src/channels/adapter/out/coupang/coupang-provider.adapter.ts`
- Modify: `apps/server/src/orders/services/orders.service.ts`
- Modify: `apps/server/src/orders/services/returns.service.ts`
- Modify: `apps/server/src/orders/controllers/orders.controller.ts`
- Modify: `apps/server/src/orders/controllers/returns.controller.ts`
- Modify: `apps/server/src/orders/dto/order-action.dto.ts`
- Modify: `apps/server/src/orders/dto/return-action.dto.ts`
- Modify: `apps/server/src/orders/services/__tests__/order-flow.spec.ts`
- Create: `apps/server/src/channels/__tests__/order-sync.pg.integration.spec.ts`

**Files — supply and physical operations:**

- Modify: `apps/server/src/supply/adapter/in/http/dto/purchase-order-action.dto.ts`
- Modify: `apps/server/src/supply/application/port/out/repository/procurement.repository.port.ts`
- Modify: `apps/server/src/supply/adapter/out/repository/procurement.repository.adapter.ts`
- Modify: `apps/server/src/supply/adapter/out/repository/supplier.repository.adapter.ts`
- Modify: `apps/server/src/supply/application/port/out/runtime/purchase-order-checkout-runtime.port.ts`
- Modify: `apps/server/src/supply/adapter/out/runtime/alibaba-1688-checkout-runtime.adapter.ts`
- Modify: `apps/server/src/supply/__tests__/procurement-flow.spec.ts`
- Modify: `apps/server/src/inventory/adapter/in/http/dto/create-stock-transfer.dto.ts`
- Modify: `apps/server/src/inventory/application/port/in/warehouse/transfers.port.ts`
- Modify: `apps/server/src/inventory/application/port/out/repository/transfers.repository.port.ts`
- Modify: `apps/server/src/inventory/application/service/transfers.service.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/transfers.repository.adapter.ts`
- Modify: `apps/server/src/inventory/application/port/out/repository/picking.repository.port.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/picking.repository.adapter.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/confirmed-orders.repository.adapter.ts`
- Modify: `apps/server/src/inventory/application/port/out/repository/unshipped.repository.port.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/unshipped.repository.adapter.ts`
- Modify: `apps/server/src/orders/return-transfers/dto/create-return-transfer.dto.ts`
- Modify: `apps/server/src/orders/return-transfers/return-transfers.service.ts`
- Modify: `apps/server/src/analytics/supplier-stats/supplier-stats.service.ts`
- Modify: `packages/shared/src/schemas/supplier-stats.ts`

**Files — advertising, analytics, and dashboard:**

- Modify: `packages/shared/src/schemas/ads.ts`
- Create: `packages/shared/src/schemas/ads.spec.ts`
- Modify: `packages/shared/src/schemas/dashboard.ts`
- Modify: `packages/shared/src/schemas/dashboard.spec.ts`
- Modify: `packages/shared/src/schemas/statistics.ts`
- Modify: `apps/server/src/advertising/domain/listing-match.ts`
- Modify: `apps/server/src/advertising/application/port/out/repository/ad-listing.repository.port.ts`
- Modify: `apps/server/src/advertising/adapter/out/repository/ad-listing.repository.adapter.ts`
- Modify: `apps/server/src/advertising/adapter/out/repository/ad-strategy-context.repository.adapter.ts`
- Modify: `apps/server/src/advertising/application/port/out/repository/channel-scrape.repository.port.ts`
- Modify: `apps/server/src/advertising/application/port/out/repository/channel-option-daily.repository.port.ts`
- Modify: `apps/server/src/advertising/application/port/out/repository/channel-target-daily.repository.port.ts`
- Modify: `apps/server/src/advertising/adapter/out/repository/channel-scrape.repository.adapter.ts`
- Modify: `apps/server/src/advertising/adapter/out/repository/channel-option-daily.repository.adapter.ts`
- Modify: `apps/server/src/advertising/adapter/out/repository/channel-target-daily.repository.adapter.ts`
- Modify: `apps/server/src/advertising/application/service/ad-budget-allocator.service.ts`
- Modify: `apps/server/src/advertising/application/service/ad-grade-rules.service.ts`
- Modify: `apps/server/src/advertising/application/service/ad-exposure.service.ts`
- Modify: `apps/server/src/advertising/domain/model/strategy-types.ts`
- Modify: `apps/server/src/advertising/domain/strategy-context.ts`
- Modify: `apps/server/src/analytics/dashboard/adapter/out/repository/dashboard-sales.repository.adapter.ts`
- Modify: `apps/server/src/analytics/dashboard/adapter/out/repository/dashboard-inventory.repository.adapter.ts`
- Modify: `apps/server/src/analytics/dashboard/adapter/out/repository/profit-calculation.repository.adapter.ts`
- Modify: `apps/server/src/analytics/dashboard/application/service/dashboard-inventory.service.ts`
- Modify: `apps/server/src/analytics/statistics/statistics.service.ts`
- Modify: `apps/server/src/analytics/traffic/traffic.service.ts`
- Modify: `apps/server/src/common/per-listing-profit.ts`

**Step 1: Write failing owner/account integration tests**

Add tests proving:

- registered-listing queries include every active `ChannelListing`, including no-mapping/no-content rows, and never filter on `masterId`;
- a candidate leaves the active collected list after its first successful listing but remains historical and can prepare another account;
- order/return upserts are unique by account and reject cross-account option links;
- shipment items belong to lines of the shipment order and unshipped rows belong to one order line;
- PO, supplier, picking, transfer, and return records reference tenant-owned Masters and do not alter current stock;
- ad/scrape facts contain listing/listing-option/account identity and no ProductOption identity;
- dashboard inventory reads active Sellpia Masters, exposes matched/unmatched/review counts, and uses listing IDs for Top products;
- effective cost respects `costPriceOverride`, otherwise component purchase cost, and preserves unknown rather than coercing zero.

Run:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/order.spec.ts src/schemas/ads.spec.ts src/schemas/dashboard.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/orders src/supply src/inventory src/advertising src/analytics src/channels src/sourcing src/ai
```

Expected: FAIL on legacy platform/master/option/InventorySku reads.

**Step 2: Make listing identity the registered-product and content owner**

Delete the Master grouping from the active service surface. `ChannelListingQueryService.list` returns one item per listing with account-derived channel, child options, aggregate mapping state, current listing workspace, current thumbnail, and current detail page. `getById(organizationId, listingId)` is the only detail lookup. Keep old `/groups` code physically present but unwired until 0.1.10.

Candidate list logic is `status='sourced' AND channelListings.none` for the active inbox and includes per-account preparation summaries. Generation groups now use `contentWorkspaceId`; listing registration branches content using the source workspace and listing ID. Existing KidItem thumbnail/detail rows appear through the workspace projection without a Wing content import.

**Step 3: Rewire orders and returns to account-scoped listing options**

Use:

```ts
syncSingleOrder(organizationId: string, channelAccountId: string, payload: CoupangSyncOrderPayload): Promise<void>;
syncSingleReturn(organizationId: string, channelAccountId: string, payload: CoupangSyncReturnPayload): Promise<void>;
```

Upsert orders by `(organizationId, channelAccountId, externalOrderId)` and returns by their account-scoped external identity. Remove service dependence on `platform`, parent `listingId`, and `optionId`. Preserve line-time product/option/SKU/price snapshots; unresolved incoming SKUs remain reviewable with null `listingOptionId`. Add order-level shipments plus `ShipmentItem`; make unshipped rows line-owned. All provider actions receive a real account ID rather than silently choosing a primary account.

**Step 4: Rewire supply and record-only operations to physical Masters**

Merge `SupplierProduct` and `MasterSupplierProduct` policy into the target `SupplierProduct` columns while retaining both legacy tables through 0.1.9. PO items, picking items, transfers, and return transfers populate `masterProductId`; child records gain explicit `organizationId` where required. Completion/receipt actions record workflow state only and assert `MasterProduct.currentStock` is unchanged.

Supplier statistics traverse `SupplierProduct.masterProductId <- ChannelSkuComponent.masterProductId <- OrderLineItem.listingOptionId`. Physical units equal line quantity times component quantity. Attribute bundle revenue to primary suppliers by deterministic extended-cost weights; put lines with missing weights/primary supplier into `unallocatedRevenue` and never double count.

**Step 5: Rewire ad, analytics, dashboard, and product-management projections**

All scrape/ad matches return `{ listingId, listingOptionId }`; account KPI and scrape runs require `channelAccountId`. Strategy reads listing-owned grade/tier/health and SKU-owned commission/shipping/other cost, with physical derived cost from recipes. Delete the Master-compatibility read behavior and replace its test with a listing-owned projection test.

Top products group by listing ID. Registered totals count active listings. Inventory zero count reads active physical Masters. Statistics repeat-product identity is the listing, not physical Master. Rewire `/product-hub` backend reads to the same listing projection and restrict writes to listing/SKU operational fields; no general endpoint can edit Sellpia-owned Master fields.

**Step 6: Run PG integration, tenant, build, and boot gates**

```bash
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/order-sync.pg.integration.spec.ts src/inventory/__tests__/stock-transfers-tenant-boundary.pg.integration.spec.ts src/inventory/__tests__/unshipped.repository.pg.integration.spec.ts src/analytics/dashboard/__tests__/dashboard-inventory.pg.integration.spec.ts src/analytics/supplier-stats/__tests__/supplier-stats-flow.pg.integration.spec.ts src/advertising/__tests__/ad-sync-flow.pg.integration.spec.ts src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run check:conventions
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run dev:server
```

Expected: all tests/scanners/builds pass and Nest boots. Confirm no order, return, supply, content, ad, or analytics write changes current stock.

**Step 7: Commit the 0.1.9 server-consumer switch**

```bash
rtk git add apps/server packages/shared prisma scripts VERSION docs/ARCHITECTURE.md
rtk git commit -m "refactor: move operations to listing and Sellpia Master owners"
```

---

### Task 5: Release 0.1.9 — Cut over every existing screen, import the approved files, and ship the switch release

**Files — collected and registered products:**

- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api.spec.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/components/list/ProductCard.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/components/list/ProductCard.spec.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/components/list/SourcingStatusBadge.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/page.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/workspace/detail/ProductEditHeader.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/workspace/marketplace/MarketplaceRegistrationDialog.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/workspace/marketplace/MarketplaceRegistrationDialog.spec.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/workspace/ProductWorkspaceScreen.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/workspace/ProductTabContent.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/hooks/useProductDetail.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/workspace/thumbnail/ThumbnailWorkspaceTab.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api.spec.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/page.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/components/RegisteredListingCard.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/components/RegisteredListingCard.spec.tsx`
- Rename: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/[workspaceId]/page.tsx` -> `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/[listingId]/page.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/lib/product-pipeline-routes.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/lib/product-pipeline-routes.spec.ts`
- Delete: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/components/RegisteredProductGroupCard.tsx`
- Delete: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/components/RegisteredProductGroupCard.spec.tsx`

**Files — inventory, matching, stock ops, dashboard, orders, and ads:**

- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/lib/query-keys.spec.ts`
- Modify: `apps/web/src/app/(inventory)/_shared/inventory-api.ts`
- Modify: `apps/web/src/app/(inventory)/_shared/inventory-api.test.ts`
- Modify: `apps/web/src/app/(inventory)/inventory/page.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory/components/InventoryTable.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory/components/InventorySummaryCards.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/page.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryImport.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryImport.test.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaImportHistory.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/components/StockAssets.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/components/ChannelAvailability.tsx`
- Delete: `apps/web/src/app/(inventory)/stock-ops/components/InventorySkuPicker.tsx`
- Delete: `apps/web/src/app/(inventory)/stock-ops/components/InventorySkuPicker.spec.tsx`
- Create: `apps/web/src/app/(inventory)/stock-ops/components/MasterProductPicker.tsx`
- Create: `apps/web/src/app/(inventory)/stock-ops/components/MasterProductPicker.spec.tsx`
- Modify: `apps/web/src/app/(inventory)/stock-ops/page.tsx`
- Modify: `apps/web/src/app/(inventory)/stock-ops/components/StockTransfers.tsx`
- Modify: `apps/web/src/app/(inventory)/stock-ops/components/ReturnTransfers.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/hooks/useChannelSkuMappings.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuMappingTable.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuComponentDialog.tsx`
- Create: `apps/web/src/app/(analytics)/dashboard/components/DashboardInventoryOverview.tsx`
- Create: `apps/web/src/app/(analytics)/dashboard/components/DashboardInventoryOverview.spec.tsx`
- Modify: `apps/web/src/app/(analytics)/dashboard/page.tsx`
- Modify: `apps/web/src/app/(analytics)/dashboard/components/DashboardTopProducts.tsx`
- Modify: `apps/web/src/app/(orders)/orders/hooks/useOrderActions.ts`
- Modify: `apps/web/src/app/(orders)/orders/lib/order-pipeline.ts`
- Modify: `apps/web/src/app/(orders)/returns/page.tsx`
- Modify: `apps/web/src/app/(orders)/returns/components/ReturnsTables.tsx`
- Modify: `apps/web/src/app/(orders)/order-status-hub/lib/orders-api.ts`
- Modify: `apps/web/src/app/(finance)/supplier-hub/components/SupplierProductSales.tsx`
- Modify: `apps/web/src/app/(finance)/supplier-hub/lib/supplier-stats-api.ts`
- Modify: `apps/web/src/app/(advertising)/ad-ops/components/StrategyContent.tsx`

**Step 1: Write failing route/API/render tests**

Cover canonical listing route identity, no grouped API, per-account preparation state, retry/error UI, current/no-content states, active/inactive inventory filter, Master component payloads, null unmatched capacity, account-scoped order actions, listing-based dashboard links, and listing-owned ad strategy shape.

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run "src/app/(product-pipeline)" "src/app/(inventory)" "src/app/(catalog)/product-hub/matching" "src/app/(analytics)/dashboard" "src/app/(orders)" "src/app/(finance)/supplier-hub" "src/app/(advertising)/ad-ops"
```

Expected: FAIL on legacy group/workspace/master/InventorySku contracts.

**Step 2: Switch collected and registered experiences**

Collected API/UI exposes a candidate source workspace plus `preparations[]` by account. “제품 등록” selects one real Wing or Rocket account, creates a draft from current registration input/content selections, and submits by preparation ID. It never asks for a Master ID or manually supplied external listing ID.

Registered list renders `ChannelListing` items directly. Detail navigation is always `/product-pipeline/registered-products/:listingId`; fetch the listing first and then its listing workspace. Remove candidate/workspace/Master polymorphic guessing. Render explicit no-content and no-mapping states.

**Step 3: Switch inventory, matching, stock-ops, dashboard, order, supplier, and ad screens**

Use `masterProductId/code` throughout physical inventory and mapping APIs. Add `activeStatus = all|active|inactive`; default operational zero-stock/value views use active rows, with inactive rows explicitly filterable. Remove all direct stock controls. Record-only transfer/return actions invalidate their record lists but never pretend to update snapshot stock.

Matching groups by listing and sellable SKU, shows exact evidence/status/component stock/quantity/read-time capacity, and keeps operator recipes after recollection. Dashboard uses the same listing/Master owners, links Top products by listing ID, and displays unmatched/review counts separately. Order actions group or reject cross-account selections. Ads and supplier stats consume the final listing/commercial and physical-unit projections.

**Step 4: Run web build and targeted tests**

```bash
rtk npm exec --workspace=apps/web vitest -- run "src/app/(product-pipeline)" "src/app/(inventory)" "src/app/(catalog)/product-hub" "src/app/(analytics)/dashboard" "src/app/(orders)" "src/app/(finance)/supplier-hub" "src/app/(advertising)/ad-ops"
rtk npm run build --workspace=apps/web
```

Expected: all tests pass and Next.js builds with the renamed dynamic route.

**Step 5: Rebuild only the verified local database and import through real application paths**

First use the local-target guard in `bootstrap-authoritative-inventory-dev.ts`; it must reject any non-loopback host or database name containing staging/production. Then reset only the verified local DB, apply schema, create deterministic dev organization/account metadata, and start server/web:

```bash
rtk npx prisma db push --force-reset
rtk npx prisma generate
rtk npm run inventory:bootstrap:dev -- --organization-id 00000000-0000-4000-8000-000000000001 --organization-name "KidItem Dev" --organization-slug kiditem-dev
rtk npm run dev:server
rtk npm run dev
```

Using the actual UI/API with the authenticated dev organization, import Sellpia first from `docs/references/exported-list (3).xls`, then Wing from `docs/references/Coupang_detailinfo_260711.xlsx` into the `coupang` account. Do not copy either workbook into migrations or fixtures.

Expected clean counts: 1,964 active Masters, 1,225 listings, 2,241 sellable SKUs. Mapping partitions must sum to 2,241.

**Step 6: Perform live browser acceptance**

Before browser work, read and use the `browse` skill. Verify:

- `/inventory-hub?tab=sellpia-sync`: import, idempotent re-import, history, freshness, and 1,964 active Masters;
- `/inventory`: duplicate barcodes remain separate, exact code search, pagination, active/inactive/null-price states, no stock mutation controls;
- `/product-hub/matching`: exact mapping, duplicate review, unmatched null capacity, eight-pack quantity 8, mixed bundle bottleneck, and recipe preservation after Wing recollection;
- `/stock-ops`: zero stock, mapping attention, capacity/value/freshness, transfer/return record creation with unchanged snapshot stock;
- `/product-pipeline/collected-products`: per-account preparation, failure/retry, first-listing exit from active list, source content retained;
- `/product-pipeline/registered-products` and `/:listingId`: one card per listing, options, mapping, thumbnail/detail when present, explicit empty states when absent;
- `/dashboard`: listing totals, active Sellpia zero count, unmatched/review counts, listing-based Top product navigation;
- order/return actions: account-correct requests and safe cross-account rejection;
- browser console/network: no schema parse error, tenancy leak, or 500 response.

**Step 7: Commit, review once, and ship 0.1.9**

```bash
rtk git add apps/web apps/server packages/shared prisma scripts VERSION docs/ARCHITECTURE.md
rtk git commit -m "feat: cut over product and operations screens to listing owners"
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

Perform one consolidated 0.1.9 review, verify the live PR body after creation/editing, merge/deploy through GitHub Actions, publish a fresh Sellpia snapshot for every shared organization, and retain legacy tables for rollback observation. Do not begin 0.1.10 until runtime legacy-reader/writer counters are zero.

---

### Task 6: Release 0.1.10 — Prove zero legacy use, remove duplicate identities, regenerate artifacts, and verify the final schema

**Files — contract migrations and scanners:**

- Modify: `VERSION`
- Create: `scripts/data-migrations/v0.1.10/001_assert_sellpia_contract_ready.ts`
- Create: `scripts/data-migrations/v0.1.10/002_record_sellpia_contract.ts`
- Create: `scripts/check-sellpia-contract-consumers.mjs`
- Create: `scripts/__tests__/check-sellpia-contract-consumers.test.mjs`
- Modify: `scripts/check-sellpia-db-push-warning.mjs`
- Modify: `scripts/__tests__/check-sellpia-db-push-warning.test.mjs`
- Modify: `scripts/data-migrations/index.ts`
- Modify: `scripts/__tests__/run-data-migrations.spec.ts`
- Modify: `scripts/check-script-inventory.mjs`
- Modify: `scripts/__tests__/check-script-inventory.test.mjs`
- Modify: `.github/workflows/staging-deploy.yml`
- Modify: `.github/workflows/production-deploy.yml`

**Files — final schema and compatibility removal:**

- Modify: `prisma/models/core.prisma`
- Modify: `prisma/models/inventory.prisma`
- Modify: `prisma/models/channels.prisma`
- Modify: `prisma/models/sourcing.prisma`
- Modify: `prisma/models/ai.prisma`
- Modify: `prisma/models/orders.prisma`
- Modify: `prisma/models/supply.prisma`
- Modify: `prisma/models/advertising.prisma`
- Modify: `prisma/models/finance.prisma`
- Delete: `apps/server/src/inventory/application/port/in/stock/inventory-sku-read.port.ts`
- Delete: `apps/server/src/inventory/application/port/out/repository/inventory-sku-read.repository.port.ts`
- Delete: `apps/server/src/inventory/application/service/inventory-sku-read.service.ts`
- Delete: `apps/server/src/inventory/adapter/out/repository/inventory-sku-read.repository.adapter.ts`
- Delete: `apps/server/src/inventory/application/port/out/repository/inventory-sku-import.repository.port.ts`
- Delete: `apps/server/src/inventory/adapter/out/repository/inventory-sku-import.repository.adapter.ts`
- Delete: `apps/server/src/sourcing/application/service/sourcing-promotion.service.ts`
- Delete: `apps/server/src/sourcing/adapter/out/products/products-catalog.adapter.ts`
- Delete: `apps/server/src/sourcing/application/port/out/cross-domain/products-catalog.port.ts`
- Delete: `apps/server/src/sourcing/__tests__/promotion.pg.integration.spec.ts`
- Delete: `apps/server/src/ai/adapter/in/http/content-workspace-attachment.controller.ts`
- Delete: `apps/server/src/ai/application/service/content-workspace-attachment.service.ts`
- Delete: `apps/server/src/ai/application/port/out/repository/content-workspace-attachment.repository.port.ts`
- Delete: `apps/server/src/ai/adapter/out/repository/content-workspace-attachment.repository.adapter.ts`
- Delete: `apps/server/src/ai/application/service/post-promotion-ai.service.ts`
- Delete: `apps/server/src/ai/application/port/in/generation/post-promotion-ai-trigger.port.ts`
- Delete: `apps/server/src/ai/application/port/out/repository/post-promotion-generation.repository.port.ts`
- Delete: `apps/server/src/ai/adapter/out/repository/post-promotion-generation.repository.adapter.ts`
- Delete: `apps/server/src/ai/application/port/out/repository/product-workspace-group.repository.port.ts`
- Delete: `apps/server/src/ai/adapter/out/repository/product-workspace-group.repository.adapter.ts`
- Delete: `apps/server/src/products/products.module.ts`
- Modify: `apps/server/src/app.module.ts`
- Modify: `apps/server/src/channels/channels.module.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`

**Files — contracts, UI compatibility, and generated documentation:**

- Modify: `packages/shared/src/schemas/product.ts`
- Modify: `packages/shared/src/schemas/product.spec.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Modify: `packages/shared/src/index.ts`
- Delete: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/content-workspace-view.ts`
- Delete: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/content-workspace-view.spec.ts`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ERD.md`
- Modify: `docs/erd/core.md`
- Modify: `docs/erd/inventory.md`
- Modify: `docs/erd/channels.md`
- Modify: `docs/runbooks/channel-sellpia-matching.md`
- Modify: `docs/runbooks/sellpia-rocket-inventory-sync.md`
- Modify: `docs/DEV_DATA_BUNDLES.md`
- Regenerate: `graphify-out/schema/graph.json`
- Regenerate: `graphify-out/schema/graph.html`
- Regenerate: `graphify-out/schema/GRAPH_REPORT.md`
- Regenerate: `graphify-out/schema-consumers/graph.json`
- Regenerate: `graphify-out/schema-consumers/graph.html`
- Regenerate: `graphify-out/schema-consumers/GRAPH_REPORT.md`

**Step 1: Write the failing zero-consumer and destructive-warning gates**

The consumer scanner must reject executable references to final-obsolete identifiers outside versioned migrations and historical docs: `InventorySku`, `inventorySkuId`, `ProductOption`, `optionId` when it means internal ProductOption, `BundleComponent`, `MasterCodeCounter`, `MasterProductImage`, `MasterSupplierProduct`, reconciliation models, grouped listing APIs, candidate `promoted`/`promotedMasterId`, Master-target content, and the deprecated `/promote` route.

The readiness migration requires:

- a fresh 0.1.9 Sellpia publication per organization;
- one ledger target per legacy InventorySku;
- preserved component multiset;
- zero null/mismatched final account relations;
- every retained order/supplier/content/metric row accounted for;
- zero runtime reads/writes of legacy tables since the observation timestamp;
- no active compatibility route callers.

Run and confirm failure before cleanup:

```bash
rtk node --test scripts/__tests__/check-sellpia-contract-consumers.test.mjs scripts/__tests__/check-sellpia-db-push-warning.test.mjs
rtk npm exec vitest -- run --config scripts/vitest.config.ts scripts/__tests__/run-data-migrations.spec.ts
```

**Step 2: Apply the final minimal schema**

Set `VERSION` to `0.1.10`. Rename the staged Sellpia identity to final `MasterProduct.code/name/barcode`, make `currentStock` and `isActive` required, and retain only the approved physical fields and relations. Remove `InventorySku`, its migration map, `ProductOption`, `BundleComponent`, `MasterCodeCounter`, `MasterProductImage`, `MasterSupplierProduct`, and reconciliation models.

Require `ChannelListing.channelAccountId`; remove listing `masterId`, duplicated `channel`, parent `channelPrice`, and soft-delete identity semantics. Require `ChannelSkuComponent.masterProductId` and `mappingSource`; remove `inventorySkuId`. Remove option `optionId`, `channelAccountId`, and `isUnmatched`. Remove old account/platform/owner columns from orders, returns, shipments, content, preparations, snapshots, and metrics only after the readiness migration passes.

Capture `prisma db push` refusal output against a preservation-complete clone, normalize each warning signature, and hard-code only the reviewed drops/renames in `check-sellpia-db-push-warning.mjs`. Any extra warning remains a release blocker.

**Step 3: Remove legacy services and the product-family module**

Remove the listed promotion/attachment/post-promotion/group/InventorySku stacks and their tests/exports. Remove all non-category product-family CRUD, option, bundle, image, code allocator, product-management, and promotion files under `apps/server/src/products/`; keep only `AGENTS.md`, `CLAUDE.md`, and `categories/`. Import `CategoriesModule` directly from `app.module.ts`. Channels, sourcing, inventory, and AI must use their final focused ports and no longer import `ProductsModule`.

Delete `POST /api/sourcing/candidates/:id/promote`, `POST /api/channels/listings/confirmed`, `/api/channels/listings/groups`, old polymorphic registered-product helpers, compatibility shared aliases, and all web calls/tests for them.

**Step 4: Regenerate and run every project gate**

```bash
rtk npm run test:scripts
rtk npm run check:conventions
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run db:erd
rtk npm run graphify:schema
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm exec --workspace=apps/server vitest -- run src/inventory src/channels src/sourcing src/ai src/orders src/supply src/advertising src/analytics
rtk npm run build --workspace=apps/server
rtk npm run dev:server
rtk npm exec --workspace=apps/web vitest -- run
rtk npm run build --workspace=apps/web
```

Expected: all pass; Nest boots; generated ERD/Graphify contain no obsolete model; final shared/web builds contain no compatibility type.

**Step 5: Verify a clean final local rebuild and browser flows once more**

Against a verified loopback-only DB, repeat the Task 5 reset and real Sellpia-then-Wing imports after the final schema is applied. Reassert 1,964/1,225/2,241, idempotent re-import, recipe preservation, null unmatched capacity, listing content/empty states, and no stock mutation from any operational record. Re-run the full Task 5 browser matrix with a clean console/network log.

**Step 6: Commit, review, and ship the contract release**

```bash
rtk git add VERSION prisma scripts apps/server apps/web packages/shared docs graphify-out
rtk git commit -m "refactor: contract legacy product and inventory identities"
```

Perform one consolidated 0.1.10 review. Verify the live PR body, CI, migration reports, exact destructive-warning allowlist, and generated artifacts before merge/deploy. The release is complete only after shared environments report zero legacy rows requiring preservation and the final browser smoke passes.

## Final Acceptance Summary

- One active Sellpia workbook row equals one `MasterProduct`; equal names/barcodes never merge codes.
- Only a completed serialized Sellpia full snapshot changes physical stock or active membership.
- Wing and Rocket are separate ChannelAccounts using the same listing/SKU/component/content model.
- One listing option may consume one or more Masters at positive quantities; an eight-pack uses quantity 8 and has no separate bundle stock.
- Automatic mapping is exact-code then unique-barcode only; manual recipes are never overwritten.
- Registered identity is `ChannelListing`, source identity is `SourcingCandidate`, content identity is `ContentWorkspace`.
- Existing inventory, stock-ops, dashboard, matching, collected, registered, order, supplier, and ad screens read the new owners.
- Persistent rollout is 0.1.8 expand -> 0.1.9 backfill/fresh snapshot/switch -> 0.1.10 contract, with a separate `VERSION`, durable migrations, PR, deployment, and evidence at each step.
