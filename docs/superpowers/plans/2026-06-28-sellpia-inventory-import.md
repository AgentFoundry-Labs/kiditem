# Sellpia + Coupang Rocket Inventory Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`
> for implementation. Use `superpowers:test-driven-development` for behavior
> that changes stock, reservations, or persisted sync state. Keep this file out
> of git unless the user explicitly asks to publish the scratch plan.

**Last checked:** 2026-06-29 after PR #310 was merged into `develop`.

**Goal:** KidItem manages one physical inventory pool by combining Sellpia full
stock exports, KidItem-owned inbound receipts, and KidItem-owned Coupang Rocket
stock movements. Sellpia remains the operational system for non-Rocket malls.
Coupang Rocket is not automatically reflected in Sellpia, so Rocket stock must
be tracked inside KidItem.

**Architecture:** Inventory owns stock state, stock mutations, reservations,
Sellpia baseline imports, and Rocket inventory ledger events. Orders owns Rocket
PO collection and confirmation-file UX. The Rocket order surface may call an
Inventory use-case port, but it must not write inventory rows or ledger rows
directly.

**Tech Stack:** NestJS, Prisma, @e965/xlsx, Zod, Next.js App Router, React
Query, Tailwind CSS, lucide-react, Vitest.

---

## PR 310 Baseline

PR #310 merged on 2026-06-29 as
`c106204af577d71b011bcec7fba4e425c1de565c`.

Already implemented by PR #310:

- `/rocket-orders` UI for Coupang Rocket PO collection, preview, editing, and
  confirm Excel generation.
- `POST /api/orders/rocket/confirm-preview`.
- `POST /api/orders/rocket/confirm-generate`.
- `POST /api/orders/rocket/confirm-fill`.
- `RocketPoConfirmService` calculates confirm quantity from backend inventory
  availability as `currentStock - reservedStock`.
- `RocketPoConfirmService` already depletes availability across duplicate
  barcode rows in one preview/generate request.
- `RocketPoConfirmService` supports edited `confirmQty`.
- `RocketPurchaseOrder` and `RocketSupplyDailySnapshot` are persisted when
  entering preview/generate flows.
- `RocketPurchaseOrder.businessDate` and `RocketSupplyDailySnapshot.businessDate`
  are based on Coupang Rocket expected inbound date in KST, not PO ordered date.
- `/coupang-shipments` server storage is organization-directory isolated.

Not implemented by PR #310:

- Rocket PO confirmation does not reserve stock.
- Rocket shipment/outbound completion does not decrement stock.
- Rocket return/restock does not increment stock.
- `reservedStock` has no inventory use case yet.
- Sellpia stock imports are not persisted.
- Sellpia import does not create operator-approved adjustment candidates.
- Sellpia review queue does not exist.
- Sellpia unmatched rows are not captured as new product candidates.
- Current product UI can create `MasterProduct` and the backend can create
  `ProductOption`, but there is no complete operator flow that creates
  `MasterProduct + ProductOption + Inventory + initial RECEIVE` from a Sellpia
  row.
- KidItem inbound receipt does not generate a Sellpia upload workbook.
- Coupang shipment files are listed/downloaded only; shipment quantities are not
  parsed or applied to inventory.

## Operational Model

Sellpia:

- Sellpia contains the non-Rocket mall inventory state.
- Non-Rocket orders are collected into Sellpia and handled there.
- KidItem imports Sellpia stock rows for row-scoped reconciliation.
- Uploaded files do not need to be full exports. KidItem only considers rows
  present in the file.
- Products absent from the uploaded file are ignored; no missing/deleted/zero
  stock conclusion is drawn from absence.
- The stock reference column is `재고`.
- Ignore these Sellpia columns for stock policy:
  - `상품분류`
  - `품절`
  - `품절일`
  - `단종`
  - `단종일`

Coupang Rocket:

