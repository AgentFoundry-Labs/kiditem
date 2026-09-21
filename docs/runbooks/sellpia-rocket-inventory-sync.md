# Sellpia Inventory And Rocket Confirmation Boundary

## Purpose

KidItem keeps Sellpia as the physical inventory authority. The Rocket screen
collects Coupang pre-confirmation PO rows, compares them with a fresh Sellpia
snapshot, lets the operator decide confirmed/stockout quantities, and generates
the workbook uploaded back to Coupang. This review does not create a Sellpia
order, call a marketplace provider, or mutate physical inventory.

Collection operation and recovery are defined in
[Sellpia Inventory Collection](sellpia-inventory-freshness.md).
Component matching is defined in
[Import Channel Data And Match Sellpia Components](channel-sellpia-matching.md).

## Authority Boundary

```text
authenticated Sellpia full option-product export
  -> Inventory validation + fenced full-snapshot publication
  -> SellpiaInventorySku.currentStock

authenticated Rocket PO collection
  -> Channels issues account-scoped attempt + frozen plan/token/expiry
  -> extension captures the provider and uploads directly to the owner
  -> Channels atomically stores COMPLETE snapshot + identities + Alert resolution
  -> UI reads the COMPLETE source independently of row count
  -> shared control starts/joins Sellpia collection and waits for COMPLETE
  -> Supply verifies the named successful Inventory attempt and calculates
  -> operator reviews every quantity and shortage reason
  -> Supply reruns the fresh preview and stores the exact official workbook
  -> operator uploads the workbook to Coupang
  -> Coupang decides and exposes the confirmed PA through Coupang Directship
  -> Orders collects every PA row and links exact active-workbook matches
  -> operator selects generated transport files for Sellpia submission
  -> no provider submit / no direct Sellpia stock write
```

Inventory owns collection, publication, physical `SellpiaInventorySku`, and
`currentStock`. Channels owns Rocket `ChannelAccount` and observed listing/SKU
identity. Products owns the operator-confirmed direct
`ChannelListingOptionInventoryComponent` rules. Supply owns the preview
calculation and Rocket decision/workbook audit.
Orders owns PA persistence in the general order spine. Inventory owns collection
and physical stock; Supply and Orders do not derive freshness or write inventory
state.

## Rocket Collection Contract

1. Use an active organization-owned `ChannelAccount` whose stored channel is
   exactly `rocket`. Never infer Rocket from its display name.
2. In the existing decision area on `/rocket-orders`, choose the account and
   collect the intended ETA range through the order-collector extension.
3. Begin `/api/channels/rocket-po/attempts` with a stable idempotency key and
   explicit account/date/status/date-type/confirmation mode. Send only the
   issued `attemptId` to the extension. It reads the frozen plan and retains
   the same URLs, all-page traversal, detail concurrency5, normalization and
   one fresh-tab session retry. No Operation claim or heartbeat is involved.
4. The extension uploads normalized rows, non-display vendor identity,
   page/detail counts and observed list validation directly to Channels. A
   missing list array is not proof of empty. Missing/mixed vendor identity on
   non-empty data, failed details or incomplete pagination cannot publish.
   A verified zero-PO result publishes an empty COMPLETE snapshot without
   claiming a blank vendor identity. `vendorName` is not identity.
5. Channels rechecks account/vendor and the attempt fence in the terminal
   transaction. Snapshot, identity upserts, terminal state and Alert changes
   commit together. Fixed expiry is 600 seconds. A same-attempt terminal replay
   is a no-op; a new explicit collection receives a new generation even when
   content matches. Existing 4,000-row acceptance uses one bounded upload.
6. Publication upserts observed Rocket identities without inactivating older
   Rocket identities that are absent from a later PO collection. Existing
   confirmed option-component rules are preserved.
7. Confirmation-capable collection additionally requires the allowlisted
   official-workbook fields for every line. Missing fields block confirmation;
   they are never synthesized from names or copied from another PO.
8. The account source read reports latest attempt, latest COMPLETE, stale state
   and actual cutoff independently of rows. Failure keeps the prior COMPLETE;
   a newer empty COMPLETE clears older current rows. Previous snapshots remain
   available by exact source reference. A lost upload ACK is recovered by
   reading the exact attempt, not by marking an uncertain upload failed.

Incomplete or vendor-mismatched collection cannot produce a usable preview.
Correct the account/session or narrow the date range and recollect; never fill
missing evidence manually.

## Preview Calculation

