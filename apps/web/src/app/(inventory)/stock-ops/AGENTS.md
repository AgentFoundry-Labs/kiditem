Consult this document first instead of relying on memorized knowledge.

# web/stock-ops - Inventory Analysis

`stock-ops/` owns the analysis-only inventory surface: what stock is doing,
not what an operator does to it. Inventory operations live in
`/inventory-hub`.

## State Rules

- This route owns `product-outflow` and `channel-zero`. Anything that is an
  operator action, a record, or an import concern belongs in `/inventory-hub`.
- `MOVED_TABS` in `page.tsx` is the compatibility contract for the tabs that
  moved to `/inventory-hub`. Dashboard cards, `DashboardSidePanel`, and server
  automation seeds still link to `?tab=sellpia-zero` and `?tab=freshness`;
  removing an entry breaks those alerts silently. Add an entry, never delete
  one, and keep the page spec's redirect table in sync.
- `bottlenecks` is retired. Its aliased landing is `channel-zero`, which shows
  the same backend bottleneck flags.
- Keep inactive workspaces from running unnecessary timers, requests, or
  toasts.
- Mapping recipe edits link to
  `/product-hub/matching`; the analysis page does not save recipes itself.
- `product-outflow` reads the Analytics-owned direct Sellpia SKU depletion
  projection. Matched rows show physical current stock, active common
  commitment, and available stock separately; reorder and months-left use
  available stock.
- Every matched destination renders its nullable stored
  `MasterProduct.abcGrade`; shared SKUs may therefore show multiple destination
  grades. Filters and summaries use those same values and keep unclassified
  destinations separate from C.
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
- Do not infer a single operating product for a shared SKU or merge this route
  into `/product-hub`; use links between the two independent screens.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(inventory\)/stock-ops
```