- Coupang Rocket is not automatically reflected in Sellpia.
- KidItem manually manages Rocket stock effects.
- Rocket PO confirmation reserves stock in KidItem.
- Rocket shipment/outbound completion releases reservation and decrements
  current stock.
- Rocket return/restock manually increments current stock in the first version.
- Rocket stock events are never reconciled back into Sellpia as if Sellpia had
  generated them.

Inbound receipts:

- Receipts are entered in KidItem first.
- KidItem increments `Inventory.currentStock` immediately.
- KidItem tracks the receipt batch as needing Sellpia upload.
- Sellpia upload workbook generation is implemented behind a template adapter.
- Until the official Sellpia receipt-upload template is confirmed, the batch
  stays in `template_pending`/`pending_upload` state instead of emitting an
  operator-facing workbook.
- After the template is configured, KidItem generates the Sellpia upload
  workbook and the operator uploads that workbook to Sellpia.
- A later Sellpia export row for that product should then match KidItem unless
  other movement happened in between.

Inventory numbers:

- `Inventory.currentStock` is KidItem's live physical stock estimate.
- `Inventory.reservedStock` is stock promised to Rocket but not shipped yet.
- Available stock for new Rocket confirmation is
  `max(0, currentStock - reservedStock)`.
- Sellpia import never adjusts `currentStock` automatically.
- Sellpia import computes recommended target stock and creates review rows.
- `currentStock` changes only after an operator enters or confirms a final
  target quantity and approves the row.
- Sellpia import must not blindly set KidItem stock to Sellpia `재고`.
  Sellpia does not contain Rocket issue/return effects, so the import target is:

```text
targetCurrentStock = sellpiaStock + rocketLedgerNet
diff = targetCurrentStock - kiditemStockBefore
```

`rocketLedgerNet` is the sum of Rocket stock-impact events that Sellpia will
never contain, calculated for the option up to the snapshot's
`effectiveExportedAt`.

Rocket ledger contribution:

- `RESERVE`: `0` stock impact
- `RELEASE`: `0` stock impact
- `ISSUE`: negative stock impact
- `RETURN_RESTOCK`: positive stock impact

## Matching Policy

Primary Sellpia match:

- Sellpia `상품코드` -> `ProductOption.legacyCode`

Unmatched Sellpia rows:

- Treat unmatched rows as new product candidates, not as stock adjustment rows.
- Do not auto-create `MasterProduct`, `ProductOption`, `Inventory`, or stock
  transactions from unmatched rows.
- Show Sellpia product code, name, stock, safety stock, barcode/model
  diagnostics, and candidate status.
- Route them to an explicit operator flow that can create or link a product.
- After a candidate is resolved to a `ProductOption` and an `Inventory` row
  exists, the row can be reprocessed or included in the next import.

Diagnostic fields only:

- `자사상품코드`
- `바코드`
- barcode-like `모델명`

The first implementation must not silently match by barcode. Barcode duplicates
are common enough that barcode fallback can create false confidence.

Rocket match:

- PR #310 currently matches Rocket rows primarily by barcode for confirm
  preview/generation.
- Keep PR #310's duplicate-barcode depletion behavior.
- When committing reservations or shipments, persist enough source metadata to
  trace the original Rocket PO row and barcode that produced the inventory event.

## Sellpia Import Policy

Sellpia import is row-scoped. Every uploaded row is parsed and stored, but only
rows with a resolved `ProductOption` and `Inventory` can become
operator-approvable adjustment recommendations.

Every import stores a durable snapshot:

- file name
- file hash
- upload time
- effective export time
- row count
- parse warnings
- ignored-column summary
- source headers
- per-row normalized values

Effective export time:

- Default to the uploaded file's `lastModified`.
- Allow manual override in the UI.
- Store the selected value on the snapshot.
- All safety checks use the stored effective export time.

Recommended adjustment row requirements:

- Sellpia row has exactly one usable `상품코드`.
- No duplicate `상품코드` exists in the snapshot.
- `ProductOption.legacyCode` match exists in the same organization.
- Inventory row exists.
- `rocketLedgerNet` is calculated from Rocket stock-impact events up to
  `effectiveExportedAt`.
