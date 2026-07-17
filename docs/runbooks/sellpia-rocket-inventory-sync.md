# Sellpia Inventory And Rocket Confirmation Boundary

## Purpose

Release `0.1.20` keeps Sellpia as the physical inventory authority and adds an
operator-confirmed Rocket capacity commitment after the deterministic preview.
Rocket collection may persist observed channel identities, calculate how much
can be fulfilled from a fresh Sellpia snapshot, persist an internal component
allocation, and generate the official confirmation workbook. Confirmation must
not create a provider order or mutate physical inventory.

Automatic freshness operation and recovery are defined in
[Sellpia Inventory Freshness Operations](sellpia-inventory-freshness.md).
Component matching is defined in
[Import Channel Data And Match Sellpia Components](channel-sellpia-matching.md).

## Authority Boundary

```text
authenticated Sellpia full option-product export
  -> Inventory validation + fenced full-snapshot publication
  -> SellpiaInventorySku.currentStock

authenticated Rocket PO collection
  -> Channels validates active organization Rocket account + vendor identity
  -> non-destructive ChannelListing / ChannelListingOption identity upsert
  -> Supply reads a fresh Inventory capacity snapshot
  -> deterministic in-memory preview
  -> operator reviews every quantity and shortage reason
  -> Supply reruns preview under lock and persists component allocations
  -> browser downloads official workbook
  -> no provider submit / no Sellpia stock write
```

Inventory owns freshness, publication, physical `SellpiaInventorySku`, and
`currentStock`. Channels owns Rocket `ChannelAccount` and observed listing/SKU
identity. Products owns the operator-confirmed `ProductVariantComponent`
recipes. Supply owns the preview calculation, Rocket confirmation/allocation
lifecycle, and the ordinary purchase-order submission boundary; it may compare
Inventory's opaque fence but does not derive freshness or write inventory state.

## Rocket Collection Contract

1. Use an active organization-owned `ChannelAccount` whose stored channel is
   exactly `rocket`. Never infer Rocket from its display name.
2. In the existing decision area on `/rocket-orders`, choose the account and
   collect the intended ETA range through the order-collector extension.
3. The extension returns a caller UUID `collectionRunId`, the non-display
   `vendorId`, page/detail counts, truncation, failed PO numbers, and stable PO
   line identities. `vendorName` is never accepted as identity.
4. Collection is incomplete when non-empty results have missing/mixed vendor
   IDs, any requested PO detail failed, or the 20-list-page/40-detail-page
   safety limits truncate the result. A complete zero-PO result legitimately
   has no collected vendor ID; after validating the selected active account,
   the server returns an empty result without publishing a catalog artifact.
5. Channels validates organization, account, active status, channel, and vendor
   identity, canonicalizes the artifact, and calculates its SHA-256 on the
   server. A duplicate completed artifact is reused.
6. Publication upserts observed Rocket identities without inactivating older
   Rocket identities that are absent from a later PO collection. Existing
   confirmed recipes are preserved.
7. Confirmation-capable collection additionally requires the allowlisted
   official-workbook fields for every line. Missing fields block confirmation;
   they are never synthesized from names or copied from another PO.

Incomplete or vendor-mismatched collection cannot produce a usable preview.
Correct the account/session or narrow the date range and recollect; never fill
missing evidence manually.

## Preview Calculation

Before allocation, Supply requires a fresh Inventory read containing the same
verified generation, opaque fence, active state, and `currentStock` for every
confirmed recipe component. Stale inventory returns
`SELLPIA_SYNC_REQUIRED`; the UI joins the automatic refresh before another
preview.

Rows are allocated in stable ETA, PO, and line order. For each confirmed
component:

```text
component capacity = floor(currentStock / component quantity per sale)
row capacity = min(PO order quantity, minimum remaining component capacity)
```

Shared components are consumed once in memory across all preview rows. Edited
quantities are validated against recomputed remaining capacity. During
recollection, retained edits are first clamped against a fresh unedited
baseline and then jointly clamped in the same stable allocation order.

Explicit block reasons cover incomplete collection, vendor mismatch, missing
mapping, inactive component, and insufficient capacity. Missing mapping is not
treated as a confirmed zero-capacity recipe.

## Confirmation And Release

1. Review every row quantity. Every line must have an explicit value; every
   quantity below the PO order quantity must use one controlled shortage reason.
2. Choose **확정 후 엑셀 다운로드**. The browser sends a stable UUID idempotency
   key through `POST /api/purchase-orders { action: 'confirmRocket' }`.
3. Supply reruns the canonical preview, locks organization capacity, verifies
   the current completed source run and Inventory generation, and compares the
   current channel option/variant/component recipe with the preview.
4. Supply persists `RocketPurchaseConfirmation`, line decisions, and immutable
   component allocations. Active allocations reduce later previews; Sellpia
   `currentStock` is unchanged.
5. Only after the server commit succeeds does the browser generate and download
   the 23-column official workbook. Replaying the same key and input returns the
   existing confirmation; changed input with the same key is rejected.
6. When the decision is cancelled, or after the physical movement appears in a
   completed Sellpia snapshot, enter an explicit reason and choose **예약
   종료**. Release records actor/time/reason and stops subtracting the allocation.
   Recalculate before confirming again. Do not infer that an arbitrary newer
   snapshot contains this PO; the operator closes the reservation only with
   actual operational evidence.

