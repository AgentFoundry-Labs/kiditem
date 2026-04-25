# Plan W2 — Inventory UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:writing-plans` for edits to this plan, then `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the inventory-facing UI to typed runtime boundaries and the current Plan B2a inventory API contract, including list/export, barcode print, stock movement views, and stock operation mutations.

**Architecture:** `inventory` is the owner business domain. Same-domain cross-layer edits are allowed under ADR-0019: `apps/web/src/app/inventory/**`, inventory-owned pieces of `apps/web/src/app/inventory-hub/**`, `packages/shared` inventory schemas/tests if contract gaps are found, and `apps/server/src/inventory/**` only if the current inventory contract needs a narrow alias or response-schema fix. Do not touch orders, ad-ops, root page consumers, product catalog implementation, procurement purchase-order implementation, stock-audits backend, or any global infrastructure beyond direct inventory query-key entries.

**Tech Stack:** Next.js 16, React Query, `apiClient` + Zod `.parse()` at the web boundary, shared inventory schemas in `@kiditem/shared`, NestJS inventory module, xlsx dynamic import, browser `window.open` print flow.

**Predecessors:** Plan R0 (`docs/superpowers/plans/2026-04-23-plan-r0-post-f1-successor-roadmap.md`) and W1 product-data UI stabilization (`docs/superpowers/plans/2026-04-23-plan-w1-product-data-ui.md`). W2 should run after W1 has either shipped or left only documented non-inventory blockers.

**Successors:** `W3 orders-ui`, then `W6 root-boundaries`, then `W5 ad-ops-rewire` per R0 ordering.

---

## Why W2 Exists

R0 defines W2 as the frontend `inventory` slice: "Convert inventory pages/components to typed boundaries and current schema." The backend inventory domain already has a current Plan B2a contract, but the web inventory UI still has several stale or weak boundaries:

- `apps/web/src/app/inventory/page.tsx` calls `apiClient.get<T>` for inventory list/export/stock check, so TypeScript trusts the caller instead of parsing `InventoryListResponseSchema`.
- `apps/web/src/app/inventory/page.tsx` exports with `limit=10000`, while the server DTO caps `limit` at 200. This can fail at runtime under the global `ValidationPipe`.
- `apps/web/src/app/inventory/components/StockMovementTab.tsx` calls `/api/stock-movement`, but Plan B2a deleted `stock-movement.controller.ts`; the canonical endpoints are `/api/inventory/transactions` and `/api/inventory/transactions/summary`.
- `apps/web/src/app/inventory/lib/barcode-print.ts` writes unescaped SKU/name values into a print-window HTML string. It also has no test seam for the browser-print edge case.
- The toolbar's receive-stock action is a toast stub despite existing inventory `receive` / `issue` / `adjust` endpoints.
- Several inventory components still use hard-coded light-mode colors. When touching those files, convert edited blocks to the semantic tokens required by `apps/web/AGENTS.md`.

W2 should close these inventory-owned issues without reopening product, orders, ad-ops, or root typed-boundary work.

## Source-of-truth Evidence

### Roadmap and instructions

- R0 roadmap: `docs/superpowers/plans/2026-04-23-plan-r0-post-f1-successor-roadmap.md` names `W2` as owner domain `inventory`, replacing the historical `F3` inventory slice.
- Web frontend rules: `apps/web/AGENTS.md` requires `apiClient`, React Query, shared response types from `@kiditem/shared`, semantic color tokens, `cn()` for conditional classes, and notes `app/inventory/` as the barcode-print + xlsx import/export special case.
- Server inventory guide: `apps/server/src/inventory/CLAUDE.md` locks the current endpoints and ADR-0014 single-writer invariant.
- Shared schema rules: `packages/shared/AGENTS.md` requires Zod-first shared schemas, `z.infer` types, and backend `satisfies` returns for shared response types.

### Current frontend inventory evidence

- `apps/web/src/app/inventory/page.tsx:25-31` fetches `/api/inventory` with `apiClient.get<{ items; total; summary? }>` instead of `InventoryListResponseSchema` parsing.
- `apps/web/src/app/inventory/page.tsx:50-53` exports by calling `/api/inventory?limit=10000`; `apps/server/src/inventory/dto/list-inventory-query.dto.ts:12-17` caps `limit` at `@Max(200)`.
- `apps/web/src/app/inventory/page.tsx:76-79` stock-checks `/api/inventory?status=low&limit=1` and trusts a hand-written `{ total: number }` type.
- `apps/web/src/app/inventory/page.tsx:101-105` invalidates `queryKeys.inventory.all` after `/api/coupang-sync/products`; W2 may preserve this existing button but must not alter channels/coupang backend code.
- `apps/web/src/app/inventory/lib/barcode-print.ts:4-40` uses `window.open`, inline `<style>`, and template-string HTML built from inventory item fields.
- `apps/web/src/app/inventory/components/StockMovementTab.tsx:38-47` calls `/api/stock-movement?from=...&groupBy=...&limit=200`, a stale route not present in `apps/server/src/inventory/controllers/inventory.controller.ts`.
- `apps/web/src/app/inventory-hub/page.tsx:7-12` dynamically mounts inventory status plus purchase-orders, stock IO, ledger, stock audits, and stock assets tabs. W2 may only touch the inventory-owned transaction tabs (`StockIo`, `StockLedger`) if needed; purchase-orders, stock-audits, and product-backed stock assets stay out of scope.
- `apps/web/src/app/inventory-hub/components/StockIo.tsx:53-58` and `StockLedger.tsx:55-60` also call stale `/api/stock-movement`.

### Current shared/server contract evidence

- `packages/shared/src/schemas/inventory.ts:27-62` defines `InventoryListItemSchema`, `InventorySummarySchema`, and `InventoryListResponseSchema`.
- `packages/shared/src/schemas/inventory.ts:64-119` defines `StockTransactionSchema`, `StockOperationResultSchema`, `TransactionListItemSchema`, `TransactionListResponseSchema`, and `TransactionSummarySchema`.
- `packages/shared/src/schemas/inventory.ts:121-152` defines `ReceiveStockInputSchema`, `IssueStockInputSchema`, `AdjustStockInputSchema`, and `UpdateInventoryMetadataInputSchema`.
- `packages/shared/src/index.ts:53-87` and `packages/shared/src/schemas/index.ts:53-87` already export the inventory schemas and types.
- `apps/server/src/inventory/controllers/inventory.controller.ts:20-91` exposes current canonical endpoints:
  - `GET /api/inventory`
  - `GET /api/inventory/transactions`
  - `GET /api/inventory/transactions/summary`
  - `GET /api/inventory/option/:optionId`
  - `GET /api/inventory/:id`
  - `PATCH /api/inventory/:id`
  - `POST /api/inventory/:id/receive`
  - `POST /api/inventory/:id/issue`
  - `POST /api/inventory/:id/adjust`
- `apps/server/src/inventory/services/inventory.service.ts:42-102` maps list rows with `satisfies InventoryListItem` and returns `satisfies InventoryListResponse`.
- `apps/server/src/inventory/services/inventory.service.ts:187-261` owns current-stock mutations with row lock, bounds check, ledger append, and bundle fan-out.