- `targetCurrentStock = sellpiaStock + rocketLedgerNet`.
- `targetCurrentStock` is not negative.
- No KidItem stock event for that option occurred after effective export time.
- `diff = targetCurrentStock - kiditemStockBefore`.
- `diffRate = abs(diff) / max(kiditemStockBefore, targetCurrentStock, 1)`.
- Row has no parse warning that affects stock or identity.

Rows that pass these checks are marked as recommended adjustment candidates.
Rows that fail enter the review queue as blocked or needs-review rows.

Large-difference policy:

- `abs(diff) >= 20` or `diffRate >= 30%` is a strong warning, not a hard
  approval block.
- The operator can still approve after entering or confirming the final target
  quantity.
- A reason is required when a row is large-difference flagged.
- A reason is also required whenever the operator-entered target quantity differs
  from `targetCurrentStock`.

Blocking reasons include:

- missing option
- missing inventory
- duplicate Sellpia code
- invalid stock value
- negative target
- row parse warning
- recent KidItem event after export time
 
Warning reasons include:

- diff absolute value greater than or equal to 20
- diff rate greater than or equal to 30%

New product candidate handling:

- If no active `ProductOption.legacyCode` matches the Sellpia `상품코드`, store
  the row as a `new_product_candidate`.
- A candidate is not approvable as a stock adjustment.
- Candidate resolution must be an explicit operator action.
- Resolution options:
  - create a new `MasterProduct` and `ProductOption`;
  - link to an existing `MasterProduct` by creating a new `ProductOption`;
  - link to an existing `ProductOption` only when the operator confirms the
    Sellpia code should become that option's `legacyCode`.
- Creating or linking the product must also ensure a non-bundle `Inventory` row
  exists.
- Initial stock for a newly resolved candidate is created through an operator
  approved `RECEIVE`, not by directly setting `Inventory.currentStock`.
- The initial receive quantity may be prefilled from Sellpia `재고`, but the
  operator can edit it before approval.
- Resolving a candidate also creates or queues the Sellpia upload tracking
  state needed for inbound synchronization when the flow represents a KidItem
  receipt.

Review queue actions:

- `approve`: operator enters or confirms the final target quantity, then applies
  the adjustment.
- `ignore`: keep current stock and record the decision.
- `manual_adjust`: let the operator enter an explicit adjustment reason/qty.

Reason requirements:

- Recommended target quantity unchanged and not large-difference flagged:
  reason optional.
- Large-difference flagged: reason required.
- Operator target quantity differs from `targetCurrentStock`: reason required.
- Manual adjust: reason required.
- Ignore: reason optional.

Sellpia adjustments:

- No import request creates a `StockTransaction` by itself.
- No "apply all safe rows" endpoint exists.
- Selected bulk approval is allowed, but only for explicitly selected rows.
- Every selected row carries a final target quantity; the UI may prefill it with
  `targetCurrentStock`, but the operator can edit it before approval.
- At apply time, the service re-reads the latest inventory row, rechecks the
  row's safety state, and derives the adjustment delta from the operator's
  final target quantity.
- Large-difference rows are allowed at apply time only when the row carries the
  required operator reason.
- Use the existing stock mutation path and row lock.
- Store the `StockTransaction` as `type = ADJUST`.
- Set `relatedType` to a Sellpia-specific value.
- Set `relatedId` to the Sellpia snapshot item id.
- Recompute bundle stock through the existing Inventory flow.

## Rocket Inventory Policy

Do not reserve stock during preview or file generation.

Preview/generate can be repeated many times. Reservation must happen only after
an explicit operator action such as "commit confirmation" or "mark confirm file
submitted".

Rocket reservation:

- Input is the final confirmed Rocket rows and edited confirm quantities.
- Increase `Inventory.reservedStock`.
- Do not change `Inventory.currentStock`.
- Write a Rocket inventory ledger event with `eventType = RESERVE`.
- Be idempotent by organization, PO, line identity, event type, and source
  action id.

