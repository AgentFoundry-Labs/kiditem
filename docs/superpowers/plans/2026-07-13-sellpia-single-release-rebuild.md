# Sellpia Single-Release Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the final Sellpia-owned `MasterProduct` and account-scoped channel product model as one 0.1.8 release, rebuild every database, and recreate operational data by importing Sellpia before Wing.

**Architecture:** Prisma contains only the final owners: `MasterProduct` for physical Sellpia inventory, `ChannelAccount -> ChannelListing -> ChannelListingOption` for marketplace metadata, `ChannelSkuComponent` for positive-quantity recipes, and `ContentWorkspace` for sourced/listing content. No legacy inventory/product row is migrated or dual-written. Before the reset, approved Coupang provider metadata and scrape facts are selectively exported without credentials or personal data; after Sellpia and Wing imports, they are replayed through the existing authenticated ingest path.

**Tech Stack:** Prisma 7/PostgreSQL, NestJS, Zod, Next.js/React Query, Vitest, GitHub Actions, XLS/XLSX import.

## Global Constraints

- The approved authority is `docs/superpowers/specs/archive/2026-07-12-sellpia-authoritative-inventory-cutover-design.md` as amended on 2026-07-13.
- `develop` is the 0.1.7 base and the complete reconstruction ships as root `VERSION` 0.1.8.
- Legacy `InventorySku`, `ProductOption`, mapping, and family-Master data is intentionally discarded; do not implement identity maps, in-place row backfills, dual writes, or rollback compatibility.
- Preserve existing Coupang provider metadata and scrape facts by selective export/replay into final owners; never carry encrypted account config, tokens, order/review personal data, or legacy inventory/mapping identities.
- Do not stage, rename, delete, copy, or embed any workbook under `docs/references/`.
- Sellpia import is the only writer of `MasterProduct.currentStock`, Sellpia prices, active membership, raw source JSON, and import provenance.
- Channel imports never write stock, confirmed recipes, source-candidate provenance, current content selections, or KidItem-authored commercial fields.
- Wing is `channel = "coupang"`; Rocket is an independent `channel = "rocket"` account.
- A channel SKU recipe contains one or more positive-quantity Master components; bundles have no independent stock.
- Every mutation receives `organizationId` from authenticated server context and every cross-model organization relation is tenant-safe.
- The existing develop-branch screen hierarchy and light theme remain; screens change data sources, not their established information architecture.
- Shared resets run only through GitHub Actions with an explicit destructive-reset input and verified target environment.

---

### Task 1: Make the final schema and reset contract self-contained

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
- Modify: `scripts/data-migrations/index.ts`
- Modify: `scripts/data-migrations/README.md`
- Modify: `scripts/__tests__/run-data-migrations.spec.ts`
- Delete: `scripts/data-migrations/v0.1.9/001_build_sellpia_master_identity_map.ts`
- Delete: `scripts/data-migrations/v0.1.9/002_repoint_channel_sku_components.ts`
- Delete: `scripts/data-migrations/v0.1.9/003_backfill_final_owner_relations.ts`
- Delete: `scripts/data-migrations/v0.1.9/004_verify_fresh_sellpia_snapshot.ts`
- Delete: `scripts/data-migrations/v0.1.9/005_verify_channel_catalog_cutover.ts`
- Delete: `scripts/__tests__/sellpia-cutover-migrations.spec.ts`
- Modify: `scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs`
- Delete or rewrite: `scripts/__tests__/sellpia-master-expand-contract.test.mjs`

**Interfaces:**

- Produces: root `VERSION = 0.1.8`, final-only Prisma schema, zero preservation migrations, and a reset contract that refuses implicit destructive execution.
- Removes: `InventorySku`, `InventorySkuMasterProductMap`, `ProductOption`, `BundleComponent`, `MasterCodeCounter`, `MasterProductImage`, `MasterSupplierProduct`, reconciliation models, and staged/legacy columns.

- [ ] **Step 1: Make the final-schema contract test fail on every legacy owner**

```js
assert.doesNotMatch(schema, /model InventorySku\b/);
assert.doesNotMatch(schema, /model ProductOption\b/);
assert.doesNotMatch(schema, /inventorySkuId/);
assert.match(schema, /model MasterProduct[\s\S]*currentStock\s+Int/);
assert.match(schema, /model ChannelSkuComponent[\s\S]*masterProductId\s+String/);
assert.equal(version.trim(), '0.1.8');
```

- [ ] **Step 2: Run the contract tests and confirm RED**

```bash
rtk node --test scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs
rtk npm exec vitest -- run --config scripts/vitest.config.ts scripts/__tests__/run-data-migrations.spec.ts
```

Expected: fail while legacy/staged schema or v0.1.9 preservation registrations remain.

- [ ] **Step 3: Apply the final schema directly**

```prisma
model MasterProduct {
  id             String  @id @default(uuid()) @db.Uuid
  organizationId String  @map("organization_id") @db.Uuid
  code           String
  name           String
  currentStock   Int     @default(0) @map("current_stock")
  isActive       Boolean @default(true) @map("is_active")

  @@unique([organizationId, code])
  @@unique([id, organizationId])
}
```