## Locked Decisions

1. **Owner domain is inventory.** W2 may edit inventory web files, shared inventory schemas/tests, and `apps/server/src/inventory/**` only. It must not implement orders, ad-ops, product catalog, root `/api/action-tasks`, root `/api/agent-registry/org`, procurement purchase orders, or stock-audits backend behavior.
2. **No `/api/stock-movement` compatibility alias.** The stale frontend callers must migrate to `/api/inventory/transactions` and `/api/inventory/transactions/summary`. Adding a legacy `stock-movement` controller would preserve a deleted API surface and conflict with Plan B2a.
3. **No direct stock writes from the browser except through `InventoryController`.** Receive, issue, adjust, and metadata updates must call existing inventory endpoints and parse `StockOperationResultSchema` or `InventorySchema` after the response.
4. **Excel export uses paged reads, not `limit=10000`.** The server's `@Max(200)` limit remains unchanged. Export fetches all pages with `limit=200`, then writes xlsx client-side.
5. **Barcode print remains a browser print-window flow.** Keep `window.open` + inline print CSS because `apps/web/AGENTS.md` calls this out as the inventory-specific browser API case, but extract a pure HTML builder and escape untrusted text before `document.write`.
6. **Inventory-hub is not wholesale W2 scope.** `inventory-hub` hosts procurement/product/stock-audit views. W2 can migrate inventory transaction tabs that call `/api/stock-movement`; it must not rewrite `PurchaseOrdersPage`, `StockAudits`, or product-backed `StockAssets` beyond compile-required import fallout from inventory shared types.
7. **Coupang sync buttons are preserved, not expanded.** Existing `/api/coupang-dashboard` and `/api/coupang-sync/products` calls may remain in the inventory toolbar with parsed local/common schemas, but W2 does not alter channels/coupang backend contracts.
8. **Use current `apiClient.getParsed(path, schema)` signature.** For POST/PATCH parsed responses, call `apiClient.post<unknown>` / `apiClient.patch<unknown>` and parse locally in `app/inventory/lib/inventory-api.ts`; do not modify global `api-client.ts` in W2.
9. **No Prisma schema change.** W2 consumes the existing option-level Inventory schema and does not introduce warehouse-level balances or per-warehouse stock.
10. **Dark-mode cleanup is opportunistic but required in touched blocks.** Any inventory file edited for functional work must replace touched hard-coded `bg-white`, `text-slate-*`, and conditional template strings with semantic tokens and `cn()` patterns.

## File Map

### Web inventory primary scope

- Modify: `apps/web/src/app/inventory/page.tsx` — thin composition layer; use inventory hooks, typed filter state, paged export, stock-operation dialog state, and inventory/transactions tab selection.
- Create: `apps/web/src/app/inventory/hooks/useInventory.ts` — `useInventoryList`, `useInventoryDetail`, `useInventoryMetadataMutation`, `useReceiveStock`, `useIssueStock`, `useAdjustStock` using shared schemas.
- Create: `apps/web/src/app/inventory/hooks/useInventoryTransactions.ts` — transaction list + summary queries against canonical `/api/inventory/transactions*` endpoints.
- Create: `apps/web/src/app/inventory/lib/inventory-api.ts` — small typed API wrapper that parses every inventory response with `@kiditem/shared` schemas.
- Create: `apps/web/src/app/inventory/lib/inventory-export.ts` — paged export fetcher and xlsx row mapper; enforces `limit=200`.
- Modify: `apps/web/src/app/inventory/lib/barcode-print.ts` — extract `buildBarcodePrintHtml`, `escapeHtml`, and return a status from `printBarcodeWindow`.
- Create: `apps/web/src/app/inventory/lib/barcode-print.test.ts` — pure tests for HTML escaping and item rendering.
- Modify: `apps/web/src/app/inventory/components/InventoryToolbar.tsx` — typed handlers, disabled state, semantic tokens.
- Modify: `apps/web/src/app/inventory/components/InventoryFilterTabs.tsx` — typed filter keys, semantic tokens.
- Modify: `apps/web/src/app/inventory/components/InventorySummaryCards.tsx` — semantic tokens in touched card blocks.
- Modify: `apps/web/src/app/inventory/components/InventoryTable.tsx` — typed status badge, row actions for receive/issue/adjust/metadata edit, semantic tokens in touched blocks.
- Create: `apps/web/src/app/inventory/components/StockOperationDialog.tsx` — minimal receive/issue/adjust/metadata form using shared input schemas before API calls.
- Modify: `apps/web/src/app/inventory/components/StockMovementTab.tsx` — migrate from stale grouped endpoint to canonical transactions + summary queries.
- Modify: `apps/web/src/app/inventory/components/StockMovementTable.tsx` — render grouped rows derived client-side from `TransactionListItem[]`.
- Modify: `apps/web/src/app/inventory/components/StockMovementSummaryCard.tsx` — semantic tokens in touched blocks.

### Web inventory-hub narrow scope

- Modify: `apps/web/src/app/inventory-hub/components/StockIo.tsx` — migrate stale `/api/stock-movement` call to `inventory-api` transaction list helper.
- Modify: `apps/web/src/app/inventory-hub/components/StockLedger.tsx` — migrate stale `/api/stock-movement` call to canonical inventory transactions.
- Read-only / out of scope: `apps/web/src/app/inventory-hub/page.tsx`, `StockAudits.tsx`, `StockAssets.tsx`, and the dynamic `PurchaseOrdersPage` import.

### Shared inventory scope

- Modify if schema gap is confirmed by T0/T1: `packages/shared/src/schemas/inventory.ts` — add only missing inventory-specific schemas such as `InventoryFilterKeySchema` or transaction grouping view schemas. Do not duplicate existing schemas.
- Modify if schema gap is confirmed: `packages/shared/src/schemas/index.ts` and `packages/shared/src/index.ts` — re-export new inventory schemas/types.
- Create: `packages/shared/src/schemas/inventory.spec.ts` — lock existing and newly added inventory schema behavior.

### Server inventory scope

- Prefer no changes. Current controller and service already expose the canonical Plan B2a contract.
- Modify only if T0 finds a real contract mismatch: `apps/server/src/inventory/controllers/inventory.controller.ts`, `apps/server/src/inventory/services/inventory.service.ts`, and matching `apps/server/src/inventory/**/__tests__/*`.
- Do not create `stock-movement.controller.ts`.

### Shared frontend infra direct consumer

- Modify: `apps/web/src/lib/query-keys.ts` — add inventory detail / transactions / operation keys under the existing `queryKeys.inventory` namespace. Do not change unrelated namespaces.

## Out of Scope

- `W3` orders page typed-boundary work.
- `W6` root `/api/action-tasks` and `/api/agent-registry/org` typed-boundary work.
- `W5` ad-ops quarantine removal or ad-ops rewire.
- Product catalog contract changes, including `/api/products` alias behavior and `StockAssets` product-cost resolution.
- Procurement purchase-order implementation under `apps/web/src/app/purchase-orders` or server procurement modules.
- Stock audits backend and audit workflow redesign.
- Warehouse-level stock accounting or schema migrations.
- Channels/coupang backend sync contract changes.
- Replacing xlsx, introducing a barcode library, or adding a print-service dependency.