Rocket release:

- Used when a committed confirmation is canceled before shipment.
- Decrease `Inventory.reservedStock`.
- Do not change `Inventory.currentStock`.
- Write `eventType = RELEASE`.
- Refuse to release more than the currently open reservation for that source.

Rocket shipment/outbound completion:

- In phase 1, treat this as a manual completion action from the Rocket/shipment
  workflow. Do not depend on shipment PDF parsing.
- Decrease `Inventory.reservedStock`.
- Decrease `Inventory.currentStock`.
- Append a `StockTransaction` with `type = ISSUE` and `relatedType` identifying
  Rocket shipment.
- Write `eventType = ISSUE`.
- Refuse to issue more than the currently open reservation by default.
- Allow over-reservation issue only for an admin/inventory manager override with
  a required reason.
- Record `overrideBy`, `overrideReason`, and `overReservationQty` on the Rocket
  ledger event/audit metadata.

Rocket return/restock:

- In phase 1, provide manual entry.
- Increase `Inventory.currentStock`.
- Append a `StockTransaction` using the existing inventory in-flow type and a
  Rocket return `relatedType`.
- Write `eventType = RETURN_RESTOCK`.
- Do not write this event into Sellpia or pretend Sellpia already knows about
  it.

## Data Model Plan

Add to `prisma/models/inventory.prisma`:

- `SellpiaStockSnapshot`
- `SellpiaStockSnapshotItem`
- `SellpiaNewProductCandidate`
- `RocketInventoryLedger`

Suggested `SellpiaStockSnapshot` fields:

- `id`
- `organizationId`
- `fileName`
- `fileHash`
- `rowCount`
- `effectiveExportedAt`
- `uploadedAt`
- `status`
- `createdBy`
- `metaJson`
- timestamps

Suggested `SellpiaStockSnapshotItem` fields:

- `id`
- `organizationId`
- `snapshotId`
- `rowNumber`
- `sellpiaProductCode`
- `productOptionId`
- `inventoryId`
- `sellpiaStock`
- `safetyStock`
- `ownProductCode`
- `barcode`
- `modelName`
- `rocketLedgerNet`
- `targetCurrentStock`
- `kiditemStockBefore`
- `operatorTargetStock`
- `kiditemStockAtApply`
- `diff`
- `diffRate`
- `status`
- `blockingReasons`
- `appliedTransactionId`
- `reviewedBy`
- `reviewedAt`
- `reviewDecision`
- `reviewNote`

Do not add a unique constraint on `(snapshotId, sellpiaProductCode)` unless the
implementation stores duplicate rows elsewhere first. Duplicate rows must be
visible to operators.

Suggested `SellpiaNewProductCandidate` fields:

- `id`
- `organizationId`
- `snapshotItemId`
- `sellpiaProductCode`
- `sellpiaProductName`
- `sellpiaStock`
- `safetyStock`
- `ownProductCode`
- `barcode`
- `modelName`
- `status`
- `resolvedMasterProductId`
- `resolvedProductOptionId`
- `createdInventoryId`
- `initialReceiveTransactionId`
- `operatorInitialStock`
- `resolutionDecision`
- `resolvedBy`
- `resolvedAt`
- `note`
- timestamps

Candidate statuses:

- `pending`
- `linked_existing_option`
- `created_new_option`
- `ignored`
- `rejected`

Suggested `RocketInventoryLedger` fields:

- `id`
- `organizationId`
- `inventoryId`
- `optionId`
- `eventType`
- `quantity`
- `reservedDelta`
- `stockDelta`
- `rocketPoSeq`
- `rocketPoLineKey`
- `sourceActionId`
- `sourceType`
- `sourceRef`
- `occurredAt`
- `createdBy`
- `note`
- `metaJson`
- timestamps

Rocket ledger stock impact policy:

