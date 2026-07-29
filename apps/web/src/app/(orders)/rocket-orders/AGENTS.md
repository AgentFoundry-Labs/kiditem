Consult this document first instead of relying on memorized knowledge.

# web/rocket-orders - Preserved Rocket Operations

`app/(orders)/rocket-orders/` owns the independently reachable Rocket
operations UI from `c9e7caf8`. Keep the `RocketOrdersWorkspace` calendar,
list, chart, workbook-panel position, and local file-history composition.
`/rocket-orders` is the only operator-facing Rocket review route.

## State Rules

- The selected Rocket `ChannelAccount` scopes every catalog list, saved-source
  load and preview request.
- If several active Rocket accounts exist, require an explicit compact account
  choice. Changing the account clears the selected source/preview.
- Calendar and PO summaries come from `listSavedRocketPos`. Reopen evidence by
  its exact `sourceImportRunId`; never merge rows from separate source runs.
- Request the saved-PO v2 response profile for export evidence compatibility,
  but treat any legacy repeated snapshots as non-operational history. The
  calendar, list, and preview use the newest complete source run only.
- Load the newest saved source automatically even before a date is selected.
  A date scopes the visible preview and workbook decision to that delivery
  date while the server still validates and allocates against the complete
  newest source snapshot. A newer successful collection immediately replaces
  the selected source; never expose a historical-source picker or merge rows
  from separate runs.
- Channels retains only the newest raw `RocketPoCatalogSnapshot` payload per
  account after a successful publication. Supply-owned workbook decisions and
  artifacts remain immutable evidence even when the raw predecessor is pruned.
- The preview always displays the complete selected snapshot. A prior workbook
  download never filters, hides, or locks preview rows.
- A quantity or shortage-reason edit makes the preview dirty and disables
  workbook export until one whole-preview server revalidation succeeds.
- Opening or recalculating an operator preview uses the latest stored Sellpia
  snapshot immediately and never waits for a background refresh. Official
  workbook export remains server-fenced by a fresh inventory generation.
- Product/option identity and recipe-review blockers link to the existing
  Product Hub matching center. A `configuration_required` row already has a
  confirmed `ProductVariant`, so it creates the empty Sellpia component recipe
  directly in the Rocket table through the Products-owned create-if-empty API.
  A configured row displays each Sellpia component code and name and may replace
  the complete recipe inline through Products' expected-recipe-fenced manual API.
  After any correction, rerun the same saved-source preview; do not collect from
  Coupang again. Quantity and shortage-reason controls stay disabled until the
  blocker clears. Only a recipe-backed insufficient-capacity row may proceed
  with an explicit shortage reason.
- Workbook generation runs in the browser from the freshly revalidated preview
  and downloads immediately. The operator flow ends at download; do not add
  workbook-status, exact re-download, abandonment, or completion controls.

## Boundary Rules

- Use Supply actions on `POST /api/purchase-orders`: `previewRocket`,
  `listSavedRocketPos`, and `loadSavedRocketCollection`. Do not add
  `/api/orders/rocket/*` calls or a post-download workbook API workflow.
- Catalog evidence is `SourceImportRun` + `RocketPoCatalogSnapshot` +
  `RocketPoCatalogLine`. The durable Rocket workflow and exact workbook artifact
  are stored by Supply; Rocket does not create inventory commitments.
- Every downloaded workbook line, including a zero-quantity line, requires
  its current confirmed active `ProductVariantComponent` recipe. Never export
  a draft workbook from an unmapped or stock-only row.
- Workbook download must not call a marketplace provider or mutate Sellpia
  physical stock. Reopening saved evidence reruns current Inventory freshness
  and capacity.
- Inline Rocket recipe repair may select active Sellpia inventory identities and
  positive component quantities only. It may create an empty recipe or replace
  an operator-reviewed complete recipe with optimistic current-recipe evidence;
  it does not infer product identity or mutate stock.
- Display each Sellpia component's product code, product name, and `currentStock`.
  Within one preview/export, shared SKU
  capacity is consumed from one in-memory remaining-stock map in stable
  ETA/PO/line order.
- Do not replace or rearrange the preserved shell when integrating the shared
  workflow.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(orders\)/rocket-orders
```