## Tasks

### T0: Baseline W2 inventory surface

**Files:**
- Read: `apps/web/src/app/inventory/**`
- Read: `apps/web/src/app/inventory-hub/components/{StockIo,StockLedger,StockAssets,StockAudits}.tsx`
- Read: `packages/shared/src/schemas/inventory.ts`
- Read: `apps/server/src/inventory/**`

- [ ] **Step 0.1: Capture current web build state**

Run:

```bash
npm run build --workspace=apps/web
```

Expected:
- Build either passes or fails on known non-W2 blockers from W1/W3/W6/W5.
- If it fails, record the first failing file and whether any failing file path starts with `apps/web/src/app/inventory` or `apps/web/src/app/inventory-hub`.

- [ ] **Step 0.2: Inventory stale endpoint callers**

Run:

```bash
rg -n "api/(inventory|stock-movement|coupang-dashboard|coupang-sync/products)" \
  apps/web/src/app/inventory apps/web/src/app/inventory-hub \
  --glob '*.{ts,tsx}'
```

Expected current W2-owned stale callers:
- `apps/web/src/app/inventory/components/StockMovementTab.tsx` → `/api/stock-movement`
- `apps/web/src/app/inventory-hub/components/StockIo.tsx` → `/api/stock-movement`
- `apps/web/src/app/inventory-hub/components/StockLedger.tsx` → `/api/stock-movement`

Expected current valid inventory callers:
- `apps/web/src/app/inventory/page.tsx` → `/api/inventory`

- [ ] **Step 0.3: Confirm canonical server endpoints**

Run:

```bash
rg -n "@Get\(|@Post\(|@Patch\(|@Controller\('inventory'" apps/server/src/inventory/controllers/inventory.controller.ts
```

Expected:
- `@Get()` list
- `@Get('transactions')`
- `@Get('transactions/summary')`
- `@Get('option/:optionId')`
- `@Get(':id')`
- `@Patch(':id')`
- `@Post(':id/receive')`
- `@Post(':id/issue')`
- `@Post(':id/adjust')`

- [ ] **Step 0.4: Confirm export limit constraint**

Run:

```bash
nl -ba apps/server/src/inventory/dto/list-inventory-query.dto.ts | sed -n '12,18p'
```

Expected: `limit` has `@Max(200)`. W2 export must page through `limit=200`; do not increase the server limit.

### T1: Lock shared inventory schema behavior

**Files:**
- Create: `packages/shared/src/schemas/inventory.spec.ts`
- Modify only if needed: `packages/shared/src/schemas/inventory.ts`
- Modify only if needed: `packages/shared/src/schemas/index.ts`
- Modify only if needed: `packages/shared/src/index.ts`

- [ ] **Step 1.1: Add schema coverage for existing inventory responses**

Create `packages/shared/src/schemas/inventory.spec.ts` with cases for these existing schemas:

```typescript
import { describe, expect, it } from 'vitest';
import {
  InventoryListResponseSchema,
  StockOperationResultSchema,
  TransactionListResponseSchema,
  TransactionSummarySchema,
  ReceiveStockInputSchema,
  IssueStockInputSchema,
  AdjustStockInputSchema,
  UpdateInventoryMetadataInputSchema,
} from './inventory';

const inventoryRow = {
  id: '00000000-0000-4000-8000-000000000001',
  optionId: '00000000-0000-4000-8000-000000000002',
  masterId: '00000000-0000-4000-8000-000000000003',
  sku: 'SKU-1',
  masterName: '테스트 상품',
  optionName: '블루',
  kind: 'SIMPLE',
  currentStock: 10,
  availableStock: 10,
  safetyStock: 3,
  reorderPoint: 5,
  leadTimeDays: null,
  warehouseLocation: null,
  status: 'healthy',
};

describe('inventory shared schemas', () => {
  it('parses inventory list response', () => {
    expect(() => InventoryListResponseSchema.parse({
      items: [inventoryRow],
      total: 1,
      page: 1,
      limit: 50,
      summary: { total: 1, healthy: 1, low: 0, out: 0 },
    })).not.toThrow();
  });

  it('rejects invalid inventory status', () => {
    expect(() => InventoryListResponseSchema.parse({
      items: [{ ...inventoryRow, status: 'warning' }],
      total: 1,
      page: 1,
      limit: 50,
      summary: { total: 1, healthy: 0, low: 1, out: 0 },
    })).toThrow();
  });

  it('parses stock operation result', () => {
    expect(() => StockOperationResultSchema.parse({
      inventory: {
        id: inventoryRow.id,
        optionId: inventoryRow.optionId,
        companyId: '00000000-0000-4000-8000-000000000004',
        currentStock: 15,
        reservedStock: 0,
        safetyStock: 3,
        reorderPoint: 5,
        reorderQuantity: 20,
        leadTimeDays: null,
        dailySalesAvg: 0,
        warehouseLocation: null,
        lastRestockedAt: '2026-04-25T00:00:00.000Z',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      transaction: {
        id: '00000000-0000-4000-8000-000000000005',
        optionId: inventoryRow.optionId,
        type: 'RECEIVE',
        quantity: 5,
        unitCost: 1000,
        createdAt: '2026-04-25T00:00:00.000Z',
      },
      recomputedBundleOptionIds: [],
    })).not.toThrow();
  });

  it('parses transaction list and summary', () => {
    expect(() => TransactionListResponseSchema.parse({
      items: [{
        id: '00000000-0000-4000-8000-000000000006',
        optionId: inventoryRow.optionId,
        optionName: '블루',
        type: 'ISSUE',
        quantity: 2,
        unitCost: 0,
        totalCost: 0,
        warehouseId: null,
        relatedId: null,
        relatedType: null,
        note: null,
        createdBy: 'user-1',
        createdAt: '2026-04-25T00:00:00.000Z',
      }],
      total: 1,
      page: 1,
      limit: 50,
    })).not.toThrow();

    expect(() => TransactionSummarySchema.parse({
      inQty: 5,
      outQty: 2,
      adjustQty: 1,
      inAmount: 5000,
      outAmount: 0,
    })).not.toThrow();
  });

  it('validates mutation inputs', () => {
    expect(ReceiveStockInputSchema.parse({ quantity: 1, unitCost: 0 })).toEqual({ quantity: 1, unitCost: 0 });
    expect(IssueStockInputSchema.parse({ quantity: 1, relatedType: 'manual' })).toEqual({ quantity: 1, relatedType: 'manual' });
    expect(AdjustStockInputSchema.safeParse({ delta: 0, reason: 'bad' }).success).toBe(false);
    expect(UpdateInventoryMetadataInputSchema.parse({ safetyStock: 3, warehouseLocation: null })).toEqual({ safetyStock: 3, warehouseLocation: null });
  });
});
```

- [ ] **Step 1.2: Run shared schema test**