Preview and server workbook requests reference `sourceImportRunId`; Supply
loads canonical COMPLETE rows through Channels. They never publish browser
rows or change the source terminal state. Preview failure leaves COMPLETE
intact. Reopening an existing snapshot performs no new provider collection.

Before each calculation action, the UI starts or joins Sellpia inventory
collection and waits for atomic publication. Preview and server export requests
must include `inventoryAttemptId`. Supply verifies that exact successful
current collection through Inventory's input port and reads `currentStock`.
Failed/cancelled collection stops calculation. There is no TTL gate or advisory
calculation while waiting; absent SKU references stay unavailable, not zero.

Rows are allocated in stable ETA, PO, and line order. For each confirmed
component:

```text
component capacity = floor(currentStock / component quantity per sale)
row capacity = min(PO order quantity, minimum remaining component capacity)
```

Shared components are consumed once in memory across all preview rows. Edited
quantities are validated against recomputed remaining capacity. During
recollection, all retained edits are sent once and jointly clamped in the same
stable allocation order. Any later edit marks the UI preview dirty and disables
confirmation until a whole-preview revalidation returns effective quantities.

Explicit block reasons cover incomplete collection, vendor mismatch, missing
mapping, missing component, and insufficient capacity. Missing mapping is not
treated as a confirmed zero-capacity recipe.

## Workbook Review, Coupang Confirmation, And Sellpia Application

1. Review every row quantity. Every line must have an explicit value; every
   quantity below the PO order quantity must use one controlled shortage reason.
2. Choose **쿠팡 엑셀 다운로드**.
3. The UI collects Sellpia, reruns the canonical preview, builds the reviewed
   workbook in the browser and downloads it directly. Download is not provider
   acceptance and does not mutate physical stock.
4. The existing backend workbook audit API and exact-byte replay remain for
   internal callers/Orders reconciliation; the screen does not start a new
   post-download tracking workflow.
5. The operator uploads that workbook to Coupang. KidItem does not describe the
   download or upload as Coupang acceptance.
6. Coupang evaluates the response and exposes accepted PA rows through Coupang
   Directship.
7. In `/order-collection`, select the same Rocket channel account and collect
   both SHIPMENT and MILKRUN. Orders persists every `SourceImportRun`, `Order`,
   and `OrderLineItem`. Supply links exact account + PO + product (+ barcode
   when present) matches to the active workbook, but unmatched rows remain in
   the generated 17-column Sellpia candidate file.
8. Each non-empty transport uses the stable key
   `rocket-final-order:{sourceImportRunId}:{transport}`. A transport with no
   collected row returns HTTP 204 and has no transmission key.
9. The operator selects which generated file to submit to Sellpia. Explicit
   rejection shows Sellpia's message and offers a manual inventory refresh;
   unknown outcome requires reconciliation for only that file. Neither outcome
   blocks other collection or inventory synchronization.

The workbook is KidItem's internal stockout decision artifact. It is not proof
of Coupang acceptance and does not call a marketplace provider.

## Owned Screens

| Route | Responsibility |
|---|---|
| `/rocket-orders` | Preserved `c9e7caf8` calendar/list/file-history UI with the stale capacity-decision placeholder replaced by authenticated collection, completeness evidence, editable deterministic preview, confirmation/workbook, and release. |
| `/purchase-orders` | General supplier purchase-order operations only. |
| `/product-hub/matching` | Baseline Coupang/Rocket listing queue and exact Sellpia option-component confirmation workspace. |
| `/inventory-hub` | Tabless current physical Sellpia basis, complete SKU/connection table, and manual sync action; no Rocket-specific inventory workspace. |
| `/stock-ops?tab=product-outflow` | Direct Sellpia SKU sales/depletion with current stock, mapping state, and operating-product destinations. |

On `/rocket-orders`, integrate the Supply-owned contract only at the existing
capacity-decision placeholder; do not replace the calendar/list/file-history
shell or expose a duplicate Rocket review workspace under `/purchase-orders`.

## Record-Only Operations

`StockTransfer` and `ReturnTransfer` records may reference physical
`SellpiaInventorySku` identities. Their status changes do not write
`currentStock`. The next completed Sellpia full snapshot is the evidence for a
real-world stock change.

## Forbidden Actions

- Do not call a Rocket marketplace provider or describe the internal
  confirmation as provider acceptance.
- Do not add `/api/orders/rocket/*`; confirmation and release stay on the
  Supply `/api/purchase-orders` action contract.
