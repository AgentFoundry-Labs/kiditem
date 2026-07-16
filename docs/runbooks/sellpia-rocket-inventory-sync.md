# Sellpia Inventory And Rocket Preview Boundary

## Purpose

Release `0.1.19` keeps Sellpia as the physical inventory authority and allows
Rocket purchase-order review only as a deterministic preview. Rocket collection
may persist observed channel identities and calculate how much could be
fulfilled from a fresh Sellpia snapshot. It must not confirm a purchase order,
reserve stock, create a provider order, generate a confirmation workbook, or
mutate inventory.

Automatic freshness operation and recovery are defined in
[Sellpia Inventory Freshness Operations](sellpia-inventory-freshness.md).
Component matching is defined in
[Import Channel Data And Match Sellpia Components](channel-sellpia-matching.md).

## Authority Boundary

```text
authenticated Sellpia full option-product export
  -> Inventory validation + fenced full-snapshot publication
  -> MasterProduct.currentStock

authenticated Rocket PO collection
  -> Channels validates active organization Rocket account + vendor identity
  -> non-destructive ChannelProduct / ChannelSku identity upsert
  -> Supply reads a fresh Inventory capacity snapshot
  -> deterministic in-memory preview
  -> no submit / reserve / workbook / stock write
```

Inventory owns freshness, publication, and `currentStock`. Channels owns
Rocket `ChannelAccount`, observed listing/SKU identity, and operator-confirmed
component recipes. Supply owns the preview calculation and the ordinary
purchase-order submission boundary; it may compare Inventory's opaque fence but
does not derive freshness or write inventory state.

## Rocket Collection Contract

1. Use an active organization-owned `ChannelAccount` whose stored channel is
   exactly `rocket`. Never infer Rocket from its display name.
2. In the existing decision area on `/rocket-orders` (or the additive
   `/purchase-orders?tab=rocket` preview), choose the account and collect the
   intended ETA range through the order-collector extension.
3. The extension returns a caller UUID `collectionRunId`, the non-display
   `vendorId`, page/detail counts, truncation, failed PO numbers, and stable PO
   line identities. `vendorName` is never accepted as identity.
4. Collection is incomplete when vendor IDs are missing/mixed, any requested PO
   detail failed, or the 20-list-page/40-detail-page safety limits truncate the
   result.
5. Channels validates organization, account, active status, channel, and vendor
   identity, canonicalizes the artifact, and calculates its SHA-256 on the
   server. A duplicate completed artifact is reused.
6. Publication upserts observed Rocket identities without inactivating older
   Rocket identities that are absent from a later PO collection. Existing
   confirmed recipes are preserved.

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
row capacity = minimum remaining component capacity
```

Shared components are consumed once in memory across all preview rows. Edited
quantities are validated against recomputed remaining capacity. During
recollection, retained edits are first clamped against a fresh unedited
baseline and then jointly clamped in the same stable allocation order.

Explicit block reasons cover incomplete collection, vendor mismatch, missing
mapping, inactive component, and insufficient capacity. Missing mapping is not
treated as a confirmed zero-capacity recipe.

The only primary action is **미리보기 다시 계산**. **로켓 발주 확정** remains
disabled with `0.1.19에서는 검토만 가능`.

## Owned Screens

| Route | Responsibility |
|---|---|
| `/purchase-orders?tab=rocket` | Additive account selection, authenticated collection, completeness evidence, editable deterministic preview, disabled confirmation. |
| `/rocket-orders` | Preserved `c9e7caf8` calendar/list/file-history UI with the stale capacity-decision placeholder replaced by the same Sellpia preview contract. |
| `/product-hub/matching` | Baseline Coupang/Rocket SKU queue and exact Sellpia component-recipe confirmation workspace. |
| `/inventory-hub?tab=sellpia-sync` | Shared Sellpia freshness status, current basis, attempts, warnings, and manual fallback. |
| `/stock-ops` | Baseline inventory analysis: Sellpia/channel zero stock, bottlenecks, mapping attention, inventory value, freshness, transfer, and return records. |

The two Rocket routes keep their own layouts and do not redirect to each other.
They may consume the same preview contract. On `/rocket-orders`, integrate it
only at the existing capacity-decision placeholder; do not replace the
calendar/list/file-history shell.

## Record-Only Operations

`StockTransfer`, `PickingItem`, `ReturnTransfer`, and receipt/upload records may
reference physical `MasterProduct` identities. Their status changes do not
write `currentStock`. The next completed Sellpia full snapshot is the evidence
for a real-world stock change.

## Forbidden Actions

- Do not add or call a Rocket confirmation, provider submission, reservation,
  commitment, allocation persistence, confirmation workbook, or stock mutation.
- Do not create a Rocket-only inventory balance or ledger.
- Do not treat a collection request, preview, edit, or disabled action as a
  provider commitment.
- Do not infer vendor identity from a display name or bypass incomplete
  evidence.
- Do not calculate preview capacity from stale cached channel availability.
- Preserved inventory and ledger screens must remain record-only with respect
  to `MasterProduct.currentStock`; do not add receive/issue/adjust/reserve/
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
| A submit-like control appears | Stop. The `0.1.19` boundary has drifted; run the preview-only contract test before any use. |

## Verification

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/rocket-purchase-preview.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory src/channels src/supply
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/rocket-po-catalog.repository.pg.integration.spec.ts src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/\(supply\)/purchase-orders src/app/\(orders\)/rocket-orders/lib/rocket-purchase-decision-boundary.spec.ts
rtk node --test extensions/tests/order-collector-rocket-sales-contract.test.mjs extensions/tests/order-collector-action-coverage.test.mjs
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
```

The boundary test must prove there is no callable actual-submit control and no
reservation, commitment, workbook, provider, attempt, or stock-write lane in
the Rocket preview flow.

## Blockers

Stop and report when collection completeness cannot be established, the Rocket
account/vendor cannot be scoped, freshness cannot be established, a confirmed
recipe contains unresolved inactive components, or any actual Rocket side
effect is reachable.

## Final Report Format

```text
Release: 0.1.19
Rocket account/vendor: <sanitized account id>; matched <yes/no>
Collection: complete <yes/no>; list pages <n>; details <n>; failed <count>; truncated <yes/no>
Catalog publication: <new|duplicate>; rows <count>
Sellpia freshness generation: <decimal string>
Preview: rows <count>; blocked <count>; edited bounds verified <yes/no>
Shared-component allocation: <verified/not executed>
Provider/reservation/workbook/stock actions invoked: 0
Automated gates: <commands and result>
Blockers: <none or exact blocker>
```