Run:

```bash
npx vitest run packages/shared/src/schemas/inventory.spec.ts
```

Expected: PASS. If it fails because the schema itself is stale against the current server return, fix `packages/shared/src/schemas/inventory.ts` and export files in the same task.

- [ ] **Step 1.3: Build shared package if any shared file changed**

Run:

```bash
(cd packages/shared && npm run build)
```

Expected: `tsup` completes and `dist/` reflects the inventory schema exports.

### T2: Add typed inventory API wrappers and query keys

**Files:**
- Create: `apps/web/src/app/inventory/lib/inventory-api.ts`
- Modify: `apps/web/src/lib/query-keys.ts`

- [ ] **Step 2.1: Extend inventory query keys only**

Modify the existing `queryKeys.inventory` block in `apps/web/src/lib/query-keys.ts` to include these direct inventory keys:

```typescript
inventory: {
  all: ['inventory'] as const,
  list: (params: Record<string, string>) => [...queryKeys.inventory.all, 'list', params] as const,
  detail: (id: string) => [...queryKeys.inventory.all, 'detail', id] as const,
  byMaster: (masterId: string) => [...queryKeys.inventory.all, 'byMaster', masterId] as const,
  transactions: (params: Record<string, string>) => [...queryKeys.inventory.all, 'transactions', params] as const,
  transactionSummary: (params: Record<string, string>) => [...queryKeys.inventory.all, 'transactionSummary', params] as const,
},
```

Expected: no unrelated query-key namespace changes.

- [ ] **Step 2.2: Create parsed inventory API wrapper**

Create `apps/web/src/app/inventory/lib/inventory-api.ts`:

```typescript
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import {
  AdjustStockInputSchema,
  InventoryListResponseSchema,
  InventorySchema,
  ReceiveStockInputSchema,
  IssueStockInputSchema,
  StockOperationResultSchema,
  TransactionListResponseSchema,
  TransactionSummarySchema,
  UpdateInventoryMetadataInputSchema,
} from '@kiditem/shared';
import type {
  AdjustStockInput,
  Inventory,
  InventoryListResponse,
  InventoryStatus,
  IssueStockInput,
  ReceiveStockInput,
  StockOperationResult,
  TransactionListResponse,
  TransactionSummary,
  UpdateInventoryMetadataInput,
} from '@kiditem/shared';

export type InventoryFilterKey = 'all' | InventoryStatus;

export interface InventoryListParams {
  page?: number;
  limit?: number;
  status?: InventoryStatus;
  optionId?: string;
  masterId?: string;
}

export interface TransactionListParams {
  page?: number;
  limit?: number;
  optionId?: string;
  type?: 'RECEIVE' | 'ISSUE' | 'ADJUST';
  from?: string;
  to?: string;
}

function searchParams(params: InventoryListParams | TransactionListParams): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function inventoryListKeyParams(params: InventoryListParams): Record<string, string> {
  const result: Record<string, string> = {};
  if (params.page !== undefined) result.page = String(params.page);
  if (params.limit !== undefined) result.limit = String(params.limit);
  if (params.status !== undefined) result.status = params.status;
  if (params.optionId) result.optionId = params.optionId;
  if (params.masterId) result.masterId = params.masterId;
  return result;
}

export function transactionKeyParams(params: TransactionListParams): Record<string, string> {
  const result: Record<string, string> = {};
  if (params.page !== undefined) result.page = String(params.page);
  if (params.limit !== undefined) result.limit = String(params.limit);
  if (params.optionId) result.optionId = params.optionId;
  if (params.type) result.type = params.type;
  if (params.from) result.from = params.from;
  if (params.to) result.to = params.to;
  return result;
}

export async function fetchInventoryList(params: InventoryListParams): Promise<InventoryListResponse> {
  return apiClient.getParsed(`/api/inventory${searchParams(params)}`, InventoryListResponseSchema);
}

export async function fetchInventoryDetail(id: string): Promise<Inventory> {
  return apiClient.getParsed(`/api/inventory/${id}`, InventorySchema);
}

export async function updateInventoryMetadata(id: string, input: UpdateInventoryMetadataInput): Promise<Inventory> {
  const body = UpdateInventoryMetadataInputSchema.parse(input);
  const raw = await apiClient.patch<unknown>(`/api/inventory/${id}`, body);
  return InventorySchema.parse(raw);
}

export async function receiveStock(id: string, input: ReceiveStockInput): Promise<StockOperationResult> {
  const body = ReceiveStockInputSchema.parse(input);
  const raw = await apiClient.post<unknown>(`/api/inventory/${id}/receive`, body);
  return StockOperationResultSchema.parse(raw);
}

export async function issueStock(id: string, input: IssueStockInput): Promise<StockOperationResult> {
  const body = IssueStockInputSchema.parse(input);
  const raw = await apiClient.post<unknown>(`/api/inventory/${id}/issue`, body);
  return StockOperationResultSchema.parse(raw);
}

export async function adjustStock(id: string, input: AdjustStockInput): Promise<StockOperationResult> {
  const body = AdjustStockInputSchema.parse(input);
  const raw = await apiClient.post<unknown>(`/api/inventory/${id}/adjust`, body);
  return StockOperationResultSchema.parse(raw);
}

export async function fetchTransactions(params: TransactionListParams): Promise<TransactionListResponse> {
  return apiClient.getParsed(`/api/inventory/transactions${searchParams(params)}`, TransactionListResponseSchema);
}

export async function fetchTransactionSummary(days: number): Promise<TransactionSummary> {
  const safeDays = z.number().int().min(1).max(365).parse(days);
  return apiClient.getParsed(`/api/inventory/transactions/summary?days=${safeDays}`, TransactionSummarySchema);
}
```

- [ ] **Step 2.3: Type-check the new wrapper**

Run:

```bash
(cd apps/web && npx tsc --noEmit --pretty false)
```

Expected: no inventory-api type errors. If the command reports unrelated repo errors, record the first non-inventory path and continue with focused inventory tests in later tasks.

Reviewer blocker note: keep the helper typed as the concrete inventory param union above. Do not narrow it to `Record<string, ...>`; TypeScript rejects interface arguments without an index signature.

### T3: Move inventory page data flow to hooks and parsed boundaries

**Files:**
- Create: `apps/web/src/app/inventory/hooks/useInventory.ts`
- Modify: `apps/web/src/app/inventory/page.tsx`
- Modify: `apps/web/src/app/inventory/components/InventoryFilterTabs.tsx`
- Modify: `apps/web/src/app/inventory/components/InventorySummaryCards.tsx`
- Modify: `apps/web/src/app/inventory/components/InventoryToolbar.tsx`

- [ ] **Step 3.1: Create inventory React Query hooks**