- `reservedDelta` changes only `Inventory.reservedStock`.
- `stockDelta` changes only `Inventory.currentStock`.
- `RESERVE`: `reservedDelta > 0`, `stockDelta = 0`
- `RELEASE`: `reservedDelta < 0`, `stockDelta = 0`
- `ISSUE`: `reservedDelta < 0`, `stockDelta < 0`
- `RETURN_RESTOCK`: `reservedDelta = 0`, `stockDelta > 0`
- Sellpia import uses `sum(stockDelta)` as `rocketLedgerNet`; it never uses
  reservation-only events to change the Sellpia target.

Use indexes for:

- `(organizationId, createdAt)`
- `(organizationId, inventoryId, createdAt)`
- `(organizationId, rocketPoSeq)`
- `(organizationId, sourceActionId, eventType)`

Do not create hard Prisma relations from Inventory ledger rows to Channels-owned
Rocket read models. Store source references and query across domains through
application services.

Versioning:

- Current `VERSION` is `0.1.6`.
- This plan introduces persisted schema and stock behavior changes.
- Implementation must either bump to the next patch version or explicitly state
  why `0.1.6` remains valid.

## Backend File Map

Create shared contracts:

- `packages/shared/src/schemas/sellpia-inventory-sync.ts`
- `packages/shared/src/schemas/sellpia-new-product-candidate.ts`
- `packages/shared/src/schemas/rocket-inventory.ts`
- `packages/shared/src/sellpia-inventory-sync.ts`
- `packages/shared/src/sellpia-new-product-candidate.ts`
- `packages/shared/src/rocket-inventory.ts`

Modify shared package exports:

- `packages/shared/package.json`

Create Inventory incoming ports:

- `apps/server/src/inventory/application/port/in/stock/sellpia-sync.port.ts`
- `apps/server/src/inventory/application/port/in/stock/sellpia-new-product-candidate.port.ts`
- `apps/server/src/inventory/application/port/in/stock/rocket-inventory.port.ts`

Create Inventory repository ports:

- `apps/server/src/inventory/application/port/out/repository/sellpia-sync.repository.port.ts`
- `apps/server/src/inventory/application/port/out/repository/sellpia-new-product-candidate.repository.port.ts`
- `apps/server/src/inventory/application/port/out/repository/rocket-inventory.repository.port.ts`

Create Inventory services:

- `apps/server/src/inventory/application/service/sellpia-sync.service.ts`
- `apps/server/src/inventory/application/service/sellpia-workbook.parser.ts`
- `apps/server/src/inventory/application/service/sellpia-upload-workbook.service.ts`
- `apps/server/src/inventory/application/service/sellpia-new-product-candidate.service.ts`
- `apps/server/src/inventory/application/service/rocket-inventory.service.ts`

Create Inventory domain policies:

- `apps/server/src/inventory/domain/policy/sellpia-adjustment-recommendation.ts`
- `apps/server/src/inventory/domain/policy/rocket-inventory-event.ts`

Create repository adapters:

- `apps/server/src/inventory/adapter/out/repository/sellpia-sync.repository.adapter.ts`
- `apps/server/src/inventory/adapter/out/repository/sellpia-new-product-candidate.repository.adapter.ts`
- `apps/server/src/inventory/adapter/out/repository/rocket-inventory.repository.adapter.ts`

Create HTTP adapters:

- `apps/server/src/inventory/adapter/in/http/sellpia-sync.controller.ts`
- `apps/server/src/inventory/adapter/in/http/sellpia-new-product-candidates.controller.ts`
- `apps/server/src/inventory/adapter/in/http/rocket-inventory.controller.ts`
- DTOs under `apps/server/src/inventory/adapter/in/http/dto/`

Modify:

- `apps/server/src/inventory/inventory.module.ts`
- `apps/server/src/inventory/application/port/in/stock/index.ts`
- `apps/server/src/inventory/application/port/out/repository/index.ts`
- `apps/server/src/inventory/application/port/in/stock/inventory.port.ts`
  only if the existing `INVENTORY_PORT` becomes the cross-domain entry point
  for Rocket reservation/issue.