Remove preservation-only migration registrations and keep only migrations that initialize new baseline metadata without reading legacy product data.

- [ ] **Step 4: Verify schema generation and shared contracts**

```bash
rtk npm run test:scripts
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
```

Expected: all commands exit 0 against the verified disposable local database.

- [ ] **Step 5: Commit the schema/reset contract**

```bash
rtk git add VERSION prisma scripts docs/superpowers
rtk git commit -m "refactor: adopt final Sellpia schema for rebuild"
```

Do not stage `docs/references/` or `.understand-anything/`.

---

### Task 2: Remove dual-write compatibility and finish the server owner cutover

**Files:**

- Modify: `packages/shared/src/schemas/inventory-snapshot.ts`
- Modify: `packages/shared/src/schemas/source-import.ts`
- Modify: `packages/shared/src/schemas/channel-sku-matching.ts`
- Modify: `packages/shared/src/schemas/channel-sku-availability.ts`
- Modify: `packages/shared/src/schemas/order.ts`
- Modify: `packages/shared/src/schemas/dashboard.ts`
- Modify: `packages/shared/src/schemas/supplier-stats.ts`
- Modify: `apps/server/src/inventory/`
- Modify: `apps/server/src/channels/`
- Modify: `apps/server/src/orders/`
- Modify: `apps/server/src/supply/`
- Modify: `apps/server/src/advertising/`
- Modify: `apps/server/src/analytics/`
- Modify: `apps/server/src/sourcing/`
- Modify: `apps/server/src/ai/`

**Interfaces:**

- Produces: public Sellpia routes returning `masterProductId/code`; exact automatic mapping; manual `{ masterProductId, quantity }[]` recipes; account-scoped order and listing owners.
- Removes: final runtime reads/writes of `InventorySku`, `ProductOption`, family Master grouping, legacy promotion, and dual-write repositories.

- [ ] **Step 1: Add or retain failing behavior tests**

```ts
expect(resolveAutomaticMatch(input, masters)).toEqual({
  status: 'matched',
  source: 'product_code',
  masterProductId: 'master-1',
  quantity: 1,
});
expect(projectChannelSkuSellableStock([{ currentStock: 80, quantity: 8 }])).toBe(10);
```

Tests also prove that Sellpia import deactivates unseen Masters, channel recollection preserves confirmed recipes, and transfer/order/supply operations do not change `currentStock`.

- [ ] **Step 2: Run focused tests and confirm remaining failures**

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/inventory-snapshot.spec.ts src/schemas/source-import.spec.ts src/schemas/channel-sku-matching.spec.ts src/schemas/channel-sku-availability.spec.ts src/schemas/order.spec.ts src/schemas/dashboard.spec.ts src/schemas/supplier-stats.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory src/channels src/orders src/supply src/advertising src/analytics src/sourcing src/ai
```

- [ ] **Step 3: Remove compatibility implementations and finish final ports**

```ts
export interface SellpiaMasterProductReadPort {
  findByIds(organizationId: string, ids: string[]): Promise<SellpiaMasterProductRow[]>;
  findByCodes(organizationId: string, codes: string[]): Promise<SellpiaMasterProductRow[]>;
  findByBarcodes(organizationId: string, barcodes: string[]): Promise<SellpiaMasterProductRow[]>;
  search(organizationId: string, query: string, limit: number): Promise<SellpiaMasterProductRow[]>;
}
```

Only the Sellpia importer binds the stock writer. All other domains consume read ports or listing/option identifiers.

- [ ] **Step 4: Run integration, tenancy, build, and boot gates**

```bash
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts src/channels/__tests__/order-sync.pg.integration.spec.ts
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run build --workspace=apps/server
rtk npm run dev:server
```

Expected: all tests/scanners/builds pass and Nest boots without unresolved providers. Stop the server after the boot check.

- [ ] **Step 5: Commit the server cutover**

```bash
rtk git add apps/server packages/shared
rtk git commit -m "refactor: move runtime owners to Sellpia Masters"
```

---

### Task 3: Bind the restored develop UI to final contracts

**Files:**

- Modify: `apps/web/src/app/(inventory)/`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/`
- Modify: `apps/web/src/app/(analytics)/dashboard/`
- Modify: `apps/web/src/app/(orders)/`
- Modify: `apps/web/src/app/(finance)/supplier-hub/`
- Modify: `apps/web/src/app/(advertising)/ad-ops/`
- Create: `apps/web/src/app/(inventory)/stock-ops/components/SellpiaMasterProductPicker.tsx`
- Create: `apps/web/src/app/(inventory)/stock-ops/components/SellpiaMasterProductPicker.spec.tsx`
- Delete: `apps/web/src/app/(inventory)/stock-ops/components/InventorySkuPicker.tsx`
- Delete: `apps/web/src/app/(inventory)/stock-ops/components/InventorySkuPicker.spec.tsx`

**Interfaces:**

- Consumes: `masterProductId/code`, listing identity, nullable channel capacity, listing-owned content.
- Preserves: develop screen hierarchy, labels, table/card composition, and light-only theme.