Create `apps/web/src/app/inventory/hooks/useInventory.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import {
  adjustStock,
  fetchInventoryDetail,
  fetchInventoryList,
  inventoryListKeyParams,
  issueStock,
  receiveStock,
  updateInventoryMetadata,
} from '../lib/inventory-api';
import type {
  AdjustStockInput,
  IssueStockInput,
  ReceiveStockInput,
  UpdateInventoryMetadataInput,
} from '@kiditem/shared';
import type { InventoryListParams } from '../lib/inventory-api';

export function useInventoryList(params: InventoryListParams) {
  return useQuery({
    queryKey: queryKeys.inventory.list(inventoryListKeyParams(params)),
    queryFn: () => fetchInventoryList(params),
  });
}

export function useInventoryDetail(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.inventory.detail(id) : [...queryKeys.inventory.all, 'detail', 'none'],
    queryFn: () => fetchInventoryDetail(id as string),
    enabled: Boolean(id),
  });
}

function useInventoryMutation<TInput>(mutationFn: (id: string, input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TInput }) => mutationFn(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    },
  });
}

export function useInventoryMetadataMutation() {
  return useInventoryMutation<UpdateInventoryMetadataInput>(updateInventoryMetadata);
}

export function useReceiveStock() {
  return useInventoryMutation<ReceiveStockInput>(receiveStock);
}

export function useIssueStock() {
  return useInventoryMutation<IssueStockInput>(issueStock);
}

export function useAdjustStock() {
  return useInventoryMutation<AdjustStockInput>(adjustStock);
}
```

- [ ] **Step 3.2: Rewrite `page.tsx` to use typed filter state and parsed list hook**

In `apps/web/src/app/inventory/page.tsx`:
- Replace `const [filter, setFilter] = useState("all")` with `useState<InventoryFilterKey>('all')`.
- Replace inline inventory `useQuery` with `useInventoryList({ page, limit: PAGE_SIZE, status: filter === 'all' ? undefined : filter })`.
- Keep `DEFAULT_SUMMARY` as the zero state.
- Parse sync info with `SyncInfoSchema` if keeping the existing toolbar sync display:

```typescript
const { data: syncInfo } = useQuery({
  queryKey: queryKeys.syncInfo(),
  queryFn: async () => {
    try {
      return await apiClient.getParsed('/api/coupang-dashboard', SyncInfoSchema);
    } catch {
      return { lastSyncedAt: null } satisfies SyncInfo;
    }
  },
});
```

- Keep `/api/coupang-sync/products` mutation as-is except for response parsing with a local `z.object({ synced: z.number().int().optional() })` schema.
- Do not add channels/coupang backend changes.

- [ ] **Step 3.3: Type filter tabs**

Update `InventoryFilterTabs.tsx` props:

```typescript
import type { InventorySummary } from '@kiditem/shared';
import type { InventoryFilterKey } from '../lib/inventory-api';

interface InventoryFilterTabsProps {
  filter: InventoryFilterKey;
  summary: InventorySummary;
  onFilterChange: (key: InventoryFilterKey) => void;
}
```

Use `cn()` with semantic tokens in the touched button classes.

- [ ] **Step 3.4: Run focused type check**

Run:

```bash
(cd apps/web && npx tsc --noEmit --pretty false)
```

Expected: no errors in `apps/web/src/app/inventory/page.tsx`, inventory hooks, or inventory components.

### T4: Replace unsafe xlsx export with paged typed export

**Files:**
- Create: `apps/web/src/app/inventory/lib/inventory-export.ts`
- Modify: `apps/web/src/app/inventory/page.tsx`

- [ ] **Step 4.1: Create paged export helper**

Create `apps/web/src/app/inventory/lib/inventory-export.ts`:

```typescript
import { fetchInventoryList } from './inventory-api';
import type { InventoryListItem, InventoryStatus } from '@kiditem/shared';

const EXPORT_PAGE_SIZE = 200;

export async function fetchAllInventoryForExport(status?: InventoryStatus): Promise<InventoryListItem[]> {
  const first = await fetchInventoryList({ page: 1, limit: EXPORT_PAGE_SIZE, status });
  const pages = Math.ceil(first.total / EXPORT_PAGE_SIZE);
  const rest: InventoryListItem[] = [];

  for (let page = 2; page <= pages; page += 1) {
    const data = await fetchInventoryList({ page, limit: EXPORT_PAGE_SIZE, status });
    rest.push(...data.items);
  }

  return [...first.items, ...rest];
}

export function toInventoryExportRows(items: InventoryListItem[]) {
  return items.map((d) => ({
    상품명: d.masterName,
    옵션: d.optionName ?? '',
    SKU: d.sku,
    종류: d.kind,
    현재고: d.currentStock,
    가용재고: d.availableStock,
    안전재고: d.safetyStock,
    발주시점: d.reorderPoint,
    리드타임_일: d.leadTimeDays ?? '',
    창고: d.warehouseLocation ?? '',
    상태: d.status,
  }));
}
```

- [ ] **Step 4.2: Replace `limit=10000` export call**

In `page.tsx`, replace the export handler with:

```typescript
const handleExcel = async () => {
  try {
    const status = filter === 'all' ? undefined : filter;
    const data = await fetchAllInventoryForExport(status);
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(toInventoryExportRows(data));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '재고현황');
    XLSX.writeFile(wb, `재고현황_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    toast.error(isApiError(err) ? err.detail : '재고 엑셀 내보내기에 실패했습니다.');
  }
};
```

Expected: no `/api/inventory?limit=10000` remains.

- [ ] **Step 4.3: Verify export endpoint usage**

Run:

```bash
rg -n "limit=10000|/api/inventory\?\$\{params\}" apps/web/src/app/inventory
```

Expected: no matches.

### T5: Harden barcode print HTML and browser edge behavior

**Files:**
- Modify: `apps/web/src/app/inventory/lib/barcode-print.ts`
- Create: `apps/web/src/app/inventory/lib/barcode-print.test.ts`
- Modify: `apps/web/src/app/inventory/page.tsx`

- [ ] **Step 5.1: Extract pure HTML builder with escaping**

Update `barcode-print.ts` to export a pure builder:

```typescript
import { formatNumber } from '@/lib/utils';
import type { InventoryListItem } from '@kiditem/shared';

export type BarcodePrintResult = 'opened' | 'popup-blocked' | 'empty';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function pseudoBars(code: string): string {
  return code
    .split('')
    .map((ch) => {
      const v = ch.charCodeAt(0);
      return (v % 2 === 0 ? '█' : '▌') + (v % 3 === 0 ? '█' : '▐');
    })
    .join('');
}

export function buildBarcodePrintHtml(items: InventoryListItem[], today = new Date()): string {
  const barcodeItems = items.map((item) => {
    const code = item.sku || item.optionId;
    const safeCode = escapeHtml(code);
    const safeName = escapeHtml(item.masterName);
    const bars = pseudoBars(code);

    return `
      <div style="display:inline-block; width:280px; padding:20px; margin:10px; border:1px solid #ddd; text-align:center; page-break-inside:avoid; vertical-align:top;">
        <div style="font-family:'Courier New',monospace; font-size:28px; letter-spacing:1px; line-height:1; margin-bottom:6px; overflow:hidden; white-space:nowrap;">${bars}</div>
        <div style="font-family:'Courier New',monospace; font-size:13px; letter-spacing:2px; margin-bottom:4px;">${safeCode}</div>
        <div style="font-size:12px; color:#333; margin-bottom:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:260px;">${safeName}</div>
        <div style="font-size:11px; color:#666;">재고: ${formatNumber(item.currentStock)}개</div>
      </div>`;
  });

  const date = today.toISOString().slice(0, 10);
  return `<!DOCTYPE html>
<html><head><title>바코드 출력 - ${date}</title>
<style>
  @media print { body { margin: 0; } @page { margin: 10mm; } }
  body { font-family: -apple-system, sans-serif; padding: 20px; }
</style>
</head><body>
<h2 style="margin-bottom:20px;">바코드 출력 (${items.length}건)</h2>
${barcodeItems.join('')}
<script>window.onload = function() { window.print(); }</script>
</body></html>`;
}

