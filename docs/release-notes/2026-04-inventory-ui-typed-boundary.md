# Inventory UI — Typed Boundary Migration (W2)

**Plan:** `docs/superpowers/plans/2026-04-25-plan-w2-inventory-ui.md`
**Branch:** `feat/w2-inventory-ui`
**Owner domain:** `inventory`
**Predecessors:** W1 product-data UI (shipped).
**Successors:** W3 orders-ui, W6 root-boundaries, W5 ad-ops-rewire.

## Summary

- Migrated `/inventory` UI reads from `apiClient.get<T>` shadow casts to `apiClient.getParsed(..., InventoryListResponseSchema)` + Zod parsing at the web boundary.
- Added a typed inventory API wrapper at `apps/web/src/app/inventory/lib/inventory-api.ts` so every inventory list / detail / transactions / mutation response parses through `@kiditem/shared` schemas.
- Replaced the single invalid `/api/inventory?limit=10000` export request with a paged fetcher that honours the server `@Max(200)` DTO guard and assembles pages client-side.
- Hardened the browser barcode-print flow: extracted a pure `buildBarcodePrintHtml` with `escapeHtml`, added a focused Vitest suite for the XSS vectors (`<script>` / `<img onerror=...>`), and surfaced popup-blocked / empty states as toasts.
- Migrated `/inventory` stock-movement views from the deleted `/api/stock-movement` endpoint to the canonical `/api/inventory/transactions` + `/api/inventory/transactions/summary` surface (B2a contract).
- Also migrated the inventory-owned tabs in `inventory-hub` (`StockIo.tsx`, `StockLedger.tsx`) to the canonical transactions endpoints; option-level grouping, not product-level (see "Known limitations").
- Wired stock-operation UI (receive / issue / adjust / metadata) through the existing `InventoryController` endpoints; ADR-0014 single-writer invariant preserved.

## Canonical endpoints used

- `GET /api/inventory`
- `GET /api/inventory/transactions`
- `GET /api/inventory/transactions/summary`
- `GET /api/inventory/:id`
- `PATCH /api/inventory/:id`
- `POST /api/inventory/:id/receive`
- `POST /api/inventory/:id/issue`
- `POST /api/inventory/:id/adjust`

Existing `/api/coupang-dashboard` and `/api/coupang-sync/products` callers in the inventory toolbar were preserved with local response parsing; channels/coupang backend contract was not changed.

## Database impact

None. No Prisma schema change, no migration, no data backfill. The web boundary rewire consumes the already-current Plan B2a inventory contract.

## Export behaviour change

Before: one request with `?limit=10000` (rejected by DTO `@Max(200)`).
After: paged fetches via `fetchAllInventoryForExport` at `apps/web/src/app/inventory/lib/inventory-export.ts`, `EXPORT_PAGE_SIZE = 200`. xlsx generation stays client-side via dynamic `import('xlsx')`.

## Barcode print hardening

- `buildBarcodePrintHtml(items, today?)` is pure and escapes every interpolated `sku` / `masterName` through `escapeHtml`.
- `printBarcodeWindow(items)` now returns `'opened' | 'popup-blocked' | 'empty'`; `page.tsx` surfaces toast warnings for both non-success cases.
- Focused Vitest suite at `apps/web/src/app/inventory/lib/barcode-print.test.ts` covers `< > & " '` escaping plus `<script>` and `<img onerror=alert(1)>` vectors on SKU / masterName.

## Excluded inventory-hub tabs (intentional)

- `apps/web/src/app/inventory-hub/components/StockAssets.tsx` — product-cost asset view backed by `/api/products`. Owned by a product-catalog successor, not W2.
- `apps/web/src/app/inventory-hub/components/StockAudits.tsx` — stock-audits backend. Explicitly out of scope per plan.
- `apps/web/src/app/inventory-hub/page.tsx` dynamic `PurchaseOrdersPage` import — procurement/purchase-orders domain, not W2.

## Known limitations

- `StockLedger.tsx` now groups by `tx.optionId` / `tx.optionName`, not product-level. Canonical `/api/inventory/transactions` does not expose product copy. Product-level ledger grouping stays out of W2; a later product-inventory join plan will own that migration.
- `StockIo.tsx` derives KPI cards (입고/출고 수량·금액) client-side from the period-filtered transaction list rather than calling `/api/inventory/transactions/summary`. The summary endpoint computes `Date.now() - days`, which cannot represent past months when the user picks an earlier period; client-side derivation matches the explicit `from`/`to` window the user selects. To prevent the server `@Max(200)` cap from silently truncating large months, both `StockIo.tsx` and `StockLedger.tsx` now use `fetchAllTransactionsInWindow({ from, to })` from `inventory-api.ts`, which pages through the period at `limit=200` per request and assembles the full transaction set client-side.

## Period filtering (fix from codex critic round 1)

Both `StockIo` and `StockLedger` now compute a closed period window:

```ts
from = `${period}-01T00:00:00.000Z`;
to   = `${period}-${lastDayOfMonth}T23:59:59.999Z`;
```

and pass both to `/api/inventory/transactions`. The server DTO `ListTransactionsQueryDto` accepts `from?: string @IsISO8601` and `to?: string @IsISO8601`, so this only narrows the existing contract — no server change required.

## ADR compliance

- ADR-0014 single-writer invariant (inventory stock mutations flow through `InventoryService`) remains intact — no browser code mutates `currentStock` directly.
- ADR-0019 business-domain session boundary respected — the W2 PR touches `packages/shared` inventory schemas, `apps/server/src/inventory/**` (tests only), and `apps/web/src/app/inventory/**` plus the two inventory-owned `inventory-hub` tabs. No orders, ad-ops, product catalog, procurement, stock-audits, channels/coupang, root, or global API-client edits.

## Verification evidence

All commands run from the W2 worktree at `~/Workspace/omc-worktrees/feat/kiditem-w2-inventory-ui` on branch `feat/w2-inventory-ui` (base `main @ 5dae905`).

```
# Shared
npx vitest run packages/shared/src/schemas/inventory.spec.ts   → PASS (5) FAIL (0)
(cd packages/shared && npm run build)                          → Build success; dist/schemas/index.d.ts 6.43 KB

# Web
(cd apps/web && npx vitest run src/app/inventory/lib/barcode-print.test.ts) → PASS (2) FAIL (0)
(cd apps/web && npx tsc --noEmit --pretty false)               → TypeScript: No errors found
npm run build --workspace=apps/web                             → exit 0

# Server inventory
(cd apps/server && npx vitest run src/inventory)               → PASS (31) FAIL (0)
npm run dev:server                                             → "Nest application successfully started"
                                                                 (followed by EADDRINUSE on :4000 from a parallel
                                                                 main-session server — boot itself succeeded;
                                                                 inventory module imports cleanly)
```

Static scope audits:

```
rg -n 'limit=10000' apps/web/src/app/inventory                 → 0 matches
rg -n '/api/stock-movement' apps/web/src/app/inventory         → 0 matches
rg -n '/api/stock-movement' apps/web/src/app/inventory-hub/components/StockIo.tsx \
  apps/web/src/app/inventory-hub/components/StockLedger.tsx    → 0 matches
```

Satisfies audit on server inventory services produced no `MISSING:` rows; shared types are imported under the `satisfies` discipline.

First non-W2 failing path: none. `npm run build --workspace=apps/web` is green.