- `apps/server/src/orders/controllers/rocket-po.controller.ts`
  only for an explicit commit endpoint that delegates to Inventory.
- `apps/server/src/orders/services/rocket-po-confirm.service.ts`
  only to avoid duplicate stock math or to pass final confirmed rows to the new
  Inventory port.
- `apps/server/src/inventory/adapter/out/products/`
  to call Products owner ports for candidate resolution, instead of importing
  Products services directly.

Do not add direct `PrismaService` usage outside Inventory repository adapters
for these stock writes.
Do not create products from Sellpia rows inside parser code or repository
adapters. Candidate resolution is a separate operator-approved use case.

## API Plan

Sellpia:

- `POST /api/inventory/sellpia-sync/import`
  - Multipart XLSX upload.
  - Creates snapshot and items.
  - Returns summary, recommended adjustment candidates, blocked rows, and new
    product candidates.
- `POST /api/inventory/sellpia-sync/snapshots/:id/apply-selected`
  - Applies only explicitly selected rows.
  - Each selected row must include the operator-confirmed target quantity.
  - Rechecks safety and latest inventory before creating any adjustment.
- `POST /api/inventory/sellpia-sync/items/:id/approve`
  - Applies one reviewed adjustment with an operator-confirmed target quantity.
- `POST /api/inventory/sellpia-sync/items/:id/ignore`
  - Records ignore decision.
- `POST /api/inventory/sellpia-sync/items/:id/manual-adjust`
  - Applies explicit operator adjustment with target quantity and reason.
- `GET /api/inventory/sellpia-sync/snapshots/:id`
  - Snapshot detail and review queue.
- `GET /api/inventory/sellpia-sync/new-product-candidates`
  - Lists pending/resolved candidates.
- `POST /api/inventory/sellpia-sync/new-product-candidates/:id/create-product`
  - Operator-approved path to create `MasterProduct`, `ProductOption`,
    `Inventory`, and optional initial `RECEIVE`.
- `POST /api/inventory/sellpia-sync/new-product-candidates/:id/create-option`
  - Operator-approved path to create a new option under an existing
    `MasterProduct`, ensure `Inventory`, and optional initial `RECEIVE`.
- `POST /api/inventory/sellpia-sync/new-product-candidates/:id/link-option`
  - Operator-approved path to link the Sellpia code to an existing
    `ProductOption`, ensure `Inventory`, and optional initial `RECEIVE`.
- `POST /api/inventory/sellpia-sync/new-product-candidates/:id/ignore`
  - Records that the Sellpia row should not create/link a product now.

Rocket:

- Keep PR #310 preview/generate endpoints.
- Add one explicit commit path after preview/generate. Preferred shape:
  `POST /api/orders/rocket/confirm-commit` delegating to Inventory port.
- Add manual release/cancel path if committed confirmation can be withdrawn.
- Add shipment completion path under the inventory/shipment surface.
- Add manual Rocket return/restock path under inventory.

The exact route names can change during implementation, but the boundary cannot:
Orders may orchestrate Rocket UX; Inventory must own stock mutations.

## Web Plan

Inventory hub:

- Add a `Sellpia 동기화` tab to `/inventory-hub`.
- Upload Sellpia stock XLSX.
- Treat the upload as row-scoped: only rows present in the file are considered.
- Do not show errors for products absent from the uploaded file.
- Let the operator set effective export time.
- Show import summary and file validation warnings.
- Show recommended rows separately from blocked rows.
- Prefill each recommended row's target quantity with `targetCurrentStock`.
- Let the operator edit the final target quantity before approval.
- Show large-difference rows with stronger warning styling and require an
  approval reason.
- Require a reason when the operator-entered target differs from the recommended
  target.
- Support row actions: approve, ignore, manual adjust.
- Support selected-row bulk approval.
- Do not provide whole-snapshot "approve all" or automatic apply.
- Show ignored Sellpia columns in a small import summary, not as editable stock
  controls.
