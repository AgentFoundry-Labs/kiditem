Consult this document first instead of relying on memorized knowledge.

# web/stock-ops - Inventory Analysis

`stock-ops/` owns the analysis-only inventory surface: what stock is doing,
not what an operator does to it. Inventory operations live in
`/inventory-hub`.

## State Rules

- This route owns `product-outflow` and `channel-zero`. Anything that is an
  operator action, a record, or an import concern belongs in `/inventory-hub`.
- `MOVED_TABS` in `page.tsx` is the compatibility contract for the tabs that
  moved to `/inventory-hub`. Live dashboard and automation links use the
  canonical inventory-hub tabs, but saved tasks and bookmarks may still carry
  `?tab=sellpia-zero` or `?tab=freshness`; removing an entry breaks those links
  silently. Add an entry, never delete one, and keep the page spec's redirect
  table in sync.
- `bottlenecks` is retired. Its aliased landing is `channel-zero`, which shows
  the same backend bottleneck flags.
- Keep inactive workspaces from running unnecessary timers, requests, or
  toasts.
- Mapping recipe edits link to
  `/product-hub/matching`; the analysis page does not save recipes itself.
- `product-outflow` reads the Analytics-owned direct Sellpia SKU depletion
  projection. Matched rows expose physical current stock without separate
  commitment or available-stock columns. Reorder and months-left remain
  backend-owned signals.
- Its refresh action explicitly requests the shared Sellpia `inventory` scope.
  It only collects physical current stock; Product Management's separate
  `full` scope owns product-profit collection and automatic ABC recalculation.
- Every matched Sellpia row renders the one stored grade and current automatic
  ABC calculation status of its canonical inventory MasterProduct. Shared
  channel destinations never create additional grades. A/B/C, observation,
  calibration, source-stale, and unpublished filters use that canonical
  snapshot without treating any of them as C.
  This is display/filter context only: never alter depletion, stock, or reorder
  formulas and keep policy/profit explanation in Product Management.
- Destination images are read-only active Coupang catalog media selected for
  the matched option/product. Do not copy the URL into Inventory or use AI
  thumbnail quality grades as product ABC.
- `mapping_required` (`SKU 없음`, `비활성 SKU`, `바코드 중복`) and
  `not_collected` are not zero stock and must not enter reorder counts.
  Preserve all linked operating-product destinations and label duplicated
  sales rows as aggregated demand.

## Boundary Rules

- Do not turn the whole route into a redirect to `/inventory-hub`. Per-tab
  redirects for moved views are the supported mechanism.
- Do not write Sellpia stock or duplicate backend capacity calculations.
- Do not infer grades from channel destinations. Use the source SKU's canonical
  MasterProduct and keep this analysis route separate from `/product-hub`.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(inventory\)/stock-ops
```
