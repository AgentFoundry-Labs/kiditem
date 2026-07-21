Consult this document first instead of relying on memorized knowledge.

# web/rocket-orders - Preserved Rocket Operations

`app/(orders)/rocket-orders/` owns the independently reachable Rocket
operations UI from `c9e7caf8`. Keep the `RocketOrdersWorkspace` calendar,
list, chart, confirmation-panel position, and local file-history composition.
`/rocket-orders` is the only operator-facing Rocket review route.

## State Rules

- The selected Rocket `ChannelAccount` scopes every catalog list, saved-source
  load, preview, and confirmation request.
- If several active Rocket accounts exist, require an explicit compact account
  choice. Changing the account clears the selected source/preview but must not
  orphan the release control for an already active confirmation.
- Calendar and PO summaries come from `listSavedRocketPos`. Reopen evidence by
  its exact `sourceImportRunId`; never merge rows from separate source runs.
- If a date contains several source runs, the existing PO/list surface must
  require an explicit source choice before loading a saved preview.
- A quantity or shortage-reason edit makes the preview dirty and disables
  confirmation until one whole-preview server revalidation succeeds.
- Workbook generation uses the canonical persisted confirmation result. Local
  file history is operator convenience, not confirmation evidence. A retry
  uses the source rows captured by that confirmation, never a newer preview.
- Keep active confirmation release controls in the decision panel. Do not add
  a second commitment-history workspace.

## Boundary Rules

- Use Supply actions on `POST /api/purchase-orders`: `previewRocket`,
  `confirmRocket`, `releaseRocketConfirmation`, `listSavedRocketPos`, and
  `loadSavedRocketCollection`. Do not add `/api/orders/rocket/*` calls.
- Catalog evidence is `SourceImportRun` + `RocketPoCatalogSnapshot` +
  `RocketPoCatalogLine`. Confirmation is `RocketPurchaseConfirmation`, and
  `InventoryCommitment` is the sole active stock hold ledger.
- Confirmation must not call a marketplace provider or mutate Sellpia physical
  stock. Reopening saved evidence always reruns current Inventory freshness and
  capacity.
- Display `currentStock`, `activeCommitmentQuantity`, and `availableStock`
  separately. Final-order settlement is enabled only after a newer verified
  Sellpia generation.
- Do not replace or rearrange the preserved shell when integrating the shared
  workflow.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(orders\)/rocket-orders
```