- Show unmatched rows in a separate `신규 상품 후보` section.
- Candidate rows show Sellpia product code/name/stock/safety stock and barcode
  diagnostics.
- Candidate actions:
  - create new product + option;
  - create option under existing product;
  - link existing option;
  - ignore.
- Candidate resolution form includes editable initial stock quantity. It may
  default to Sellpia `재고`, but the operator confirms it before any `RECEIVE`.
- Candidate resolution does not run as part of selected-row stock adjustment
  approval.

Rocket orders:

- Keep PR #310 preview/edit/generate flow.
- Add explicit commit state after final confirm quantities are reviewed.
- Show whether a PO/line has been reserved.
- Prevent double commit for the same source action.
- Keep availability labels aligned with backend output.

Coupang shipments:

- Keep PR #310 file list/download behavior.
- Add manual shipment completion only when the backend use case is ready.
- Do not parse shipment PDF in phase 1.

Rocket returns:

- Add a simple manual return/restock entry point.
- Require option match, quantity, reason, and source reference.

## Test Plan

Shared:

- Sellpia import request/response contracts.
- Sellpia new product candidate contracts.
- Sellpia row status enum.
- Rocket inventory event contracts.

Parser:

- Reads `exported-list.xlsx`.
- Ignores `상품분류`, `품절`, `품절일`, `단종`, `단종일`.
- Uses `재고` as stock reference.
- Detects duplicate `상품코드`.
- Detects invalid/negative stock.
- Preserves diagnostic barcode/model fields.

Sellpia service:

- Missing option blocks.
- Missing option creates a `new_product_candidate` row.
- Missing inventory blocks.
- Candidate resolution creates or links product/option only through
  operator-approved use cases.
- Candidate resolution ensures `Inventory` exists before initial receive.
- Candidate initial stock is recorded as `RECEIVE`, never as direct
  `currentStock` assignment.
- Recent KidItem event after effective export time blocks.
- Target calculation uses `sellpiaStock + rocketLedgerNet`, not raw Sellpia
  stock.
- Reservation-only Rocket events do not affect `rocketLedgerNet`.
- Rocket issue/return events before or at effective export time affect
  `rocketLedgerNet`.
- Rocket issue/return events after effective export time block recommendation
  approval as recent KidItem events.
- `abs(diff) >= 20` marks a large-difference warning.
- `diffRate >= 30%` marks a large-difference warning.
- Large-difference warnings require an operator reason, but do not block
  approval.
- Importing a Sellpia file never creates an `ADJUST` transaction.
- Approved row applies one `ADJUST` transaction.
- Applying selected rows rechecks safety and latest stock inside the
  transaction.
- Adjustment delta is derived from the operator-confirmed target quantity at
  apply time.
- Approve/ignore/manual-adjust are idempotent.

Rocket service:

- Reserve increments `reservedStock` only.
- Release decrements `reservedStock` only.
- Issue decrements both `reservedStock` and `currentStock`.
- Return/restock increments `currentStock`.
- Idempotent source action cannot double reserve or double issue.
- Cannot release more than the open reservation.
- Cannot issue more than the open reservation without admin/inventory-manager
  override and a required reason.
- PR #310 duplicate barcode depletion still holds after reservations exist.

Repository:

- Tenant scoped row locks for every stock mutation.
- No direct stock writes outside Inventory repository adapters.
- Snapshot/item queries are organization scoped.
- Ledger source uniqueness enforces idempotency.

Web:

- Sellpia tab upload flow.
- Effective export time override.
- Recommended and blocked row filters.
- Large-difference warning badges.
- Conditional reason requirement for large differences or edited target
  quantities.
- New product candidate section and actions.
- Candidate resolution form with editable initial stock.
- Editable target quantity input.
- Review queue row actions.
- Selected-row bulk approval without whole-snapshot apply.
- Rocket commit disables repeated commit.
- Shipment completion and return forms validate required fields.

