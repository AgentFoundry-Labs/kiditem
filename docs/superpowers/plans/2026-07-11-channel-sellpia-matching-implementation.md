# Channel and Sellpia SKU Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active ProductOption-based Coupang reconciliation and Sellpia stock-adjustment workflow with account-scoped marketplace catalog imports, authoritative Sellpia `InventorySku` snapshots, and explicit multi-component `ChannelSku` mappings.

**Architecture:** Release `0.1.8` is an expand-and-switch release. It keeps the physical `channel_listings` and `channel_listing_options` tables and their UUIDs, promotes them logically to `ChannelProduct` and `ChannelSku`, and adds only `InventorySku`, `SourceImportRun`, and `ChannelSkuComponent`. Sellpia and Coupang metadata import through separate owner-domain ports. The matching API computes candidates live and writes only confirmed component recipes. Legacy `ProductOption` links are never copied into the new mapping truth.

**Tech Stack:** Prisma v7 multi-file schema, PostgreSQL, NestJS hexagonal modules, Zod, `xlsx` (npm alias to `@e965/xlsx`), Next.js App Router, React Query, Vitest, Testcontainers.

## Global Constraints

- Treat `/Users/yhc125/Downloads/exported-list (3).xls` and `/Users/yhc125/Downloads/Coupang_detailinfo_260711.xlsx` as operator input only. Never commit them, copy them into fixtures, hard-code their absolute paths, or read them from a data migration.
- Preserve the user's current reference-file changes in `docs/references/**`; do not stage, rename, delete, or overwrite them.
- Keep every shell command prefixed with `rtk`.
- Use `apply_patch` for source edits.
- Keep organization scope server-owned. No request DTO accepts `organizationId` or `createdBy`.
- In `0.1.8`, `ChannelAccount.channel='coupang'` is the Wing storefront account code. A future Rocket account uses the distinct validated channel code `rocket`; do not create a second `coupang` account and infer Wing/Rocket from the name.
- Use validated `String` values instead of Prisma/PostgreSQL enums.
- Keep `ChannelListing` and `ChannelListingOption` as the Prisma compatibility names in `0.1.8`; API, service, DTO, and UI vocabulary is `ChannelProduct` and `ChannelSku`.
- Keep the physical legacy `ProductOption`, `Inventory`, `BundleComponent`, `SellpiaStockSnapshot*`, and `ChannelReconciliation*` tables in `0.1.8`. They may be contract-dropped only in a later release after all unrelated consumers move.
- Do not backfill `ChannelSkuComponent` from `ChannelListingOption.optionId`, `BundleComponent`, previous reconciliation rows, or old matched workbooks.
- Never update `Inventory.currentStock`, `reservedStock`, `StockTransaction`, or `ProductOption` from either new import or matching operation.
- A matched SKU is defined by component rows, not names, prices, `optionId`, or `mappingStatus` alone.
- Never use unguarded `--accept-data-loss`. The only permitted use is the schema plan's repeatable-preflight and exact-warning-allowlist path for adding the approved existing-table unique constraints.
- Do not add a generic inventory-provider framework, persisted candidate table, fuzzy-match table, price history, recipe history, order reservation, channel stock upload, or Rocket PO behavior.

---

## Plan Set and Execution Order

Execute these plans in order. Each plan must end in a buildable checkpoint before the next starts.

1. [Schema and shared contracts](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-07-11-channel-sellpia-matching-schema-contracts.md)
2. [Sellpia and Coupang imports](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-07-11-channel-sellpia-matching-imports.md)
3. [Matching backend and legacy cutover](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-07-11-channel-sellpia-matching-backend.md)
4. [Matching UI, operator runbook, and acceptance](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-07-11-channel-sellpia-matching-web-acceptance.md)

Source design:

- [2026-07-11-channel-inventory-sku-reconstruction-design.md](/Users/yhc125/workspace/kiditem/docs/superpowers/specs/2026-07-11-channel-inventory-sku-reconstruction-design.md)

## Release Boundary

`0.1.8` uses this logical-to-physical bridge:

| Logical contract | Prisma compatibility model | Physical table | Identity |
|---|---|---|---|
| `ChannelProduct` | `ChannelListing` | `channel_listings` | existing UUID is preserved |
| `ChannelSku` | `ChannelListingOption` | `channel_listing_options` | existing UUID is preserved |
| `InventorySku` | `InventorySku` | `inventory_skus` | new UUID, Sellpia code is business key |
| `ChannelSkuComponent` | `ChannelSkuComponent` | `channel_sku_components` | new mapping row |
| `SourceImportRun` | `SourceImportRun` | `source_import_runs` | new file-run row |

The bridge is deliberate. Renaming Prisma models in the same release would force unrelated Orders, Advertising, Supply, Review, and AI consumers to migrate even though this release only changes catalog-to-inventory matching.

