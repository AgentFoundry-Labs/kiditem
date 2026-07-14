# Import Sellpia And Wing Data And Match Channel SKUs

## Purpose

Use this runbook to replace KidItem's physical inventory snapshot from Sellpia,
import one Coupang Wing account's independent product/SKU metadata, and define
the exact Sellpia components consumed by one sale of each channel SKU.

Release `0.1.9` has one stock authority: a completed Sellpia full-snapshot
import writes `InventorySku.currentStock`. Matching and availability are reads
over that snapshot; they do not adjust, reserve, or deduct stock. See
[KidItem Architecture](../ARCHITECTURE.md#sellpia-authoritative-inventory-and-channel-capacity-019).

## Prerequisites

- Confirm the repository root `VERSION` is `0.1.9`.
- Sign in to the intended KidItem organization. Organization scope comes from
  the authenticated session, not an upload field.
- Select an active Wing `ChannelAccount` whose stored `channel` is exactly
  `coupang`. Do not identify an account by display name.
- Keep the approved local inputs available:

  - `exported-list (3).xls`
  - `Coupang_detailinfo_260711.xlsx`

  Do not commit them, copy them into fixtures, embed their rows in a migration,
  or stage a copy under `docs/references/`.
- Use a clean local acceptance organization/account for the frozen counts. The
  local-only reset/bootstrap procedure is in
  [Sellpia Inventory And Rocket Boundary](sellpia-rocket-inventory-sync.md).

## Authority And Safety Rules

- Import Sellpia first, then Wing. This makes every mapping and availability
  read use the latest completed physical snapshot.
- One `InventorySku` represents one Sellpia product code. A completed import
  replaces the organization's full snapshot; a previously known code absent
  from the new file keeps its UUID and component references but gets
  `currentStock = 0`.
- One `ChannelProduct` and each `ChannelSku` belong to one `ChannelAccount`.
  Marketplace name, price, barcode, seller SKU, and external IDs stay
  account/SKU-specific even when another channel lists the same product.
- A saved `ChannelSkuComponent` recipe is the only confirmed mapping. Quantity
  is the number of that exact Sellpia SKU consumed by one sale.
- Never infer recipe quantities from text such as `4개`, `8개`, `묶음`, or a
  product name. An operator must verify and save the complete recipe.
- Candidate ranking is evidence only. Never auto-confirm a candidate.
- Do not directly edit `InventorySku`, `ChannelListing`,
  `ChannelListingOption`, `ChannelSkuComponent`, or `SourceImportRun` rows.
- Do not translate imports or recipes into product stock, transfer/picking/
  return stock deltas, purchase orders, or Rocket actions.
- Runtime import IDs belong only in the operator report; do not place them in
  source code or fixtures.

## 1. Import The Sellpia Snapshot

1. Open `/inventory-hub?tab=sellpia-sync`.
2. Select `exported-list (3).xls` in **Sellpia 재고 가져오기**. The backend
   accepts XLS, XLSX, or CSV up to 10 MiB and requires `상품코드` and `재고`
   within the first 20 rows.
3. Click **재고 가져오기** and wait for **가져오기 완료**.
4. Record the response `run.id` outside the repository and verify:

   - `status = completed`;
   - source type is `sellpia_inventory`;
   - channel account is null;
   - imported row count is `1,964` for the approved workbook;
   - the UI reports created, updated, and changed-to-zero counts.
5. Open `/inventory` or `/inventory-hub?tab=status`. Confirm the table,
   summaries, asset values, and latest-import timestamp are based on
   `GET /api/inventory/sellpia-skus`.
6. Open `/inventory-hub?tab=history` and confirm the completed run appears from
   `GET /api/inventory/sellpia-sync/import-runs`.

The import is atomic and fenced by its `SourceImportRun` attempt token. It is
the only operation in KidItem that writes `InventorySku.currentStock`.

## 2. Import Wing Product And SKU Metadata

1. Open `/product-hub/matching`.
2. Select the intended active account and confirm its channel code is
   `coupang`.
3. Select `Coupang_detailinfo_260711.xlsx` in **쿠팡 Wing 상품 가져오기**.
   The endpoint accepts XLS/XLSX up to 20 MiB, requires a `Template` sheet,
   and searches the first 20 rows for the required header.
4. Click **상품 메타데이터 가져오기**. The importer upserts only the selected
   account's ChannelProduct/ChannelSku metadata and preserves existing recipes.
5. Verify the approved workbook totals:

   - ChannelProducts created + updated: `1,225`;
   - ChannelSkus created + updated: `2,241`;
   - skipped rows: `3`;
   - completed run `rowCount`: `2,241` valid SKU rows.

On a clean first import, all valid rows are created. On a reused account, the
created/updated split may differ, but the sums and identities must match. The
three approved skips are rows without a required ID; other structural errors
reject the workbook.

## 3. Confirm Component Recipes

1. Click **상태 새로고침** after both imports. Page open and a successful Wing
   import also refresh advisory status for the selected account.
2. Use the account selector, **전체 / 미매칭 / 확인 필요 / 매칭 완료** tabs,
   and server search. The page uses 50-row server pages.
3. Open **Sellpia 구성 매칭** for one ChannelSku.
4. Review evidence labels:

   | UI reason | Meaning |
   |---|---|
   | `상품코드 일치` | Exact Sellpia code evidence from seller SKU, full model number, or explicit option-code token. |
   | `고유 식별자` | One Sellpia row has the same normalized 8-14 digit barcode/model identifier. |
   | `중복 식별자` | Multiple Sellpia rows share the identifier; the operator must choose. |
   | `이름 제안` | Name similarity for display only. |
   | `검색 결과` | The operator's explicit Sellpia search result. |

5. Add one or more verified Sellpia rows. Every component needs a positive
   integer quantity; one recipe supports at most 50 unique InventorySku rows.
6. Click **구성 저장**. The endpoint validates tenant ownership and replaces
   the complete recipe atomically.
7. Close and reopen the row. Confirm component IDs/codes and quantities round
   trip, mapping status is `matched`, and Sellpia `currentStock` is unchanged.
8. To unmap, use **매칭 해제** and confirm the explicit empty replacement.
   Advisory status returns to `needs_review` or `unmatched` from current
   evidence.

Acceptance must cover and then preserve these shapes:

```text
A -> X x 1
B -> X x 8
C -> X x 1 + Y x 2
```

## 4. Verify Channel Sellable Capacity

Open `/inventory-hub?tab=availability` or `/stock-ops`. The backend calculates
each confirmed ChannelSku as:

```text
component capacity = floor(InventorySku.currentStock / component.quantity)
sellableStock = minimum component capacity in the complete recipe
```

- `B -> X x 8` consumes eight X units per sale; its capacity is
  `floor(X.currentStock / 8)`.
- A mixed recipe returns the minimum capacity and marks every component tied at
  that minimum as a bottleneck.
- A confirmed recipe with no capacity returns `sellableStock = 0`.
- An unmatched or review-required SKU returns `sellableStock = null`, never
  zero. Null means that capacity cannot be calculated until the recipe is
  confirmed.
- Reading capacity never changes current stock or creates reservations.

## Idempotent Re-Upload

Both importers hash the original bytes with SHA-256.

- Sellpia uniqueness is organization + `sellpia_inventory` + file hash, with
  no channel account.
- Wing uniqueness is organization + `coupang_wing_catalog` + ChannelAccount +
  file hash.
- Re-uploading completed identical bytes returns the existing run with
  `duplicate = true` and zero change counters.
- A duplicate does not rewrite InventorySku, ChannelProduct, ChannelSku, or
  component rows.
- A different Sellpia workbook replaces current metadata/stock while
  preserving InventorySku identity by product code.
- A different Wing workbook updates account-specific metadata while preserving
  stable channel identities and confirmed recipes.

After confirming the acceptance recipes, re-upload both approved files and
verify duplicate responses, stable IDs/recipes, and unchanged currentStock.

## Approved Clean Baseline

| Check | Expected |
|---|---:|
| Release | `0.1.9` |
| Sellpia completed run rows | 1,964 |
| Final InventorySku rows | 1,964 |
| Wing valid + skipped rows | 2,244 |
| Wing completed run rows / ChannelSkus | 2,241 |
| Distinct ChannelProducts | 1,225 |
| Skipped Wing rows | 3 |
| Initial ChannelSkuComponent rows | 0 |
| `needsReview` after initial refresh | 155 |
| `unmatched` after initial refresh | 2,086 |
| `matched` before operator confirmation | 0 |
| Unambiguous evidence rows | 154 |
| Ambiguous identifier rows | 1 |
| Automatically confirmed rows | 0 |
| currentStock writes caused by Wing import/matching/availability | 0 |

Existing recipes change the status counts. Never delete real recipes merely to
force the clean baseline.

## Failure Recovery

| Symptom | Safe recovery |
|---|---|
| HTTP 400 before import | Correct the workbook/header/duplicate/number error and retry. Validation runs before an import is claimed. |
| Wing account 404 | Select an active account in the authenticated organization. |
| Wing account 400 | Select an account whose stored channel is `coupang`. |
| Fresh identical `running` import returns 409 | Another attempt owns the file; wait and refresh. Never edit the run row. |
| Import process crashed | Re-upload identical bytes after the 30-minute lease. The new attempt token fences the stale worker. |
| Run is `failed` | Correct the cause and retry identical bytes; the importer reclaims the run atomically. |
| Component save returns 400 | Remove invalid/duplicate quantities or foreign/missing InventorySku rows and retry. The old recipe remains on failure. |
| Mapping row returns 404 | Confirm organization/account scope and completed `coupang_wing_catalog` provenance. |
| Availability is null | Confirm the complete recipe; do not substitute zero or guess capacity. |

## Verification Commands

Run focused checks from the repository root:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/source-import.spec.ts src/schemas/inventory-snapshot.spec.ts src/schemas/channel-sku-matching.spec.ts src/schemas/channel-sku-availability.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory src/channels
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)' 'src/app/(catalog)/product-hub/matching' 'src/app/(orders)/rocket-orders/lib/rocket-purchase-decision-boundary.spec.ts' src/lib/query-keys.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts src/inventory/__tests__/inventory-sku-snapshot-list.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts
```

Then run the release gates:

```bash
rtk npm run test:scripts
rtk npx prisma validate
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk npm run check:conventions
rtk npm run check:channel-sku-identity
rtk npm run check:schema-artifact-sync
```

Boot the API after module/route changes with `rtk npm run dev:server` and stop
it after Nest initializes. The route map must include the snapshot, history,
matching, and availability endpoints and no stock-mutation or Rocket-confirm
controllers.

## Blockers

Stop and report instead of modifying rows manually when:

- `VERSION` is not `0.1.9` or UI/API versions differ;
- the `0.1.9` reconstruction is requested against staging or production before
  its pre-schema local-only gate has been replaced by an approved persistent
  data preservation migration;
- either approved workbook is missing, modified unexpectedly, or cannot remain
  outside git;
- the intended organization has no active `channel='coupang'` account;
- approved workbook totals differ from 1,964 Sellpia rows, 1,225 Wing parents,
  2,241 valid Wing SKUs, and three skips in a clean scope;
- an identical completed upload changes IDs, recipes, or currentStock;
- any path except a completed Sellpia snapshot writes currentStock;
- matching/availability creates a product, transfer, picking, return, PO, or
  Rocket stock mutation;
- a required verification gate fails or the API does not boot.

## Final Report Format

Fill runtime IDs from actual responses; do not invent them.

```text
Release: 0.1.9
Sellpia run: <run.id>; rows 1964; duplicate re-upload confirmed
Wing run: <run.id>; parents 1225; SKUs 2241; skipped 3; duplicate re-upload confirmed
Initial matching: unmatched 2086 / needs review 155 / matched 0
Recipes verified: X1 / X8 / X1+Y2
Nullable capacity and bottlenecks verified: yes
Non-Sellpia currentStock writes: 0
Automated gates: <commands and result>
Blockers: <none or exact blocker>
```