Wiring:

- Inventory module provider bindings.
- Orders module imports only the exported Inventory port if it needs Rocket
  commit orchestration.

## Implementation Tasks

- [ ] Add shared Sellpia and Rocket inventory contracts.
- [ ] Add shared Sellpia new product candidate contracts.
- [ ] Add failing parser and policy tests.
- [ ] Add Prisma models for Sellpia snapshots/items, new product candidates,
      and Rocket inventory ledger.
- [ ] Decide and document `VERSION` bump or no-bump rationale.
- [ ] Run `npx prisma generate`.
- [ ] Add Inventory repository methods for reserved-stock and stock-delta
      mutations under row lock.
- [ ] Add Sellpia parser.
- [ ] Add Sellpia adjustment recommendation and approval policy.
- [ ] Add Sellpia new product candidate service and controller.
- [ ] Add Products owner-port bridge for candidate product/option resolution.
- [ ] Add Sellpia sync service.
- [ ] Add Sellpia sync controller.
- [ ] Add Rocket inventory event policy.
- [ ] Add Rocket inventory service.
- [ ] Add Rocket commit/release/issue/return APIs.
- [ ] Wire Inventory module providers.
- [ ] Extend `/rocket-orders` with explicit commit state.
- [ ] Add `Sellpia 동기화` tab to `/inventory-hub`.
- [ ] Add `신규 상품 후보` section and resolution forms.
- [ ] Add shipment completion UI only after backend issue path is available.
- [ ] Add manual Rocket return/restock UI.
- [ ] Add Sellpia receipt-upload template adapter and `template_pending` state.
- [ ] Generate Sellpia upload workbook for KidItem inbound receipts once the
      official Sellpia upload template is confirmed.
- [ ] Add docs/runbook for operator workflow.

## Verification Gates

Schema changes:

```bash
npm run db:push
npx prisma generate
cd packages/shared && npm run build
```

Backend:

```bash
npm run build --workspace=apps/server
npm run dev:server
```

Frontend:

```bash
npm run build --workspace=apps/web
```

Focused tests:

```bash
npm exec --workspace=apps/server vitest -- run src/inventory
npm exec --workspace=apps/server vitest -- run src/orders
npm exec --workspace=apps/web vitest -- run src/app/\(inventory\)
npm exec --workspace=apps/web vitest -- run src/app/\(orders\)/rocket-orders
```

Manual QA:

- Import current Sellpia `exported-list.xlsx`.
- Confirm ignored columns do not affect stock decisions.
- Approve a recommended Sellpia row with an operator-entered target quantity and
  verify one `ADJUST` ledger entry.
- Approve selected Sellpia rows and verify only selected rows are adjusted.
- Approve a large-difference row with a required reason.
- Verify large-difference approval without a reason is rejected.
- Upload a partial row subset and verify only uploaded rows are considered.
- Block a row with recent KidItem event after effective export time.
- Resolve a new product candidate and verify `MasterProduct`, `ProductOption`,
  `Inventory`, and optional `RECEIVE` are created through owner ports.
- Verify unresolved candidates cannot be approved as stock adjustment rows.
- Preview Rocket PO, commit reservation, preview again, and verify available
  stock decreased by reserved quantity.
- Complete Rocket shipment and verify current/reserved stock both decrease.
- Attempt to issue more than the open Rocket reservation and verify it is
  rejected without admin/inventory-manager override and a reason.
- Enter Rocket return/restock and verify current stock increases.

## Important Non-Goals

- Do not implement marketplace stock push in this plan.
- Do not implement `ChannelSyncService.syncInventory()`.
- Do not compare every connected shopping mall's remote stock in phase 1.
- Do not auto-create `MasterProduct` or `ProductOption` from Sellpia rows.
  Creation/linking is allowed only through explicit candidate resolution.
- Do not import supplier phone/address fields.
- Do not parse Coupang shipment PDFs in phase 1.
- Do not make Sellpia aware of Rocket ledger events automatically.