export function printBarcodeWindow(items: InventoryListItem[]): BarcodePrintResult {
  if (items.length === 0) return 'empty';
  const win = window.open('', '_blank');
  if (!win) return 'popup-blocked';
  win.document.write(buildBarcodePrintHtml(items));
  win.document.close();
  return 'opened';
}
```

- [ ] **Step 5.2: Add barcode print tests**

Create `apps/web/src/app/inventory/lib/barcode-print.test.ts` with tests that prove `masterName` and `sku` are escaped:

```typescript
import { describe, expect, it } from 'vitest';
import { buildBarcodePrintHtml, escapeHtml } from './barcode-print';
import type { InventoryListItem } from '@kiditem/shared';

const item: InventoryListItem = {
  id: '00000000-0000-4000-8000-000000000001',
  optionId: '00000000-0000-4000-8000-000000000002',
  masterId: '00000000-0000-4000-8000-000000000003',
  sku: 'SKU-<script>',
  masterName: '상품 <img src=x onerror=alert(1)>',
  optionName: null,
  kind: 'SIMPLE',
  currentStock: 7,
  availableStock: 7,
  safetyStock: 2,
  reorderPoint: 3,
  leadTimeDays: null,
  warehouseLocation: null,
  status: 'healthy',
};

describe('barcode print html', () => {
  it('escapes html special characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('does not inject raw item fields into the print html', () => {
    const html = buildBarcodePrintHtml([item], new Date('2026-04-25T00:00:00.000Z'));
    expect(html).toContain('SKU-&lt;script&gt;');
    expect(html).toContain('상품 &lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('SKU-<script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });
});
```

- [ ] **Step 5.3: Surface popup-blocked state in the page**

In `page.tsx`, update `handleBarcodePrint`:

```typescript
const handleBarcodePrint = () => {
  const result = printBarcodeWindow(items);
  if (result === 'empty') toast.warning('출력할 상품이 없습니다.');
  if (result === 'popup-blocked') toast.error('팝업이 차단되어 바코드 출력 창을 열 수 없습니다.');
};
```

- [ ] **Step 5.4: Run barcode tests**

Run:

```bash
(cd apps/web && npx vitest run src/app/inventory/lib/barcode-print.test.ts)
```

Expected: PASS.

### T6: Migrate stock movement views to canonical inventory transactions

**Files:**
- Create: `apps/web/src/app/inventory/hooks/useInventoryTransactions.ts`
- Modify: `apps/web/src/app/inventory/components/StockMovementTab.tsx`
- Modify: `apps/web/src/app/inventory/components/StockMovementTable.tsx`
- Modify: `apps/web/src/app/inventory/components/StockMovementSummaryCard.tsx`
- Modify: `apps/web/src/app/inventory-hub/components/StockIo.tsx`
- Modify: `apps/web/src/app/inventory-hub/components/StockLedger.tsx`

- [ ] **Step 6.1: Add transaction hooks**

Create `apps/web/src/app/inventory/hooks/useInventoryTransactions.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import {
  fetchTransactionSummary,
  fetchTransactions,
  transactionKeyParams,
} from '../lib/inventory-api';
import type { TransactionListParams } from '../lib/inventory-api';

export function useInventoryTransactions(params: TransactionListParams) {
  return useQuery({
    queryKey: queryKeys.inventory.transactions(transactionKeyParams(params)),
    queryFn: () => fetchTransactions(params),
  });
}

export function useInventoryTransactionSummary(days: number) {
  return useQuery({
    queryKey: queryKeys.inventory.transactionSummary({ days: String(days) }),
    queryFn: () => fetchTransactionSummary(days),
  });
}
```

- [ ] **Step 6.2: Replace `/api/stock-movement` in `StockMovementTab`**

Update `StockMovementTab.tsx` so it:
- Computes `days` from `dateRange`.
- Calls `useInventoryTransactions({ page: 1, limit: 200, from })`.
- Calls `useInventoryTransactionSummary(days)`.
- Derives grouped rows client-side from `TransactionListItem[]`.

Use this grouping helper inside the component file or a small local helper:

```typescript
import type { TransactionListItem } from '@kiditem/shared';
import type { GroupedRow } from './StockMovementTable';