This confirmation is KidItem's internal decision and capacity commitment. It is
not proof of Coupang acceptance and does not call a marketplace provider.

## Owned Screens

| Route | Responsibility |
|---|---|
| `/rocket-orders` | Preserved `c9e7caf8` calendar/list/file-history UI with the stale capacity-decision placeholder replaced by authenticated collection, completeness evidence, editable deterministic preview, confirmation/workbook, and release. |
| `/purchase-orders` | General supplier purchase-order operations only. |
| `/product-hub/matching` | Baseline Coupang/Rocket SKU queue and exact Sellpia component-recipe confirmation workspace. |
| `/inventory-hub?tab=sellpia-sync` | Shared Sellpia freshness status, current basis, attempts, warnings, and manual fallback. |
| `/stock-ops` | Baseline inventory analysis: Sellpia/channel zero stock, bottlenecks, mapping attention, inventory value, freshness, transfer, and return records. |

On `/rocket-orders`, integrate the Supply-owned contract only at the existing
capacity-decision placeholder; do not replace the calendar/list/file-history
shell or expose a duplicate Rocket review workspace under `/purchase-orders`.

## Record-Only Operations

`StockTransfer`, `PickingItem`, `ReturnTransfer`, and receipt/upload records may
reference physical `SellpiaInventorySku` identities. Their status changes do not
write `currentStock`. The next completed Sellpia full snapshot is the evidence
for a real-world stock change.

## Forbidden Actions

- Do not call a Rocket marketplace provider or describe the internal
  confirmation as provider acceptance.
- Do not add `/api/orders/rocket/*`; confirmation and release stay on the
  Supply `/api/purchase-orders` action contract.
- Do not create a Rocket-only inventory balance or ledger.
- Do not treat a collection request, preview, or edit as a commitment. Only a
  successful active `RocketPurchaseConfirmation` reserves component capacity.
- Do not infer vendor identity from a display name or bypass incomplete
  evidence.
- Do not calculate preview capacity from stale cached channel availability.
- Preserved inventory and ledger screens must remain record-only with respect
  to `SellpiaInventorySku.currentStock`; do not add receive/issue/adjust/reserve/
  release actions that write the Sellpia-owned balance.

## Failure Recovery

| Symptom | Safe recovery |
|---|---|
| Rocket account missing/inactive | Select or configure an active organization-owned `channel='rocket'` account. |
| Vendor mismatch | Sign in to the intended Coupang supplier account or select the matching Rocket ChannelAccount. Recollect; do not override the ID. |
| Missing/truncated details | Narrow the date range, restore the provider page/session, and recollect until completeness evidence is clean. |
| SKU is unmapped | Open `/product-hub/matching` and confirm the entire recipe; do not infer quantity from a title. |
| Recipe component inactive | Review and replace/confirm the recipe. Persisted mapping remains diagnosable and appears in `needs_review`. |
| `SELLPIA_SYNC_REQUIRED` | Wait for the automatic Sellpia refresh and recompute from the fresh generation. |
| Edited quantity rejected | Recompute the preview and keep the edit within the jointly allocated remaining capacity. |
| Confirmation reports stale generation/source/recipe | Recollect and recompute. Do not reuse old rows or override the fence. |
| Idempotency conflict | Keep the existing decision or create a new confirmation intent with a new UUID after operator review. |
| Workbook generation fails after confirmation | The server allocation is still active. Retry the same intent to regenerate, or explicitly release it with a reason. |
| Capacity is no longer needed | Release the active confirmation with an explicit reason, then recompute. |

## Verification

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/rocket-purchase-preview.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory src/channels src/supply
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/rocket-po-catalog.repository.pg.integration.spec.ts src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts src/supply/__tests__/rocket-purchase-confirmation.pg.integration.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/\(supply\)/purchase-orders src/app/\(orders\)/rocket-orders/lib/rocket-purchase-decision-boundary.spec.ts
rtk node --test extensions/tests/order-collector-rocket-sales-contract.test.mjs extensions/tests/order-collector-action-coverage.test.mjs
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
```

The boundary and integration tests must prove confirmation stays in Supply,
replays idempotently, rejects request drift/stale generations/recipe drift,
serializes concurrent capacity, releases allocations, and has no provider or
physical-stock-write lane.

## Blockers

Stop and report when collection completeness or workbook fields cannot be
established, the Rocket account/vendor cannot be scoped, freshness cannot be
established, a confirmed recipe contains unresolved inactive components, or
any marketplace provider/physical-stock side effect is reachable.

## Final Report Format

```text
Release: 0.1.20
Rocket account/vendor: <sanitized account id>; matched <yes/no>
Collection: complete <yes/no>; list pages <n>; details <n>; failed <count>; truncated <yes/no>
Catalog publication: <new|duplicate>; rows <count>
Sellpia freshness generation: <decimal string>
Preview: rows <count>; blocked <count>; edited bounds verified <yes/no>
Confirmation: <not executed|active id>; idempotent <yes/no>; shortage reasons <verified/not applicable>
Shared-component allocation: <quantity>; release <not executed|released with reason>
Workbook: <not generated|downloaded>; rows <count>
Provider/physical-stock actions invoked: 0
Automated gates: <commands and result>
Blockers: <none or exact blocker>
```