Because `ChannelListing.masterId` becomes nullable, every existing read model that semantically means “MasterProduct-linked listing” is hardened in the schema plan to filter/guard null. Import-only channel products remain visible in the new matching API, not in legacy registered-product, advertising, profit, traffic, or image-master reads.

## Authoritative Data Flow

```text
Sellpia complete export
  -> validate every row
  -> SourceImportRun(sellpia_inventory)
  -> InventorySku upsert by organization + Sellpia product code
  -> absent known codes reportedStock = 0
  -> no ProductOption/Inventory/ledger write

Coupang Wing detail export
  -> validate Template sheet and header row 4
  -> SourceImportRun(coupang_wing_catalog, channelAccountId)
  -> ChannelProduct upsert by account + 등록상품ID
  -> ChannelSku upsert by account + 옵션 ID
  -> preserve UUID, price from other sources, mapping status, and components

/product-hub/matching
  -> account-scoped ChannelSku list
  -> live exact-code / unique-barcode / name-search candidates
  -> operator enters one or more positive component quantities
  -> replace ChannelSkuComponent rows in one transaction
  -> matched iff at least one component remains
```

## Fixed HTTP Contract

### Imports

```text
POST /api/inventory/sellpia-sync/import
multipart: file

POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing
multipart: file
```

The Sellpia endpoint retains its URL so bookmarks and clients do not need a new upload route, but it no longer accepts `effectiveExportedAt` and no longer exposes approve, manual-adjust, ignore, or candidate-resolution operations.

### Matching

```text
GET /api/channels/sku-mappings
  ?channelAccountId=<uuid optional>
  &mappingStatus=all|unmatched|needs_review|matched
  &search=<text>
  &page=1
  &limit=50

POST /api/channels/sku-mappings/status-refresh
body: { channelAccountId?: <uuid> }

GET /api/channels/sku-mappings/:channelSkuId/candidates
  ?search=<text optional>
  &limit=30

PUT /api/channels/sku-mappings/:channelSkuId/components
body: {
  components: [
    { inventorySkuId: <uuid>, quantity: <positive integer> }
  ]
}
```

`PUT` replaces the complete recipe. An empty component array is the explicit unmap operation. The server always records `mappingSource = "manual"` and `createdBy` from the authenticated user; clients cannot supply either value.

## Matching Status Semantics

- `matched`: at least one `ChannelSkuComponent` exists.
- `needs_review`: no components exist and current exact Sellpia-code, unique normalized-identifier, or ambiguous normalized-identifier evidence exists.
- `unmatched`: no components and no deterministic identifier candidate.
- Name/option-name suggestions do not change a SKU to `needs_review` by themselves.
- `status-refresh` recalculates only unmapped rows. It never rewrites a matched row.
- The matching page calls `status-refresh` when it opens, after a successful Wing import, and when the operator requests refresh. A successful Sellpia import invalidates matching queries; the next matching-page open performs the refresh against the new snapshot.

## Candidate Rules

Evaluate candidates in this exact order:

1. Compare trimmed `ChannelSku.sellerSku` and the complete `modelNumber` with `InventorySku.sellpiaProductCode` exactly.
2. Extract only hyphenated alphanumeric code tokens such as `10391-1` from `ChannelSku.optionName` and compare the complete token with `InventorySku.sellpiaProductCode`. This is code evidence, not general name matching.
3. Normalize ChannelSku `modelNumber` and `barcode` by removing non-digits; accept only 8–14 digits. Compare with `InventorySku.barcode`, which Sellpia import normalizes with the same rule and source priority `모델명 -> 바코드 -> 자사상품코드`.
4. One InventorySku for that normalized identifier is `unique_barcode`; multiple InventorySkus are returned as `ambiguous_identifier` candidates and require review.
5. Suggest general name/option-name results for display only.
6. When the operator types a query, search Sellpia code, name, option name, and barcode; rank exact code first.

Never compare `externalSkuId`/Wing `옵션 ID`, parent `externalProductId`/`등록상품ID`, price, or arbitrary `rawJson` fields with a Sellpia code. Preserve leading zeroes and hyphens by treating all identifiers as trimmed strings, never numbers.

## Import Idempotency State Machine

Both importers use the same state rules without introducing a generic provider service:

```text
validate complete file
  -> claim unique SourceImportRun by org + source + account/null + fileHash
     completed => return existing run, duplicate=true, all change counts 0
     running and updated within 30 minutes => 409 Conflict
     running and older than 30 minutes     => rotate attemptToken by compare-and-set and reclaim the same run
     failed    => rotate attemptToken by compare-and-set, then retry the same run
     absent    => create running run with a new attemptToken
  -> one transaction: lock run, verify attemptToken, normalized upserts + absent handling + run completed
  -> on error: normalized transaction rolls back; mark failed only when the same attemptToken still owns the run
```

Concurrent imports for the same organization/source/account are serialized inside the write transaction. A failed validation occurs before the run is claimed and writes nothing.
The 30-minute lease prevents a process crash between claim and transaction from blocking that file hash forever. `attemptToken` fences old workers: a worker whose lease was reclaimed cannot write rows, complete the run, or mark the newer attempt failed. After the advisory lock is acquired, a writer that discovers the run already completed returns duplicate success instead of applying rows twice.