function groupTransactions(rows: TransactionListItem[], groupBy: string): GroupedRow[] {
  const map = new Map<string, GroupedRow>();
  for (const tx of rows) {
    const key = groupBy === 'date'
      ? String(tx.createdAt).slice(0, 10)
      : groupBy === 'type'
        ? tx.type
        : tx.optionName ?? tx.optionId;
    const current = map.get(key) ?? { key, inQty: 0, outQty: 0, adjustQty: 0, inAmt: 0, outAmt: 0 };
    if (tx.type === 'RECEIVE') {
      current.inQty += tx.quantity;
      current.inAmt += tx.totalCost;
    } else if (tx.type === 'ISSUE') {
      current.outQty += tx.quantity;
      current.outAmt += tx.totalCost;
    } else {
      current.adjustQty += tx.quantity;
    }
    map.set(key, current);
  }
  return Array.from(map.values());
}
```

Expected: `rg -n "/api/stock-movement" apps/web/src/app/inventory/components/StockMovementTab.tsx` returns no matches.

- [ ] **Step 6.3: Update `StockMovementTable` row shape**

Update `GroupedRow`:

```typescript
export interface GroupedRow {
  key: string;
  inQty: number;
  outQty: number;
  adjustQty: number;
  inAmt: number;
  outAmt: number;
}
```

Update type labels from legacy lower-case values to canonical shared values:

```typescript
const TYPE_LABEL: Record<string, string> = {
  RECEIVE: '입고',
  ISSUE: '출고',
  ADJUST: '조정',
};
```

Render an adjustment column or include `adjustQty` in the net movement calculation. Use `formatNumber` for quantities and `formatKRW` only for amount columns.

- [ ] **Step 6.4: Migrate inventory-hub transaction tabs**

Update only these inventory-hub files:
- `apps/web/src/app/inventory-hub/components/StockIo.tsx`
- `apps/web/src/app/inventory-hub/components/StockLedger.tsx`

Both must use `fetchTransactions` / `fetchTransactionSummary` from `@/app/inventory/lib/inventory-api` or a tiny local adapter. Do not edit `StockAssets.tsx`, `StockAudits.tsx`, or `purchase-orders`.

Implementation details for the two touched inventory-hub files:
- Replace direct `toLocaleDateString()`, `toLocaleString()`, `Intl.*`, and inline currency/date formatting with `formatDate`, `formatDateTime`, `formatNumber`, or `formatKRW` from `@/lib/utils`.
- Canonical inventory transactions expose `optionId` / `optionName`, not the legacy stock-movement `productId` / `productName` grouping. In `StockLedger.tsx`, group rows by `tx.optionId` and display `tx.optionName ?? tx.optionId`; do not invent product-level grouping in W2.
- If a legacy hub column requires product copy that the canonical transaction endpoint does not return, render the option display name and add a release-note line that product-level ledger grouping is outside W2.

- [ ] **Step 6.5: Verify stale endpoint removal in W2-owned files**

Run:

```bash
rg -n "/api/stock-movement" apps/web/src/app/inventory apps/web/src/app/inventory-hub
```

Expected:
- No matches in `apps/web/src/app/inventory/**`.
- No matches in `StockIo.tsx` or `StockLedger.tsx`.
- Matches in out-of-scope files must be listed with a reason and must not be hidden.

### T7: Wire minimal stock operation UI to existing inventory endpoints

**Files:**
- Create: `apps/web/src/app/inventory/components/StockOperationDialog.tsx`
- Modify: `apps/web/src/app/inventory/components/InventoryTable.tsx`
- Modify: `apps/web/src/app/inventory/page.tsx`

- [ ] **Step 7.1: Create a minimal operation dialog**

Create `StockOperationDialog.tsx` with three modes: `receive`, `issue`, `adjust`. It should:
- Accept `item: InventoryListItem | null`.
- Accept `mode: 'receive' | 'issue' | 'adjust' | 'metadata' | null`.
- Validate form input with the shared schema before calling the mutation hook.
- Show field-specific Korean labels.
- On success, close dialog and toast success.
- On error, use `isApiError(err) ? err.detail : '...'`.

Use this shape for props:

```typescript
import type { InventoryListItem } from '@kiditem/shared';

export type StockOperationMode = 'receive' | 'issue' | 'adjust' | 'metadata';

interface StockOperationDialogProps {
  item: InventoryListItem | null;
  mode: StockOperationMode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

- [ ] **Step 7.2: Add row actions to the inventory table**

Update `InventoryTable.tsx` props:

```typescript
import type { StockOperationMode } from './StockOperationDialog';

interface InventoryTableProps {
  items: InventoryListItem[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onOpenOperation: (item: InventoryListItem, mode: StockOperationMode) => void;
}
```

Add an actions column with buttons for:
- 입고 → `receive`
- 출고 → `issue`
- 조정 → `adjust`
- 설정 → `metadata`

Expected: no browser code mutates stock locally; all actions open the dialog and submit through hooks.

- [ ] **Step 7.3: Connect page-level dialog state**

In `page.tsx`, keep selected row and mode:

```typescript
const [operationItem, setOperationItem] = useState<InventoryListItem | null>(null);
const [operationMode, setOperationMode] = useState<StockOperationMode | null>(null);

const openOperation = (item: InventoryListItem, mode: StockOperationMode) => {
  setOperationItem(item);
  setOperationMode(mode);
};
```

Render `StockOperationDialog` once at page bottom. Close by clearing both state values.

- [ ] **Step 7.4: Run focused web type check**

Run:

```bash
(cd apps/web && npx tsc --noEmit --pretty false)
```

Expected: no errors in `apps/web/src/app/inventory/**`.

### T8: Backend contract check and narrow fixes only if needed

**Files:**
- Prefer read-only: `apps/server/src/inventory/controllers/inventory.controller.ts`
- Prefer read-only: `apps/server/src/inventory/services/inventory.service.ts`
- Modify only if actual schema drift is observed: matching inventory controller/service/tests.

- [ ] **Step 8.1: Run inventory server tests before any backend edit**

Run:

```bash
(cd apps/server && npx vitest run src/inventory)
```

Expected: PASS. If it fails, only fix failures inside `apps/server/src/inventory/**` that correspond to the current inventory contract.

- [ ] **Step 8.2: Check shared `satisfies` coverage**

Run:

```bash
for f in $(grep -rlE "from '@kiditem/shared'" apps/server/src/inventory --include="*.service.ts"); do
  if grep -E "from '@kiditem/shared'" "$f" | grep -qE '\b[A-Z][a-zA-Z]+\b'; then
    grep -qE 'satisfies ' "$f" || echo "MISSING: $f"
  fi
done
```

Expected: no output.

- [ ] **Step 8.3: Boot server if any backend file changed**

Run:

```bash
npm run dev:server
```

Expected: Nest starts successfully and reaches the normal startup log. Stop the process after confirming boot. If no backend file changed, this command is still recommended before final completion because W2 uses existing mutation endpoints.

### T9: Final verification and release note

**Files:**
- Create: `docs/release-notes/2026-04-inventory-ui-typed-boundary.md`
- Modify: this plan's execution notes only during implementation if the executing team keeps inline notes.

- [ ] **Step 9.1: Run all W2 verification commands**

Run:

```bash
# Shared schema safety
npx vitest run packages/shared/src/schemas/inventory.spec.ts
(cd packages/shared && npm run build)

# Web focused tests
(cd apps/web && npx vitest run src/app/inventory/lib/barcode-print.test.ts)
(cd apps/web && npx tsc --noEmit --pretty false)

# Server inventory safety
(cd apps/server && npx vitest run src/inventory)

# Required frontend gate
npm run build --workspace=apps/web
```

Expected:
- Shared schema test passes.
- Shared package build passes.
- Barcode print test passes.
- No TypeScript errors in `apps/web/src/app/inventory/**` or W2-touched `inventory-hub` transaction files.
- Server inventory tests pass.
- Web build passes or fails only on documented non-W2 blockers from W1/W3/W6/W5; first failing path is recorded.

- [ ] **Step 9.2: Manual smoke path**

With web and server running, smoke:

```bash
npm run dev:server
npm run dev --workspace=apps/web
```

Expected manual checks:
- `/inventory` loads the first page and summary cards.
- Filter tabs switch all/low/out and reset page to 1.
- Excel export downloads without a 400 from `limit=10000`.
- Barcode print opens a new window or shows the popup-blocked toast.
- Receive/issue/adjust/metadata dialog submits and invalidates list/transactions.
- Stock movement tab uses `/api/inventory/transactions*`, not `/api/stock-movement`.
- `/inventory-hub` IO and ledger tabs no longer call `/api/stock-movement`.

- [ ] **Step 9.3: Add release note**

Create `docs/release-notes/2026-04-inventory-ui-typed-boundary.md` with:
- Summary of typed-boundary migration.
- Exact inventory endpoints used.
- Confirmation that no Prisma migration was required.
- Export behavior change: paged fetches with `limit=200` instead of one `limit=10000` request.
- Barcode print hardening note.
- Any excluded `inventory-hub` tabs and their explicit owner/successor if not migrated.

## Acceptance Criteria

- `apps/web/src/app/inventory/page.tsx` no longer calls `apiClient.get<T>` for inventory list/export/stock-check responses; inventory responses are parsed with shared Zod schemas.
- `rg -n "limit=10000" apps/web/src/app/inventory` returns no matches.
- `rg -n "/api/stock-movement" apps/web/src/app/inventory` returns no matches.
- `StockIo.tsx` and `StockLedger.tsx` also have no `/api/stock-movement` matches.
- Barcode print escapes SKU/name HTML and has a focused test.
- Stock operation UI calls only `/api/inventory/:id/receive`, `/issue`, `/adjust`, or `PATCH /api/inventory/:id`; no local current-stock mutation exists in the browser.
- Existing ADR-0014 invariant remains intact: `InventoryService` is the only stock writer.
- No orders, ad-ops, root page, product catalog, procurement, or stock-audits backend files are modified by W2.
- Required commands in T9 pass, or any remaining failure is a documented non-W2 blocker with first failing file path.

## Verification Commands

```bash
# Shared
npx vitest run packages/shared/src/schemas/inventory.spec.ts
(cd packages/shared && npm run build)

# Web focused
(cd apps/web && npx vitest run src/app/inventory/lib/barcode-print.test.ts)
(cd apps/web && npx tsc --noEmit --pretty false)
npm run build --workspace=apps/web

# Backend inventory
(cd apps/server && npx vitest run src/inventory)
npm run dev:server
```

Expected final result: all W2-owned tests and type checks pass; `npm run build --workspace=apps/web` is green or blocked only by explicitly documented non-W2 paths.

## Staffing Guidance for Later `$team` Execution

Recommended `$team` staffing after this plan is approved:

- **Lane 1 — Shared + API boundary (1 worker, medium reasoning):** T1-T2. Own shared schema tests, `inventory-api.ts`, and query keys.
- **Lane 2 — Inventory page + export + print (1 worker, medium reasoning):** T3-T5. Own page composition, toolbar/filter/summary edits, paged xlsx export, barcode hardening.
- **Lane 3 — Transactions + operations UI (1 worker, high reasoning):** T6-T7. Own stock movement migration and stock operation dialog. Must preserve ADR-0014.
- **Lane 4 — Verification/release (1 worker, medium reasoning):** T8-T9. Own server inventory tests, web build, smoke evidence, release note, and scope guard.

Suggested launch hint:

```bash
omx team 4:executor "Implement approved Plan W2 inventory-ui from docs/superpowers/plans/2026-04-25-plan-w2-inventory-ui.md. Preserve owner domain inventory and do not edit W3/W6 worker files."
```

Before launch, the lead should assign file ownership explicitly:
- Lane 1 owns `packages/shared/src/schemas/inventory.spec.ts`, `apps/web/src/app/inventory/lib/inventory-api.ts`, `apps/web/src/lib/query-keys.ts`.
- Lane 2 owns `page.tsx`, toolbar/filter/summary components, `inventory-export.ts`, `barcode-print.ts`, and barcode test.
- Lane 3 owns `StockMovement*`, `StockOperationDialog.tsx`, `InventoryTable.tsx`, `StockIo.tsx`, and `StockLedger.tsx`.
- Lane 4 owns verification commands and release note.

## RALPLAN-DR Summary

**Decision:** Implement W2 as an inventory-domain typed-boundary repair: migrate current inventory UI reads/writes to shared Zod schemas and canonical Plan B2a endpoints, remove stale `/api/stock-movement` usage from W2-owned files, harden barcode print, and replace invalid one-shot export with paged reads.

**Rationale:** The backend inventory contract is already current and strongly tested. The remaining risk is mostly frontend trust of hand-written response types and stale endpoint assumptions. The safest implementation is to add a small inventory-local web API wrapper and migrate consumers to it without changing global API infrastructure or unrelated domains.

**Execution locality:** Same-domain cross-layer only: inventory web, shared inventory schema tests, and server inventory verification. Backend edits are conditional and narrow.

**Risk controls:** Shared schema tests, parsed web boundaries, no legacy alias for deleted stock-movement route, xlsx pagination within DTO limits, print HTML escaping, and mandatory `npm run build --workspace=apps/web` gate.

## ADR Section — W2 Inventory UI Boundary

### Decision

Use the existing Plan B2a inventory API as the canonical contract for W2. Web inventory consumers will parse responses with `@kiditem/shared` inventory schemas through an inventory-local wrapper. Stale `/api/stock-movement` callers will migrate to `/api/inventory/transactions` and `/api/inventory/transactions/summary`; W2 will not recreate a legacy stock-movement endpoint.

### Drivers

- ADR-0014 requires all stock mutations to flow through `InventoryService`.
- `apps/server/src/inventory/CLAUDE.md` documents the current inventory endpoints and route ordering.
- `apps/web/AGENTS.md` requires React Query, `apiClient`, shared response types, and semantic token cleanup in touched UI.
- Current export violates the server `limit <= 200` DTO constraint.
- Current barcode print writes unescaped item fields into HTML.
- R0 requires inventory to be closed before orders/root/ad-ops successor work.

### Alternatives considered

1. **Add a `/api/stock-movement` alias controller.** Rejected because Plan B2a intentionally deleted that surface and the canonical inventory ledger endpoints already exist.
2. **Raise inventory list `limit` above 200 for export.** Rejected because frontend pagination avoids a broad backend contract change and keeps list latency bounded.
3. **Modify global `apiClient` to add `postParsed` / `patchParsed`.** Rejected for W2 because it is root infrastructure used by all domains. Inventory-local parsing is sufficient.
4. **Rewrite all of `inventory-hub`.** Rejected because that page mixes procurement, stock audits, product-cost assets, and inventory transaction views. W2 owns only the inventory transaction tabs in `inventory-hub`: `StockIo.tsx` and `StockLedger.tsx`.
5. **Introduce a real barcode library.** Rejected because W2 is a typed-boundary stabilization plan; current pseudo-barcode print behavior can be hardened without a new dependency.

### Why chosen

The chosen path repairs the known runtime and typed-boundary risks with the smallest owner-local changes. It preserves the server's tested single-writer stock model, keeps frontend parsing at the domain boundary, and avoids cross-domain edits that would collide with W3, W6, or W5 workers.

### Consequences

- Inventory UI gains stronger runtime drift detection through Zod parsing.
- Excel export makes multiple bounded requests for large inventories instead of one invalid request.
- Stock movement UI no longer depends on a deleted endpoint.
- Barcode print remains browser-dependent, but popup-blocked and HTML-injection cases become explicit.
- Product/procurement/stock-audit `inventory-hub` tabs remain outside W2 even while IO and ledger tabs are migrated.

### Follow-ups

- `W3 orders-ui`: order page typed-boundary closure.
- `W6 root-boundaries`: root `/api/action-tasks` and `/api/agent-registry/org` closure.
- `W5 ad-ops-rewire`: ad-ops re-enable after product/inventory/order contracts stabilize.
- Product/procurement-specific cleanup for `inventory-hub` tabs that depend on `/api/products`, purchase-orders, or stock-audits contracts.