- Do not create a Rocket-only inventory balance or ledger.
- Do not treat a collection request, preview, edit, or workbook as a stock
  reservation or a Sellpia order.
- Do not infer vendor identity from a display name or bypass incomplete
  evidence.
- Do not enable workbook export from the prior-snapshot advisory rows shown
  while freshness is pending.
- Preserved inventory and ledger screens must remain record-only with respect
  to `SellpiaInventorySku.currentStock`; do not add receive/issue/adjust/reserve/
  release actions that write the Sellpia-owned balance.

## Failure Recovery

| Symptom | Safe recovery |
|---|---|
| Rocket account missing/inactive | Select or configure an active organization-owned `channel='rocket'` account. |
| Vendor mismatch | Sign in to the intended Coupang supplier account or select the matching Rocket ChannelAccount. Recollect; do not override the ID. |
| Missing/truncated details | Narrow the date range, restore the provider page/session, and recollect until completeness evidence is clean. |
| Source result unconfirmed | Read the exact attempt/source. Retry transport with its existing identity while RUNNING; use a new explicit attempt after FAILED/expiry. |
| SKU is unmapped | Open `/product-hub/matching` and confirm the entire option-component rule; do not infer quantity from a title. |
| Component inactive | Review and replace/confirm the option-component rule. Persisted mapping remains diagnosable and appears in `needs_review`. |
| Freshness pending | Keep the collected rows visible as advisory, wait for automatic Sellpia refresh, and recompute from the requested generation before export. |
| Edited quantity rejected | Keep the preview dirty, run **수량 다시 검증**, and use the jointly returned effective quantities. |
| Confirmation reports stale generation/source/components | Recollect and recompute. Do not reuse old rows or override the fence. |
| Idempotency conflict | Keep the existing decision or create a new confirmation intent with a new UUID after operator review. |
| Workbook generation/download fails after persistence | Retry the same idempotency key to download the exact stored artifact; do not recalculate silently. |
| PA row does not match the active workbook | Keep it in the generated Sellpia candidate file and report it as unmatched metadata; do not discard the order. |
| Sellpia explicitly rejects a transport file | Show the exact error, optionally request inventory sync, then let the operator choose whether to retry. Never auto-resubmit. |
| Sellpia outcome is unknown | Reconcile that exact transmission key before retrying it; other files and inventory sync remain available. |

## Verification

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/rocket-purchase-preview.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory src/channels src/supply
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/rocket-po-source.pg.integration.spec.ts src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts src/supply/__tests__/rocket-purchase-confirmation.pg.integration.spec.ts src/supply/__tests__/rocket-final-order-reconciliation.pg.integration.spec.ts src/orders/__tests__/coupang-direct-order-collection.pg.integration.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/\(supply\)/purchase-orders src/app/\(orders\)/rocket-orders src/app/\(orders\)/order-collection src/app/\(inventory\)/stock-ops
rtk node --test extensions/tests/order-collector-rocket-sales-contract.test.mjs extensions/tests/order-collector-action-coverage.test.mjs
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
```

The boundary and integration tests must prove workbook export stays in Supply,
replays idempotently, rejects request drift/stale generations/recipe drift,
keeps unmatched PA rows as Sellpia candidates, and has no provider or
physical-stock-write lane.

## Blockers

Stop and report when collection completeness or workbook fields cannot be
established, the Rocket account/vendor cannot be scoped, freshness cannot be
established, a confirmed recipe contains unresolved inactive components, or
any marketplace provider/physical-stock side effect is reachable.

## Final Report Format

```text
Release: <root VERSION>
Rocket account/vendor: <sanitized account id>; matched <yes/no>
Collection: complete <yes/no>; list pages <n>; details <n>; failed <count>; truncated <yes/no>
Catalog publication: attempt <id>; generation <n>; cutoff <timestamp>; state <COMPLETE|FAILED|RUNNING>; rows <count>
Sellpia freshness generation: <decimal string>
Preview: rows <count>; blocked <count>; edited bounds verified <yes/no>
Confirmation: <not executed|active id>; idempotent <yes/no>; shortage reasons <verified/not applicable>
Physical availability: current/available <n/n>; equal <yes/no>
PA reconciliation: <not executed|committed import id>; replay <not tested|idempotent>
Workbook: <not generated|downloaded>; rows <count>
Provider/physical-stock actions invoked: 0
Automated gates: <commands and result>
Blockers: <none or exact blocker>
```