- [ ] **Step 1: Run focused UI contracts and confirm failures before cleanup**

```bash
rtk npm exec --workspace=apps/web vitest -- run "src/app/(inventory)" "src/app/(catalog)/product-hub/matching" "src/app/(product-pipeline)" "src/app/(analytics)/dashboard" "src/app/(orders)" "src/app/(finance)/supplier-hub" "src/app/(advertising)/ad-ops"
```

- [ ] **Step 2: Remove legacy UI payloads and keep established layout**

```ts
export type ComponentDraft = {
  masterProductId: string;
  quantity: number;
};
```

No UI renders a stock mutation control. Registered-product navigation uses only listing IDs. Missing content and unmatched capacity render explicit empty/unknown states.

- [ ] **Step 3: Run the complete web suite and production build**

```bash
rtk npm exec --workspace=apps/web vitest -- run
rtk npm run build --workspace=apps/web
```

Expected: all tests pass and Next.js builds with no dark-theme regression.

- [ ] **Step 4: Commit the final UI bindings**

```bash
rtk git add apps/web
rtk git commit -m "refactor: bind restored operations UI to final owners"
```

---

### Task 4: Add the guarded rebuild path and verify real imports

**Files:**

- Modify: `.github/workflows/staging-deploy.yml`
- Modify: `.github/workflows/production-deploy.yml`
- Modify: `docs/runbooks/deployment-architecture.md`
- Modify: `docs/runbooks/environment-variables.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ERD.md`
- Regenerate: `graphify-out/schema/`
- Regenerate: `graphify-out/schema-consumers/`

**Interfaces:**

- Produces: explicit environment reset input, target verification, selective Coupang scrape export/replay, baseline authentication/account bootstrap, `snapshot required` readiness, and operator import instructions.
- Never embeds or stages the source workbooks.

- [ ] **Step 1: Add a failing workflow contract test**

The test asserts a shared-environment reset cannot run unless the workflow dispatch input is exactly `RESET_<ENVIRONMENT>_DATA` and the selected GitHub Environment matches the deployment target.

- [ ] **Step 2: Implement the guarded GitHub Actions reset sequence**

```text
verify explicit reset input
-> export approved Coupang run/snapshot/daily-fact payloads to a private ephemeral bundle
-> stop or isolate application traffic
-> rebuild final Prisma schema
-> create minimum organization/user/account baseline
-> start 0.1.8 application in snapshot-required state
-> operator imports Sellpia
-> operator imports Wing
-> replay Coupang payloads through POST /api/ads/extension/sync
-> acceptance checks mark environment ready
```

- [ ] **Step 3: Rebuild the verified local database and import real files**

```bash
rtk npx prisma db push --force-reset
rtk npx prisma generate
rtk npm run inventory:bootstrap:dev -- --organization-id 00000000-0000-4000-8000-000000000001 --organization-name "KidItem Dev" --organization-slug kiditem-dev
```

Start the real server/web and import the operator-provided Sellpia workbook first, then the Wing workbook through authenticated routes. Replay the 45 current scrape runs after the listings exist. Expected counts are 1,964 active Masters, 1,225 listings, 2,241 channel SKUs, 45 scrape runs, 236 raw snapshots, 19 listing daily facts, 19 option daily facts, 9 ad-target facts, and 25 account KPI facts.

- [ ] **Step 4: Regenerate architecture artifacts and run release guards**

```bash
rtk npm run db:erd
rtk npm run graphify:schema
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

- [ ] **Step 5: Perform browser acceptance**

Verify `/inventory-hub`, `/inventory`, `/stock-ops`, `/product-hub/matching`, `/product-pipeline/collected-products`, `/product-pipeline/registered-products`, and `/dashboard`. Re-imports are idempotent, recipes survive Wing recollection, unmatched capacity is unknown, and no operational action changes Master stock.

- [ ] **Step 6: Commit release infrastructure and generated artifacts**

```bash
rtk git add .github/workflows docs graphify-out
rtk git commit -m "chore: add guarded Sellpia database rebuild release"
```

---

### Task 5: Complete the branch gate

- [ ] **Step 1: Run the required project gates from a tracked-only checkout**

```bash
rtk npm run test:scripts
rtk npm run check:conventions
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm exec --workspace=apps/web vitest -- run
rtk npm run build --workspace=apps/web
```

- [ ] **Step 2: Confirm the branch contains no required untracked source**

```bash
rtk git status --short
rtk git ls-files --error-unmatch apps/web/src/app/\(inventory\)/stock-ops/components/SellpiaMasterProductPicker.tsx
rtk git ls-files --error-unmatch apps/server/src/inventory/application/service/sellpia-master-product-read.service.ts
```

Only user-owned workbook and local analysis paths may remain untracked or modified outside the implementation commits.

- [ ] **Step 3: Run one consolidated review and prepare the PR**

Review `origin/develop..HEAD` for final-schema compliance, current-stock writer exclusivity, tenant boundaries, workbook exclusion, develop UI preservation, and reset safety. Do not push, open a PR, deploy, or reset a shared database until the user requests that external action.
