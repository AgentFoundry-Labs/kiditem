# How to Import Sellpia And Wing Data And Match Channel SKUs

## Purpose

Use this runbook to replace KidItem's Sellpia source-stock snapshot, import one
Coupang Wing account's product/SKU metadata, and confirm how many of each
Sellpia `InventorySku` one marketplace option consumes. The workflow copies
source data and stores an explicit component recipe. It does not adjust stock,
place Rocket purchase orders, or process orders.

Architecture and model-name compatibility are described in
[KidItem Architecture](../ARCHITECTURE.md#sellpia-and-channel-sku-matching-018).

## Prerequisites

- Run release `0.1.8`; confirm the repository root `VERSION` contains `0.1.8`.
- Sign in to the intended KidItem organization. Organization scope comes from
  the authenticated session, not an upload form field.
- Create or identify the intended active Wing `ChannelAccount`. Its stored
  `channel` must be exactly `coupang`. A display name containing "Coupang" or
  "Wing" is not sufficient, and `channel='rocket'` is not accepted by this
  importer.
- Keep these approved input files available on the operator's local machine:

  - `exported-list (3).xls`
  - `Coupang_detailinfo_260711.xlsx`

  They are local operator inputs. Do not commit them, copy them into fixtures,
  embed their rows in a data migration, or stage any copy under
  `docs/references/`.
- For exact acceptance counts, use a clean acceptance organization/account or
  record the pre-existing component recipes before starting.
- Run database-changing verification commands only with an explicitly selected
  development or staging `DATABASE_URL`. Do not run `db:push` against an
  ambiguous or production database.

## Safe Agent/Operator Actions

- Upload the approved files through the two owner UIs or their existing,
  authenticated NestJS endpoints.
- Import Sellpia first, then Wing. This makes the first mapping-status refresh
  evaluate the current Sellpia snapshot.
- Read import responses, status counts, candidate evidence, and saved recipes.
- Re-upload an identical file to verify idempotency. A completed duplicate is a
  read/no-op response with zero change counters.
- Retry a failed import with the same file. Retry a process-crashed `running`
  import with the same file after its 30-minute lease expires.
- Confirm recipes only after checking the channel SKU and each Sellpia product
  code. Quantity means the number of that Sellpia SKU consumed by one sale of
  the channel SKU.
- Capture runtime `run.id` values in the final operator report only. Do not put
  them in source code, fixtures, or this runbook.

## Forbidden Actions

- Do not directly edit `SourceImportRun.status`, `attemptToken`, timestamps, or
  file hashes to force a retry.
- Do not directly edit normalized import rows in `inventory_skus`,
  `channel_listings`, or `channel_listing_options`. Correct the source file or
  account selection and use the importer again.
- Do not create, replace, or delete `channel_sku_components` with ad hoc SQL.
  Use `PUT /api/channels/sku-mappings/:channelSkuId/components` through the
  matching UI/API so tenant checks, validation, and row locking run.
- Do not edit `InventorySku.reportedStock` in the matching workflow or translate
  a Sellpia import into legacy `Inventory`, `StockTransaction`, bundle-stock,
  or Rocket-ledger writes.
- Do not auto-confirm a candidate. Candidate names and identifiers are evidence;
  only the operator's saved component recipe is truth.
- Do not infer component quantity from `4개`, `8개`, bundle, or other name text.
- Do not use Coupang image synchronization to populate or refresh the matching
  queue. Image synchronization is a separate media workflow.
- Historical dev-data copies named `wing-inventory-matched.xlsx` are for
  inspection/replay only. They are not accepted import input or matching truth.
- Do not use this workflow for Rocket catalog ingestion, purchase-order
  decisions, or order processing.

## Sellpia Upload Steps

1. Open `/inventory-hub?tab=sellpia-sync`.
2. In **Sellpia 재고 가져오기**, select `exported-list (3).xls`. The backend
   supports Sellpia XLS, XLSX, and CSV exports up to 10 MiB and requires the
   `상품코드` and `재고` columns in the first 20 rows.
3. Click **재고 가져오기** and wait for **가져오기 완료**.
4. Record the response `run.id` outside the repository and verify:

   - status is `completed`;
   - source type is `sellpia_inventory`;
   - channel account is null;
   - imported row count is `1,964` for the approved file;
   - the UI shows `새로 생성`, `업데이트`, and `0으로 변경` counts.

This is a full snapshot replacement by organization and Sellpia product code.
Present codes are created or updated. Known codes absent from the new file keep
their UUID and component references but receive `reportedStock = 0`. The import
does not mutate KidItem's legacy inventory balances or stock ledger.

## Wing Upload Steps

1. Open `/product-hub/matching`.
2. Select the intended active Wing account. Confirm its channel code is
   `coupang`; do not choose by display name alone.
3. Click **Wing 상품 가져오기**. In **쿠팡 Wing 상품 가져오기**, select
   `Coupang_detailinfo_260711.xlsx`. The endpoint accepts XLS/XLSX up to 20 MiB,
   requires a `Template` sheet, and finds its required header row within the
   first 20 rows.
4. Click **상품 메타데이터 가져오기**. The importer updates marketplace
   metadata only and preserves existing Sellpia component recipes.
5. Verify the result counters. For the approved file:

   - parent product created + updated = `1,225`;
   - option SKU created + updated = `2,241`;
   - skipped rows = `3`;
   - the completed run's `rowCount` is `2,241` valid SKU rows.

On a clean first import, the created counts are 1,225 parents and 2,241 SKUs.
On a non-clean account, the created/updated split may differ, but both sums and
the final identities must match. The three approved skips are rows missing a
required ID; other validation errors reject the whole workbook.

## Matching And Unmapping Steps

1. Click **상태 새로고침** after both imports. Opening the page
   and a successful Wing upload also refresh the selected account's advisory
   statuses.
2. Use the **전체 / 미매칭 / 확인 필요 / 매칭 완료** tabs, account selector,
   and server-side search to locate a SKU. The page uses 50-row server pages;
   do not attempt to load all 2,241 rows into browser state.
3. Open a row's **Sellpia 구성 매칭** dialog.
4. Review each candidate reason:

   | UI reason | Meaning |
   |---|---|
   | `상품코드 일치` | Exact Sellpia code evidence from seller SKU, full model number, or an explicit hyphenated option-code token. |
   | `고유 식별자` | One Sellpia row has the same normalized 8-14 digit model/barcode identifier. |
   | `중복 식별자` | Multiple Sellpia rows share the identifier; the operator must choose. |
   | `이름 제안` | Name-based display suggestion only. |
   | `검색 결과` | Result from the operator's explicit Sellpia search. |

5. Add one or more Sellpia rows to the local draft. A new row starts at
   quantity `1`. Enter a positive integer quantity for every component. One
   recipe supports up to 50 unique InventorySku rows.
6. Click **구성 저장**. Normal save requires at least one component and
   replaces the complete recipe atomically.
7. Close and reopen the row. Verify exact component identities and quantities
   round-trip. The channel SKU becomes `matched`; displayed Sellpia reported
   stock remains unchanged.
8. To remove a recipe, click **매칭 해제**, then **매칭 해제 확인**. This is a
   separate operation that sends `{ components: [] }`. The SKU returns to
   `needs_review` or `unmatched` according to current deterministic evidence.

For release acceptance, verify three distinct shapes and restore any recipe
temporarily unmapped during the test:

```text
A -> X x 1
B -> X x 4
C -> X x 1 + Y x 2
```

## Idempotent Re-Upload Behavior

Both importers hash the original bytes with SHA-256 before persistence.

- Sellpia uniqueness is organization + `sellpia_inventory` + file hash with no
  channel account.
- Wing uniqueness is organization + `coupang_wing_catalog` + channel account +
  file hash. The same bytes imported to another account are a separate run.
- A completed same-hash upload returns the existing run with
  `duplicate = true` and every change count set to zero.
- A duplicate upload does not rewrite normalized rows. InventorySku,
  ChannelProduct, and ChannelSku UUIDs stay stable, and confirmed component
  identities/quantities remain unchanged.
- A different Sellpia file hash applies a new full snapshot while preserving
  InventorySku identity by Sellpia product code.
- A different Wing file hash updates imported metadata while preserving channel
  UUIDs, seller SKU/price fields owned by other sources, advisory status, and
  component recipes.

After matching the three acceptance recipes, re-upload both identical approved
files. Confirm both responses report `duplicate = true`, all change counters
are zero, and the three recipes and Sellpia reported-stock values are unchanged.

## Validation/Count Expectations

The exact baseline below applies to the two approved files in a clean
acceptance organization/account:

| Check | Expected |
|---|---:|
| Sellpia completed run row count | 1,964 |
| Final InventorySku rows after the clean first import | 1,964 |
| Wing raw data rows represented by valid + skipped rows | 2,244 |
| Wing completed run valid row count | 2,241 |
| Distinct ChannelProduct parents | 1,225 |
| Skipped Wing rows | 3 |
| Initial ChannelSkuComponent rows | 0 |
| `all` after status refresh | 2,241 |
| `needsReview` before confirmation | 155 |
| `unmatched` before confirmation | 2,086 |
| `matched` before confirmation | 0 |
| Unambiguous deterministic rows | 154 |
| Ambiguous identifier rows | 1 |
| Automatically confirmed rows | 0 |
| Stock/ledger mutations caused by this workflow | 0 |

If a reused account already has confirmed components, the pre-confirmation
status counts will differ. Use a clean acceptance scope for the frozen baseline;
do not delete production recipes to force the numbers.

## Failure Recovery

| Symptom | Safe recovery |
|---|---|
| HTTP 400 before import | Fix the missing file, required sheet/header, duplicate IDs/codes, invalid stock/price, invalid quantity, duplicate component, or component-limit error; then retry through the same UI. File validation occurs before an import run is claimed. |
| Wing account 404 | Select an active account in the current organization. Do not change account ownership or import-run rows directly. |
| Wing account 400 | The selected account is not `channel='coupang'`; select the intended Wing account. |
| Fresh identical `running` import returns 409 | Another attempt owns the file. Wait for it to complete and refresh. Do not change its status or token. |
| Import process crashed | Re-upload the same file after the 30-minute lease expires. The importer safely reclaims the same run with a rotated attempt token; the stale worker is fenced from writes. |
| Run is `failed` | Re-upload the same file. A failed run is compare-and-set back to `running` with a new attempt token and retried atomically. |
| Import write fails | Normalized writes roll back together and the owning run is marked failed. Correct the cause and re-upload; do not repair partial rows manually. |
| Component save returns 400 | Remove invalid/duplicate quantities or foreign/missing InventorySku rows. Validation happens before the current recipe is deleted, and transaction failures roll back the full replacement. |
| Mapping row returns 404 | Confirm the SKU belongs to the current organization/account and came from a completed `coupang_wing_catalog` run. Legacy rows without that provenance are intentionally outside the queue. |

A fresh running duplicate must return 409. A process-crashed run is safely
reclaimable with the same file after the 30-minute lease expires. Operators and
agents must not edit import-run status, attempt tokens, or normalized rows
directly under either condition.

## Verification Commands

Run from the repository root. The integration tests and `db:push` require the
approved local development/staging database configuration.

Focused contract, server, web, and PostgreSQL checks:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/source-import.spec.ts src/schemas/channel-sku-matching.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory src/channels src/ai/application/service/__tests__/coupang-image-sync.service.spec.ts src/ai/__tests__/ai.architecture.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/inventory-hub' 'src/app/(catalog)/product-hub/matching' src/lib/query-keys.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts
```

Complete schema, build, policy, and generated-artifact gates:

```bash
rtk npm run test:scripts
rtk npx prisma validate
rtk npm run check:channel-sku-identity
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk npm run check:conventions
rtk npm run db:erd
rtk npm run graphify:schema
rtk npm run check:schema-artifact-sync
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

Boot the API after module or route changes:

```bash
rtk npm run dev:server
```

Stop it after Nest finishes initialization. The route map must contain the new
import/matching endpoints and no legacy reconciliation controller, missing
provider token, circular dependency, or route collision.

## Blockers

Stop and report instead of editing the database when any of these is true:

- `VERSION` is not `0.1.8`, or the deployed UI/API versions do not match.
- Either approved local file is missing, modified unexpectedly, or cannot be
  kept out of git.
- The intended organization has no active `channel='coupang'` account.
- The approved file fails structural validation or produces count sums different
  from 1,964 Sellpia rows, 1,225 Wing parents, 2,241 valid Wing SKUs, and three
  skips in a clean acceptance scope.
- An identical completed upload reports nonzero changes, unstable IDs, changed
  components, or changed Sellpia reported stock.
- A crashed run remains unreclaimable after 30 minutes and no other live import
  is running.
- Matching writes legacy inventory, stock transactions, bundle stock, or Rocket
  ledger rows.
- Any required verification command fails or the API does not boot cleanly.

## Final Report Format

Fill runtime IDs from actual responses. Do not invent IDs or copy this template
into a fixture.

```text
Release: 0.1.8
Sellpia run: <actual Sellpia response run.id>; rows 1964; duplicate re-upload confirmed
Wing run: <actual Wing response run.id>; parents 1225; SKUs 2241; skipped 3; duplicate re-upload confirmed
Matching before test: unmatched 2086 / needs review 155 (154 unambiguous + 1 ambiguous) / matched 0
Recipes verified: single X1 / same-SKU X4 / mixed X1+Y2
Re-import preservation: confirmed
Inventory stock mutation count: 0
Legacy active routes: removed
Automated gates: <commands run and result>
Blockers: <none or exact blocker>
```