## Real-File Acceptance Baseline

The implementation is complete only when the operator imports the two approved files through the runtime endpoints and observes:

| Assertion | Expected |
|---|---:|
| Sellpia raw/valid product-code rows | 1,964 |
| `InventorySku` rows for the organization after first clean import | 1,964 |
| Coupang raw rows | 2,244 |
| skipped rows missing required IDs | 3 |
| valid unique `ChannelSku` rows | 2,241 |
| distinct `ChannelProduct` parents | 1,225 |
| initial `ChannelSkuComponent` rows | 0 |
| unambiguous deterministic identifier candidates | 154 |
| ambiguous identifier rows | 1 |
| `needs_review` rows before confirmation | 155 |
| rows with no deterministic identifier evidence / `unmatched` | 2,086 |
| automatically confirmed mappings | 0 |

The observed import may update existing stable channel rows instead of creating all 1,225/2,241 rows. Acceptance is based on final unique counts and stable IDs, not create counters alone.

## Required Mapping Scenarios

Before release completion, persist and re-read all three recipes:

```text
single:           channel SKU A -> inventory SKU X x 1
same-SKU bundle:  channel SKU B -> inventory SKU X x 4
mixed bundle:     channel SKU C -> inventory SKU X x 1 + inventory SKU Y x 2
```

Then re-import both source files and prove the same component IDs and quantities remain unchanged.

## Failure Matrix

| Failure | Required behavior |
|---|---|
| Blank/duplicate Sellpia product code | Reject entire workbook before persistence. |
| Invalid/negative Sellpia stock or non-null price | Reject entire workbook before persistence. |
| Missing Wing `등록상품ID` or `옵션 ID` | Skip row and report it; the approved file must report exactly 3 skips. |
| Duplicate Wing option ID or one option under multiple parents | Reject entire workbook. |
| Wrong-organization channel account | Return 404 without import-run or catalog writes. |
| Non-Coupang account sent to Wing importer | Return 400 before import-run or catalog writes. |
| Re-upload completed hash | Return existing run as duplicate; no metadata, ID, stock, status, or component change. |
| Concurrent running hash | Return 409. |
| Mid-transaction database failure | Roll back normalized rows and mark the run failed. |
| Duplicate component IDs in request | Return 400 before deleting the current recipe. |
| Zero/negative/non-integer quantity | Return 400 before deleting the current recipe. |
| Foreign-organization InventorySku | Return 400; old components remain intact. |
| Wrong-organization ChannelSku | Return 404. |
| Duplicate normalized identifier in Sellpia | Return every matching row as `ambiguous_identifier`, set advisory status to needs-review, and never auto-confirm. |
| Metadata/name/price re-import | Preserve every confirmed component. |

## Commit Checkpoints

Use these commit boundaries; do not mix user workbook changes into any commit.

1. `feat: add channel Sellpia matching schema contracts`
2. `feat: import Sellpia inventory SKU snapshots`
3. `feat: import Coupang Wing catalog metadata`
4. `feat: map channel SKUs to Sellpia components`
5. `refactor: retire legacy product option reconciliation`
6. `feat: rebuild channel SKU matching workspace`
7. `docs: document channel Sellpia matching operations`

## Final Verification Gate

Run from `/Users/yhc125/workspace/kiditem`:

```bash
rtk npm run test:scripts
rtk npx prisma validate
rtk npm run check:channel-sku-identity
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk npm run check:conventions
rtk npm run db:erd
rtk npm run graphify:schema
rtk npm run check:schema-artifact-sync
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
rtk npm run dev:server
```

Expected: every non-watch command exits `0`; the server finishes Nest module initialization without missing provider, route collision, or Prisma metadata errors. Stop the watch process only after boot is confirmed.

## Completion Definition

This plan set is complete only when:

- the new runtime imports and matching UI are the only active user-facing paths for this workflow;
- the old reconciliation HTTP controller and image-sync recording bridge are removed from module wiring;
- the old Sellpia approval/adjustment endpoints are no longer routed;
- legacy reconciliation and Sellpia stock-comparison tables remain only as inert compatibility data; the separate Sellpia receipt-batch API remains supported behind its receipt-only service;
- the executable `import:product-baseline` path that reads `kiditem_list` plus `wing-inventory-matched` is retired;
- the two approved workbooks have passed the real-file acceptance counts;
- the three recipe shapes survive both re-imports;
- all required build, tenancy, schema, and PR gates pass.

## Execution Handoff

After reviewing this plan set, choose one execution mode:

1. **Subagent-Driven (recommended)** — execute one small task at a time with a fresh implementation subagent and review each checkpoint.
2. **Inline Execution** — execute the same tasks in this task using `superpowers:executing-plans`, with checkpoints between plan files.
