# Plan W3 — Orders UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:writing-plans` for edits to this plan, then `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewire the `/orders` frontend to the current channel-agnostic `Order` / `OrderLineItem` contract, replacing loose legacy row casts and broken sync/action calls with parsed typed boundaries.

**Architecture:** `orders` is the owner business domain. Same-domain cross-layer edits are allowed under ADR-0019: `packages/shared` order schemas, `apps/server/src/orders` DTO/response mapping, and direct web consumers under `apps/web/src/app/orders`; use the existing `channels` order-sync endpoint only as a dependency and do not modify channel implementation unless a reviewer explicitly expands the plan. The UI should build a typed pipeline projection from canonical order list responses, keep polling/scheduled sync inside React Query, and preserve the existing ACCEPT → INSTRUCT → DEPARTURE → DELIVERING visualization without mixing inventory, ad-ops, root action-task, or channel-dashboard implementation.

**Tech Stack:** Next.js 16, React 19, React Query v5, `apiClient.getParsed`, Zod schemas in `@kiditem/shared`, NestJS 11 orders module, Prisma v7 channel-agnostic orders schema, Vitest + Testing Library.

**Predecessors:** Plan R0 (`docs/superpowers/plans/2026-04-23-plan-r0-post-f1-successor-roadmap.md`), Plan W1 (`docs/superpowers/plans/2026-04-23-plan-w1-product-data-ui.md`) for plan structure and typed-boundary migration style.

**Successors:** `W6 root-boundaries` and `W5 ad-ops-rewire` stay separate. Returns/CS pages are not part of W3 unless a direct `/orders` consumer is introduced by this plan, which this plan does not do.

---

## Why W3 Exists

R0 defines `W3 orders-ui` as the F3 orders slice: “Convert orders page to typed boundaries and current schema.” The current `/orders` page is intentionally marked as legacy in comments, but it now has real runtime and type-boundary debt:

- `apps/web/src/app/orders/page.tsx` defines a local `OrderRow` and fetches `apiClient.get<{ items: OrderRow[] }>(/api/orders?status=...)` instead of parsing shared schemas.
- The web `OrderRow` expects flat fields (`productName`, `quantity`, `orderNumber`) that do not exist on the canonical `Order` row returned by `OrdersService.findAll()`. Product/quantity data lives in `lineItems`; order number is `externalNumber` / `externalOrderId`.
- `apps/web/src/app/orders/page.tsx` scheduled sync posts to `/api/coupang-sync` with `{ createdAtFrom, createdAtTo }`, but `ChannelSyncController` exposes `POST /api/coupang-sync/orders` and `SyncOrdersBodyDto` accepts `{ from, to }`.
- `apps/web/src/app/orders/page.tsx` has action placeholders even though `POST /api/orders` already supports `action: 'confirm' | 'invoice'` through `OrderActionBodyDto`.
- `apps/web/src/app/orders/components/OrderTable.tsx` calls `toLocaleDateString()` / `toLocaleTimeString()` directly, violating `apps/web/AGENTS.md` formatting rules.
- `packages/shared/src/schemas/order.ts` only exports entity schemas; it lacks list, list-item, stats, action-response, and pipeline status schemas for web/server contract parsing.
- `apps/server/src/orders/services/orders.service.ts` returns Prisma rows directly and does not use the required `satisfies <SharedType>` drift guard for order API response shapes.

W3 makes the orders UI reliable without changing the underlying Prisma schema or touching unrelated commerce domains.

## Source-of-truth Evidence

Required docs and scoped instructions read before writing this plan:

- Root repo instructions: `AGENTS.md`
- Web frontend rules and orders notable sub-domain: `apps/web/AGENTS.md`
- Server NestJS rules: `apps/server/AGENTS.md`
- Orders domain guide: `apps/server/src/orders/CLAUDE.md`
- Channels sync guide, read only because order sync endpoint is consumed: `apps/server/src/channels/CLAUDE.md`
- Shared schema rules: `packages/shared/AGENTS.md`
- Roadmap definition: `docs/superpowers/plans/2026-04-23-plan-r0-post-f1-successor-roadmap.md`
- Plan style predecessor: `docs/superpowers/plans/2026-04-23-plan-w1-product-data-ui.md`

Current file evidence inspected for this plan:

- Orders web page and components:
  - `apps/web/src/app/orders/page.tsx`
  - `apps/web/src/app/orders/components/OrderHeader.tsx`
  - `apps/web/src/app/orders/components/OrderTable.tsx`
  - `apps/web/src/app/orders/components/PipelineVisualization.tsx`
- Web query keys and API boundary:
  - `apps/web/src/lib/query-keys.ts`
  - `apps/web/src/lib/api-client.ts`
  - `apps/web/src/lib/utils.ts`
- Shared order contract:
  - `packages/shared/src/schemas/order.ts`
  - `packages/shared/src/schemas/index.ts`
  - `packages/shared/src/index.ts`
- Orders server contract:
  - `apps/server/src/orders/controllers/orders.controller.ts`
  - `apps/server/src/orders/services/orders.service.ts`
  - `apps/server/src/orders/dto/list-orders.dto.ts`
  - `apps/server/src/orders/dto/order-action.dto.ts`
  - `apps/server/src/orders/services/__tests__/order-flow.spec.ts`
- Returns/CS server files, inspected to determine W3 scope and left out of implementation:
  - `apps/server/src/orders/controllers/returns.controller.ts`
  - `apps/server/src/orders/services/returns.service.ts`
  - `apps/server/src/orders/controllers/cs.controller.ts`
  - `apps/server/src/orders/services/cs.service.ts`
  - `apps/server/src/orders/dto/create-cs.dto.ts`
- Order sync dependency, consumed but not owned by W3:
  - `apps/server/src/channels/controllers/channel-sync.controller.ts`
  - `apps/server/src/channels/dto/sync-orders.dto.ts`
  - `apps/server/src/channels/services/channel-sync.service.ts`
  - `apps/server/src/channels/adapters/coupang/constants.ts`
  - `apps/server/src/channels/adapters/coupang/orders.ts`
- Prisma source of truth:
  - `prisma/models/orders.prisma`
- DB ontology / ERD review:
  - `docs/ERD.md` and `graphify-out/schema/GRAPH_REPORT.md` confirm `OrderLineItem` belongs to Orders, relates to `Order`, `ProductOption`, and `ChannelListingOption`, and carries its own `companyId`.
  - `prisma/models/orders.prisma` describes `OrderLineItem.companyId` as an IDOR-defense denormalization. W3 server queries must therefore keep line-item reads company-scoped, not only parent-order scoped.

## Locked Decisions

1. **Owner domain is `orders`.** W3 may edit `packages/shared` order schemas, `apps/server/src/orders`, and direct `/orders` web consumers. W3 must not modify inventory, ad-ops, root action-task, root agent-registry, finance, channel-dashboard, or product UI implementation.
2. **No Prisma schema migration.** `Order`, `OrderLineItem`, `OrderReturn`, and `CSRecord` schema are already channel-agnostic. W3 only maps and types existing fields.
3. **Frontend uses parsed schemas at the API boundary.** New `/orders` data fetches must use `apiClient.getParsed(path, schema)` and mutations must parse action/sync responses. No new `apiClient.get<T>` shadow types for order data.
4. **Server maps Prisma rows into UI-ready order list items.** Do not return raw Prisma rows directly from `OrdersService.findAll()` for the list route. The service should derive `primaryProductName`, `totalQuantity`, `lineItemCount`, `displayOrderNumber`, and `shipmentBoxId` from canonical `Order` + `lineItems`.
5. **Order statuses remain string-backed.** Add Zod-level status enums/unions in `packages/shared`; do not add native PostgreSQL enums.
6. **Pipeline UI statuses are limited to the existing visual flow.** The visible pipeline remains `ACCEPT`, `INSTRUCT`, `DEPARTURE`, `DELIVERING`, and optional `FINAL_DELIVERY`. `CANCELED` may exist as a list/status value but is not inserted into the main pipeline visualization in W3.
7. **Scheduled sync consumes the existing channels endpoint.** Fix the URL/body to `POST /api/coupang-sync/orders` with `{ from, to }`. Do not edit `apps/server/src/channels/**` in W3 unless the endpoint contract is proven broken by verification.
8. **Scheduled sync polling must be React Query-owned.** Use `refetchInterval` and a query key under `queryKeys.orders.scheduledSync(...)`; do not add `setInterval`. `sessionStorage` may be used only as a client-side once-per-date-hour guard.
9. **Confirm action is in scope.** The confirm button should call `POST /api/orders` with `{ action: 'confirm', shipmentBoxIds }`, invalidate order pipeline queries on success, and report rows with missing numeric `shipmentBoxId` to the user.
10. **Invoice upload is a minimal typed action, not a shipping feature expansion.** W3 may implement prompt-based `deliveryCompanyCode` and `invoiceNumber` input for selected rows because `OrderActionBodyDto` already supports it. W3 must not build a shipment workflow, picking flow, label-printing system, or inventory allocation.
11. **Returns and CS remain out of the `/orders` UI.** W3 inspected those server files because they share `OrdersModule`, but does not add returns/CS pages or change CS `listingId`/`productId` alias behavior.
12. **No silent sync fallback.** If scheduled sync fails, surface a toast and keep the last successful order data; do not mark the sync as successful in `sessionStorage` on failure.
13. **Design cleanup is limited to touched orders files.** Replace hard-coded legacy `text-slate-*`, `bg-white`, `border-slate-*`, and direct date formatting in edited orders components with semantic tokens/utilities where practical, but do not redesign the page.
14. **No direct browser companyId.** The browser must not send `companyId`; server endpoints continue to use `@CurrentCompany()`.
15. **Line-item reads stay company-scoped.** Because `OrderLineItem.companyId` is an IDOR-defense denormalization, `OrdersService.findAll()` and `findOne()` must include line items with `where: { companyId }` rather than relying only on the parent `Order.companyId` filter.

## File Map

### Shared order schemas

- Modify: `packages/shared/src/schemas/order.ts`
  - Add `OrderStatusSchema`, `OrderPipelineStatusSchema`, `OrderListLineItemSchema`, `OrderListItemSchema`, `OrderListResponseSchema`, `OrderStatsResponseSchema`, `OrderActionResponseSchema`, and `OrderPipelineResponseSchema`.
  - Add `OrderSyncResultSchema` locally in the scheduled-sync hook if the web scheduler needs to parse the existing channels sync response; do not export a generic sync schema from `packages/shared` in W3.
- Modify: `packages/shared/src/schemas/index.ts`
  - Re-export new order schemas and types.
- Modify: `packages/shared/src/index.ts`
  - Re-export new order schemas and types for `@kiditem/shared` root imports.
- Create: `packages/shared/src/schemas/order.spec.ts`
  - Cover list item derivation shape, status validation, stats shape, action response shape, and rejected invalid status.

### Server orders module

- Modify: `apps/server/src/orders/services/orders.service.ts`
  - Map Prisma `Order & { lineItems: OrderLineItem[] }` into `OrderListItem` values with `satisfies OrderListItem`.
  - Fetch included line items with `where: { companyId }` for both list/detail paths.
  - Return `OrderListResponse` and `OrderStatsResponse` with `satisfies` guards.
  - Keep `findOne()` IDOR-safe with `findFirst({ id, companyId })` and include company-scoped line items.
  - Keep `confirm()` and `uploadInvoice()` adapter delegation; shape responses as `OrderActionResponse`.
- Modify: `apps/server/src/orders/controllers/orders.controller.ts`
  - Keep routes unchanged: `GET /api/orders`, `GET /api/orders/stats`, `GET /api/orders/:id`, `POST /api/orders`.
  - Ensure `POST /api/orders` still routes by action enum; do not add `/confirm` or `/invoice` endpoints.
- Modify: `apps/server/src/orders/dto/list-orders.dto.ts`
  - Add optional `limit?: number` and `page?: number` only if the implementation chooses bounded list fetches. Use `class-transformer` numeric coercion if added.
- Modify: `apps/server/src/orders/services/__tests__/order-flow.spec.ts`
  - Assert list response flattening from line items, `shipmentBoxId` derivation, stats response shape, parent order and included line-item companyId filters, and action response parsing shape.

### Web orders UI

- Modify: `apps/web/src/lib/query-keys.ts`
  - Add stable keys for `orders.list(params)`, `orders.pipeline(params)`, `orders.stats()`, `orders.scheduledSync(dateHour)`, and `orders.action(action)` if absent or too broad.
- Create: `apps/web/src/app/orders/lib/order-pipeline.ts`
  - Export typed `ORDER_PIPELINE_NODES`, `ORDER_ALL_NODES`, `ORDER_PIPELINE_EDGES`, `SYNC_HOURS`, `buildPipelineFromResponses()`, `getCurrentSyncWindow()`, `makeDateHourKey()`, and `getNumericShipmentBoxIds()`.
- Create: `apps/web/src/app/orders/hooks/useOrdersPipeline.ts`
  - Fetch all visible statuses with React Query using `OrderListResponseSchema`; build `{ pipeline, counts }` in a typed adapter.
- Create: `apps/web/src/app/orders/hooks/useScheduledOrderSync.ts`
  - Use React Query `refetchInterval` to check the current hour and call `POST /api/coupang-sync/orders` with `{ from, to }` once per date-hour.
- Create: `apps/web/src/app/orders/hooks/useOrderActions.ts`
  - Implement confirm and invoice mutations against `POST /api/orders`, parse `OrderActionResponseSchema`, invalidate order pipeline/list/stats queries, and surface `sonner` toasts.
- Modify: `apps/web/src/app/orders/page.tsx`
  - Remove local `OrderRow`, inline `ACTIVE_NODES`, inline `SYNC_HOURS`, manual sync `useEffect`, and placeholder action toasts.
  - Compose the three hooks above and pass typed data into components.
- Modify: `apps/web/src/app/orders/components/OrderHeader.tsx`
  - Accept typed sync state, show last updated/sync attempt clearly, and keep manual refresh.
- Modify: `apps/web/src/app/orders/components/PipelineVisualization.tsx`
  - Use typed pipeline node shape from `order-pipeline.ts`; replace touched hard-coded colors/styles with semantic tokens while preserving existing visualization.
- Modify: `apps/web/src/app/orders/components/OrderTable.tsx`
  - Consume `OrderListItem` from `@kiditem/shared` instead of local `OrderRow`.
  - Use `formatDate()` / `formatTime()` from `@/lib/utils`; remove direct `toLocaleDateString()` and `toLocaleTimeString()` calls.
  - Use `primaryProductName`, `displayOrderNumber`, `totalQuantity`, and `shipmentBoxId` fields.
- Create: `apps/web/src/app/orders/__tests__/order-pipeline.spec.ts`
  - Unit-test pipeline builder, scheduled sync window key, and shipmentBoxId extraction.
- Create: `apps/web/src/app/orders/__tests__/orders-page.spec.tsx`
  - RTL smoke covering list parse, confirm mutation, sync endpoint URL/body, and no local legacy fields.

## Out of Scope

- Inventory, picking, shipment allocation, label-print generation, warehouse stock mutation, or `apps/server/src/picking/**`.
- Ad-ops, root `/api/action-tasks`, root `/api/agent-registry/org`, or channel-dashboard pages.
- Changes to `apps/server/src/channels/services/channel-sync.service.ts` internals, Coupang adapter retry policy, or environment credential behavior.
- New Prisma migrations or native DB enums.
- Returns and CS UI. `POST/GET /api/returns` and `POST/GET /api/cs` remain server-owned and unchanged unless a direct `/orders` page compile break is found.
- Rewriting `apps/web/src/app/coupang/orders/**`; that is a Coupang dashboard page, not the `/orders` pipeline page.
- Full invoice management workflow. W3 only wires the existing order action endpoint with minimal typed input.
- Manual order creation. The existing “수기주문” button may remain disabled or informational unless an existing typed endpoint is already present in `orders`; do not invent a manual-order API in W3.

## Tasks

### Task 0 — Baseline the current orders UI and endpoint mismatch

**Files:**
- Read: `apps/web/src/app/orders/page.tsx`
- Read: `apps/web/src/app/orders/components/OrderTable.tsx`
- Read: `apps/server/src/orders/services/orders.service.ts`
- Read: `apps/server/src/channels/controllers/channel-sync.controller.ts`
- Read: `apps/server/src/channels/dto/sync-orders.dto.ts`

- [ ] **Step 0.1: Confirm current web build surface without changing code**

Run:

```bash
npm run build --workspace=apps/web
```

Expected: build either passes or fails on a non-W3 blocker already owned by another active lane. Record the first failing file in the implementation notes or PR body. W3 must not fix W2/W6/ad-ops/product blockers.

- [ ] **Step 0.2: Inventory every `/orders` API call in the web app**

Run:

```bash
rg -n "apiClient\.(get|post|patch|put|delete|getParsed)|/api/orders|/api/coupang-sync" apps/web/src/app/orders apps/web/src/lib/query-keys.ts
```

Expected current hits include:

- `apps/web/src/app/orders/page.tsx` fetches `/api/orders?status=${node.key}` with `apiClient.get<{ items: OrderRow[] }>`.
- `apps/web/src/app/orders/page.tsx` posts `/api/coupang-sync` with `createdAtFrom` / `createdAtTo`.
- `apps/web/src/app/orders/page.tsx` has placeholder confirm/invoice handlers.

- [ ] **Step 0.3: Confirm server endpoint contracts**

Run:

```bash
rg -n "@Controller\('orders'\)|@Controller\('coupang-sync'\)|@Post\('orders'\)|class SyncOrdersBodyDto|class OrderActionBodyDto" apps/server/src/orders apps/server/src/channels
```

Expected evidence:

- Orders action endpoint is `POST /api/orders` with `OrderActionBodyDto`.
- Coupang order sync endpoint is `POST /api/coupang-sync/orders` with `SyncOrdersBodyDto` fields `from` and `to`.
- There is no `POST /api/coupang-sync` root handler.

- [ ] **Step 0.4: Commit nothing**

Do not commit a baseline-only step. Keep baseline notes for the final PR body/release note.

---

### Task 1 — Add shared order response schemas

**Files:**
- Modify: `packages/shared/src/schemas/order.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/schemas/order.spec.ts`

- [ ] **Step 1.1: Add status and response schemas to `packages/shared/src/schemas/order.ts`**

Add the following schema block after the existing entity schemas:

```typescript
export const OrderStatusSchema = z.enum([
  'ACCEPT',
  'INSTRUCT',
  'DEPARTURE',
  'DELIVERING',
  'FINAL_DELIVERY',
  'CANCELED',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderPipelineStatusSchema = z.enum([
  'ACCEPT',
  'INSTRUCT',
  'DEPARTURE',
  'DELIVERING',
  'FINAL_DELIVERY',
]);
export type OrderPipelineStatus = z.infer<typeof OrderPipelineStatusSchema>;

export const OrderListLineItemSchema = z.object({
  id: z.string().uuid(),
  productName: z.string(),
  optionName: z.string().nullable(),
  sku: z.string().nullable(),
  quantity: z.number().int().nonnegative(),
  unitPrice: z.number().int(),
  totalPrice: z.number().int(),
  status: z.string(),
  externalLineId: z.string().nullable(),
});
export type OrderListLineItem = z.infer<typeof OrderListLineItemSchema>;

export const DeliveryCompanySchema = z.object({
  code: z.string(),
  name: z.string(),
});
export type DeliveryCompany = z.infer<typeof DeliveryCompanySchema>;

export const OrderListItemSchema = z.object({
  id: z.string().uuid(),
  platform: z.string(),
  externalOrderId: z.string(),
  externalNumber: z.string().nullable(),
  displayOrderNumber: z.string(),
  shipmentBoxId: z.number().int().positive().nullable(),
  status: OrderStatusSchema,
  customerName: z.string(),
  receiverName: z.string().nullable(),
  receiverAddr: z.string().nullable(),
  memo: z.string().nullable(),
  orderedAt: zIsoDate,
  shippedAt: zIsoDate.nullable(),
  deliveredAt: zIsoDate.nullable(),
  trackingNumber: z.string().nullable(),
  shippingCompany: z.string().nullable(),
  totalPrice: z.number().int(),
  totalQuantity: z.number().int().nonnegative(),
  lineItemCount: z.number().int().nonnegative(),
  primaryProductName: z.string().nullable(),
  primaryOptionName: z.string().nullable(),
  lineItems: z.array(OrderListLineItemSchema),
});
export type OrderListItem = z.infer<typeof OrderListItemSchema>;

export const OrderListResponseSchema = z.object({
  items: z.array(OrderListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  deliveryCompanies: z.array(DeliveryCompanySchema),
});
export type OrderListResponse = z.infer<typeof OrderListResponseSchema>;

export const OrderStatsResponseSchema = z.object({
  stats: z.object({
    total: z.number().int().nonnegative(),
    accept: z.number().int().nonnegative(),
    instruct: z.number().int().nonnegative(),
    departure: z.number().int().nonnegative(),
    delivering: z.number().int().nonnegative(),
    finalDelivery: z.number().int().nonnegative(),
  }),
  today: z.object({
    orders: z.number().int().nonnegative(),
    revenue: z.number().int(),
  }),
  week: z.object({
    orders: z.number().int().nonnegative(),
    revenue: z.number().int(),
  }),
});
export type OrderStatsResponse = z.infer<typeof OrderStatsResponseSchema>;

export const OrderActionResponseSchema = z.object({
  message: z.string(),
  data: z.unknown().optional(),
});
export type OrderActionResponse = z.infer<typeof OrderActionResponseSchema>;

export const OrderPipelineResponseSchema = z.object({
  pipeline: z.record(OrderPipelineStatusSchema, z.array(OrderListItemSchema)),
  counts: z.record(OrderPipelineStatusSchema, z.number().int().nonnegative()),
});
export type OrderPipelineResponse = z.infer<typeof OrderPipelineResponseSchema>;
```

If `z.record(OrderPipelineStatusSchema, ...)` causes a Zod version issue, replace it with `z.record(z.string(), ...)` and keep the exported `OrderPipelineStatus` type for frontend keys. Do not weaken `OrderListItemSchema`.

- [ ] **Step 1.2: Re-export the new schemas and types**

Update both `packages/shared/src/schemas/index.ts` and `packages/shared/src/index.ts` order export blocks so these names are available from `@kiditem/shared` and `@kiditem/shared/schemas`:

```typescript
OrderStatusSchema,
OrderPipelineStatusSchema,
OrderListLineItemSchema,
DeliveryCompanySchema,
OrderListItemSchema,
OrderListResponseSchema,
OrderStatsResponseSchema,
OrderActionResponseSchema,
OrderPipelineResponseSchema,
```

and types:

```typescript
OrderStatus,
OrderPipelineStatus,
OrderListLineItem,
DeliveryCompany,
OrderListItem,
OrderListResponse,
OrderStatsResponse,
OrderActionResponse,
OrderPipelineResponse,
```

- [ ] **Step 1.3: Add shared schema tests**

Create `packages/shared/src/schemas/order.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  OrderActionResponseSchema,
  OrderListItemSchema,
  OrderListResponseSchema,
  OrderStatsResponseSchema,
  OrderStatusSchema,
} from './order.js';

const baseOrderListItem = {
  id: '00000000-0000-4000-8000-000000000001',
  platform: 'coupang',
  externalOrderId: '123456789',
  externalNumber: 'CO-100',
  displayOrderNumber: 'CO-100',
  shipmentBoxId: 123456789,
  status: 'ACCEPT',
  customerName: '홍길동',
  receiverName: '홍길동',
  receiverAddr: '서울시 중구',
  memo: null,
  orderedAt: '2026-04-25T00:00:00.000Z',
  shippedAt: null,
  deliveredAt: null,
  trackingNumber: null,
  shippingCompany: null,
  totalPrice: 35000,
  totalQuantity: 2,
  lineItemCount: 1,
  primaryProductName: '키즈 티셔츠',
  primaryOptionName: '120 / Blue',
  lineItems: [{
    id: '00000000-0000-4000-8000-000000000002',
    productName: '키즈 티셔츠',
    optionName: '120 / Blue',
    sku: 'SKU-001',
    quantity: 2,
    unitPrice: 17500,
    totalPrice: 35000,
    status: 'ACCEPT',
    externalLineId: '987654321',
  }],
};

describe('order response schemas', () => {
  it('parses an order list item with derived UI fields', () => {
    expect(OrderListItemSchema.parse(baseOrderListItem).totalQuantity).toBe(2);
  });

  it('parses list response with delivery companies', () => {
    const parsed = OrderListResponseSchema.parse({
      items: [baseOrderListItem],
      total: 1,
      deliveryCompanies: [{ code: 'CJGLS', name: 'CJ대한통운' }],
    });
    expect(parsed.items[0]?.displayOrderNumber).toBe('CO-100');
  });

  it('rejects invalid canonical status enum values', () => {
    expect(OrderStatusSchema.safeParse('READY_TO_SHIP').success).toBe(false);
  });

  it('parses stats and action responses', () => {
    expect(OrderStatsResponseSchema.parse({
      stats: { total: 1, accept: 1, instruct: 0, departure: 0, delivering: 0, finalDelivery: 0 },
      today: { orders: 1, revenue: 35000 },
      week: { orders: 1, revenue: 35000 },
    }).stats.accept).toBe(1);

    expect(OrderActionResponseSchema.parse({ message: '1건 승인 완료', data: { ok: true } }).message).toContain('승인');
  });
});
```

- [ ] **Step 1.4: Verify shared package**

Run:

```bash
npx vitest run packages/shared/src/schemas/order.spec.ts
(cd packages/shared && npm run build)
```

Expected: order schema test passes and shared build emits updated `dist` exports.

- [ ] **Step 1.5: Team-lead checkpoint shared schema work**

```bash
git diff -- packages/shared/src/schemas/order.ts packages/shared/src/schemas/index.ts packages/shared/src/index.ts packages/shared/src/schemas/order.spec.ts
```

Expected: schema/export/spec diff is isolated to shared order contracts. Do not run `git commit` from worker lanes; the team lead owns final commit grouping after verification.

---

### Task 2 — Map orders server responses through shared types

**Files:**
- Modify: `apps/server/src/orders/services/orders.service.ts`
- Modify: `apps/server/src/orders/dto/list-orders.dto.ts` only if bounded list params are added
- Modify: `apps/server/src/orders/controllers/orders.controller.ts` only if return annotations need adjustment
- Modify: `apps/server/src/orders/services/__tests__/order-flow.spec.ts`

- [ ] **Step 2.1: Import shared response types in `orders.service.ts`**

Add type imports:

```typescript
import { OrderStatusSchema } from '@kiditem/shared';
import type {
  OrderActionResponse,
  OrderListItem,
  OrderListResponse,
  OrderStatsResponse,
} from '@kiditem/shared';
```

Keep the Coupang adapter imports unchanged. Do not import any channel service.

- [ ] **Step 2.2: Add a private row mapper in `OrdersService`**

Inside `OrdersService`, add a private method that accepts the Prisma row shape returned by `findMany({ include: { lineItems: { where: { companyId } } } })`:

```typescript
private toListItem(order: {
  id: string;
  platform: string;
  externalOrderId: string;
  externalNumber: string | null;
  customerName: string;
  receiverName: string | null;
  receiverAddr: string | null;
  memo: string | null;
  status: string;
  orderedAt: Date;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  trackingNumber: string | null;
  shippingCompany: string | null;
  totalPrice: number;
  lineItems: Array<{
    id: string;
    productName: string;
    optionName: string | null;
    sku: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    status: string;
    externalLineId: string | null;
  }>;
}): OrderListItem {
  const primary = order.lineItems[0] ?? null;
  const totalQuantity = order.lineItems.reduce((sum, item) => sum + item.quantity, 0);
  const shipmentBoxId = /^\d+$/.test(order.externalOrderId) ? Number(order.externalOrderId) : null;
  const status = OrderStatusSchema.parse(order.status);

  return {
    id: order.id,
    platform: order.platform,
    externalOrderId: order.externalOrderId,
    externalNumber: order.externalNumber,
    displayOrderNumber: order.externalNumber ?? order.externalOrderId,
    shipmentBoxId,
    status,
    customerName: order.customerName,
    receiverName: order.receiverName,
    receiverAddr: order.receiverAddr,
    memo: order.memo,
    orderedAt: order.orderedAt,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
    trackingNumber: order.trackingNumber,
    shippingCompany: order.shippingCompany,
    totalPrice: order.totalPrice,
    totalQuantity,
    lineItemCount: order.lineItems.length,
    primaryProductName: primary?.productName ?? null,
    primaryOptionName: primary?.optionName ?? null,
    lineItems: order.lineItems.map((item) => ({
      id: item.id,
      productName: item.productName,
      optionName: item.optionName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      status: item.status,
      externalLineId: item.externalLineId,
    })),
  } satisfies OrderListItem;
}
```

Reviewer blocker note: do not assign raw Prisma `order.status: string` directly to `OrderListItem.status`. Narrow it with `OrderStatusSchema.parse(order.status)` before the `satisfies OrderListItem` return literal.

- [ ] **Step 2.3: Return `OrderListResponse` from `findAll()`**

Change `findAll()` signature to:

```typescript
async findAll(
  companyId: string,
  query: { from?: string; to?: string; status?: string; page?: string | number; limit?: string | number },
): Promise<OrderListResponse>
```

Keep the current status default of `ACCEPT`. If `page`/`limit` are added, use safe defaults (`page = 1`, `limit = 100`) and `skip/take`; otherwise keep the existing unpaginated behavior and return only `items`, `total`, and `deliveryCompanies`.

Use company-scoped line-item includes:

```typescript
include: {
  lineItems: {
    where: { companyId },
    orderBy: { createdAt: 'asc' },
  },
},
```

Apply the same `lineItems: { where: { companyId } }` include to `findOne(id, companyId)`. Graphify/ERD shows `OrderLineItem.companyId` is an IDOR denormalization, so workers must not leave plain `include: { lineItems: true }` in W3-owned order service reads.

Return:

```typescript
return {
  items: orders.map((order) => this.toListItem(order)),
  total,
  ...(pageAndLimitWereApplied ? { page, limit } : {}),
  deliveryCompanies: [...DELIVERY_COMPANIES],
} satisfies OrderListResponse;
```

If bounded list params are added, calculate `total` via `this.prisma.order.count({ where })` instead of `orders.length`.

- [ ] **Step 2.4: Return `OrderStatsResponse` from `getStats()`**

Change the return type to `Promise<OrderStatsResponse>` and close the return literal with:

```typescript
} satisfies OrderStatsResponse;
```

Keep all existing `companyId` filters in count and aggregate calls.

- [ ] **Step 2.5: Return `OrderActionResponse` from action methods**

Change signatures:

```typescript
async confirm(shipmentBoxIds: number[]): Promise<OrderActionResponse>
async uploadInvoice(...): Promise<OrderActionResponse>
```

Return literals must end with `satisfies OrderActionResponse`.

- [ ] **Step 2.6: Update `order-flow.spec.ts` for derived list item shape**

Modify `MOCK_ORDER` to include line items:

```typescript
const MOCK_ORDER = {
  id: '00000000-0000-4000-8000-000000000001',
  status: 'ACCEPT',
  orderedAt: new Date('2026-01-15T01:00:00.000Z'),
  shippedAt: null,
  deliveredAt: null,
  totalPrice: 35000,
  companyId: COMPANY_ID,
  platform: 'coupang',
  externalOrderId: '12345',
  externalNumber: 'CO-1',
  customerName: '홍길동',
  receiverName: '홍길동',
  receiverAddr: '서울시 중구',
  memo: null,
  trackingNumber: null,
  shippingCompany: null,
  lineItems: [{
    id: '00000000-0000-4000-8000-000000000002',
    productName: '키즈 티셔츠',
    optionName: '120 / Blue',
    sku: 'SKU-001',
    quantity: 2,
    unitPrice: 17500,
    totalPrice: 35000,
    status: 'ACCEPT',
    externalLineId: '98765',
  }],
};
```

Add assertions in the `findAll with status filter` test:

```typescript
expect(result.items[0]).toEqual(expect.objectContaining({
  displayOrderNumber: 'CO-1',
  shipmentBoxId: 12345,
  primaryProductName: '키즈 티셔츠',
  totalQuantity: 2,
  lineItemCount: 1,
}));
expect(result.items[0]?.lineItems[0]?.sku).toBe('SKU-001');
```

Add one Graphify/ERD-driven IDOR regression case: mock an order for `COMPANY_ID` with two related line items, one with `companyId: COMPANY_ID` and one with another company. Assert the Prisma `findMany` include uses `lineItems: { where: { companyId: COMPANY_ID } }`, and the mapped response only contains the in-company line item. This protects the `OrderLineItem.companyId` denormalization documented in `prisma/models/orders.prisma`.

- [ ] **Step 2.7: Verify server unit tests and type drift guard**

Run:

```bash
(cd apps/server && npx vitest run src/orders/services/__tests__/order-flow.spec.ts)
(cd apps/server && npx tsc --noEmit --pretty false)
```

Expected: order-flow tests pass; server TypeScript catches any mismatch between `OrdersService` response literals and shared order types.

- [ ] **Step 2.8: Team-lead checkpoint server mapping work**

```bash
git diff -- apps/server/src/orders/services/orders.service.ts apps/server/src/orders/dto/list-orders.dto.ts apps/server/src/orders/controllers/orders.controller.ts apps/server/src/orders/services/__tests__/order-flow.spec.ts
```

Expected: server diff is limited to the orders domain and narrows raw status strings before returning shared response types. Do not run `git commit` from worker lanes.

---

### Task 3 — Add typed orders pipeline utilities and hooks

**Files:**
- Modify: `apps/web/src/lib/query-keys.ts`
- Create: `apps/web/src/app/orders/lib/order-pipeline.ts`
- Create: `apps/web/src/app/orders/hooks/useOrdersPipeline.ts`
- Create: `apps/web/src/app/orders/hooks/useScheduledOrderSync.ts`
- Create: `apps/web/src/app/orders/hooks/useOrderActions.ts`
- Create: `apps/web/src/app/orders/__tests__/order-pipeline.spec.ts`

- [ ] **Step 3.1: Add stable query keys**

Update `apps/web/src/lib/query-keys.ts` orders block to keep existing keys and add missing stable keys:

```typescript
orders: {
  all: ['orders'] as const,
  pipeline: (params?: Record<string, string>) => [...queryKeys.orders.all, 'pipeline', params] as const,
  list: (params: Record<string, string>) => [...queryKeys.orders.all, 'list', params] as const,
  stats: () => [...queryKeys.orders.all, 'stats'] as const,
  scheduledSync: (dateHour: string) => [...queryKeys.orders.all, 'scheduledSync', dateHour] as const,
  action: (action: string) => [...queryKeys.orders.all, 'action', action] as const,
  search: (params: Record<string, string>) => [...queryKeys.orders.all, 'search', params] as const,
  compare: (params: Record<string, string>) => [...queryKeys.orders.all, 'compare', params] as const,
  sync: (params: Record<string, string>) => [...queryKeys.orders.all, 'sync', params] as const,
},
```

Do not remove keys used by other pages unless `rg "queryKeys.orders.<name>" apps/web/src` proves they are unused.

- [ ] **Step 3.2: Create `order-pipeline.ts`**

Create `apps/web/src/app/orders/lib/order-pipeline.ts`:

```typescript
import { CheckCircle, Clock, MapPin, Package, Truck, type LucideIcon } from 'lucide-react';
import type { OrderListItem, OrderListResponse, OrderPipelineStatus } from '@kiditem/shared';

export interface OrderPipelineNode {
  key: OrderPipelineStatus;
  label: string;
  sub: string;
  icon: LucideIcon;
  color: string;
}

export interface OrderPipelineEdge {
  from: number;
  to: number;
}

export const ORDER_ACTIVE_NODES: OrderPipelineNode[] = [
  { key: 'ACCEPT', label: '신규주문', sub: 'Order Received', icon: Clock, color: '#3b82f6' },
  { key: 'INSTRUCT', label: '발주확인', sub: 'Confirmed', icon: CheckCircle, color: '#8b5cf6' },
  { key: 'DEPARTURE', label: '출고완료', sub: 'Shipped', icon: Package, color: '#f59e0b' },
  { key: 'DELIVERING', label: '배송중', sub: 'In Transit', icon: Truck, color: '#10b981' },
];

export const ORDER_ALL_NODES: OrderPipelineNode[] = [
  ...ORDER_ACTIVE_NODES,
  { key: 'FINAL_DELIVERY', label: '배송완료', sub: 'Delivered', icon: MapPin, color: '#6b7280' },
];

export const ORDER_PIPELINE_EDGES: OrderPipelineEdge[] = [
  { from: 0, to: 1 },
  { from: 1, to: 2 },
  { from: 2, to: 3 },
];

export const SYNC_HOURS = [9, 12, 15, 18] as const;

export function buildPipelineFromResponses(
  responses: Array<{ status: OrderPipelineStatus; response: OrderListResponse }>,
): { pipeline: Record<OrderPipelineStatus, OrderListItem[]>; counts: Record<OrderPipelineStatus, number> } {
  const pipeline = Object.fromEntries(ORDER_ALL_NODES.map((node) => [node.key, []])) as Record<OrderPipelineStatus, OrderListItem[]>;
  const counts = Object.fromEntries(ORDER_ALL_NODES.map((node) => [node.key, 0])) as Record<OrderPipelineStatus, number>;

  for (const { status, response } of responses) {
    pipeline[status] = response.items;
    counts[status] = response.total;
  }

  return { pipeline, counts };
}

export function makeDateHourKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}`;
}

export function getCurrentSyncWindow(now: Date): { from: string; to: string; dateHour: string } | null {
  if (!SYNC_HOURS.includes(now.getHours() as (typeof SYNC_HOURS)[number])) return null;
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  return { from, to, dateHour: makeDateHourKey(now) };
}

export function getNumericShipmentBoxIds(orders: OrderListItem[]): { ids: number[]; skipped: OrderListItem[] } {
  const ids: number[] = [];
  const skipped: OrderListItem[] = [];
  for (const order of orders) {
    if (order.shipmentBoxId) ids.push(order.shipmentBoxId);
    else skipped.push(order);
  }
  return { ids, skipped };
}
```

- [ ] **Step 3.3: Create `useOrdersPipeline.ts`**

Create `apps/web/src/app/orders/hooks/useOrdersPipeline.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { OrderListResponseSchema, type OrderPipelineStatus } from '@kiditem/shared';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { buildPipelineFromResponses, ORDER_ALL_NODES } from '../lib/order-pipeline';

export function useOrdersPipeline(_showCompleted: boolean) {
  const statuses = ORDER_ALL_NODES.map((node) => node.key);
  const params = { statuses: statuses.join(',') };

  return useQuery({
    queryKey: queryKeys.orders.pipeline(params),
    queryFn: async () => {
      const responses = await Promise.all(statuses.map(async (status: OrderPipelineStatus) => {
        const response = await apiClient.getParsed(
          `/api/orders?status=${encodeURIComponent(status)}`,
          OrderListResponseSchema,
        );
        return { status, response };
      }));
      return buildPipelineFromResponses(responses);
    },
  });
}
```

- [ ] **Step 3.4: Create `useScheduledOrderSync.ts`**

Create `apps/web/src/app/orders/hooks/useScheduledOrderSync.ts`:

```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getCurrentSyncWindow, makeDateHourKey } from '../lib/order-pipeline';

const STORAGE_PREFIX = 'orders_last_sync_hour:';

const OrderSyncResultSchema = z.object({
  synced: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  details: z.array(z.string()).optional(),
});

export function useScheduledOrderSync() {
  const queryClient = useQueryClient();
  const nowKey = typeof window === 'undefined' ? 'server' : makeDateHourKey(new Date());

  return useQuery({
    queryKey: queryKeys.orders.scheduledSync(nowKey),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (typeof window === 'undefined') return { status: 'skipped' as const };
      const windowInfo = getCurrentSyncWindow(new Date());
      if (!windowInfo) return { status: 'skipped' as const };

      const storageKey = `${STORAGE_PREFIX}${windowInfo.dateHour}`;
      if (sessionStorage.getItem(storageKey) === 'success') return { status: 'already-synced' as const };

      try {
        const result = OrderSyncResultSchema.parse(await apiClient.post('/api/coupang-sync/orders', {
          from: windowInfo.from,
          to: windowInfo.to,
        }));
        sessionStorage.setItem(storageKey, 'success');
        await queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
        toast.success(`쿠팡 주문 동기화 완료: ${result.synced}건`);
        return { status: 'synced' as const, result };
      } catch (error) {
        toast.error('쿠팡 주문 동기화 실패');
        throw error;
      }
    },
  });
}
```

- [ ] **Step 3.5: Create `useOrderActions.ts`**

Create `apps/web/src/app/orders/hooks/useOrderActions.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { OrderActionResponseSchema, type OrderListItem } from '@kiditem/shared';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getNumericShipmentBoxIds } from '../lib/order-pipeline';

export function useOrderActions() {
  const queryClient = useQueryClient();

  const confirmMutation = useMutation({
    mutationKey: queryKeys.orders.action('confirm'),
    mutationFn: async (orders: OrderListItem[]) => {
      const { ids, skipped } = getNumericShipmentBoxIds(orders);
      if (ids.length === 0) {
        throw new Error('선택한 주문에 발주확인 가능한 shipmentBoxId가 없습니다.');
      }
      const response = OrderActionResponseSchema.parse(await apiClient.post('/api/orders', {
        action: 'confirm',
        shipmentBoxIds: ids,
      }));
      return { response, skippedCount: skipped.length };
    },
    onSuccess: async ({ response, skippedCount }) => {
      toast.success(skippedCount > 0 ? `${response.message} (${skippedCount}건 제외)` : response.message);
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '발주확인 실패');
    },
  });

  const invoiceMutation = useMutation({
    mutationKey: queryKeys.orders.action('invoice'),
    mutationFn: async ({ order, deliveryCompanyCode, invoiceNumber }: {
      order: OrderListItem;
      deliveryCompanyCode: string;
      invoiceNumber: string;
    }) => {
      if (!order.shipmentBoxId) throw new Error('선택한 주문에 shipmentBoxId가 없습니다.');
      return OrderActionResponseSchema.parse(await apiClient.post('/api/orders', {
        action: 'invoice',
        shipmentBoxId: order.shipmentBoxId,
        deliveryCompanyCode,
        invoiceNumber,
      }));
    },
    onSuccess: async (response) => {
      toast.success(response.message);
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '송장 전송 실패');
    },
  });

  return { confirmMutation, invoiceMutation };
}
```

- [ ] **Step 3.6: Add utility tests**

Create `apps/web/src/app/orders/__tests__/order-pipeline.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildPipelineFromResponses, getCurrentSyncWindow, getNumericShipmentBoxIds, makeDateHourKey } from '../lib/order-pipeline';
import type { OrderListItem } from '@kiditem/shared';

function order(overrides: Partial<OrderListItem> = {}): OrderListItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    platform: 'coupang',
    externalOrderId: '12345',
    externalNumber: null,
    displayOrderNumber: '12345',
    shipmentBoxId: 12345,
    status: 'ACCEPT',
    customerName: '홍길동',
    receiverName: '홍길동',
    receiverAddr: '서울시 중구',
    memo: null,
    orderedAt: '2026-04-25T00:00:00.000Z',
    shippedAt: null,
    deliveredAt: null,
    trackingNumber: null,
    shippingCompany: null,
    totalPrice: 10000,
    totalQuantity: 1,
    lineItemCount: 1,
    primaryProductName: '키즈 티셔츠',
    primaryOptionName: null,
    lineItems: [],
    ...overrides,
  };
}

describe('order pipeline helpers', () => {
  it('builds counts from typed order list responses', () => {
    const result = buildPipelineFromResponses([
      { status: 'ACCEPT', response: { items: [order()], total: 1, deliveryCompanies: [] } },
      { status: 'INSTRUCT', response: { items: [], total: 0, deliveryCompanies: [] } },
    ]);
    expect(result.counts.ACCEPT).toBe(1);
    expect(result.pipeline.ACCEPT[0]?.primaryProductName).toBe('키즈 티셔츠');
  });

  it('creates a stable local date-hour key', () => {
    expect(makeDateHourKey(new Date(2026, 3, 25, 9, 30))).toBe('2026-04-25T09');
  });

  it('returns a sync window only during configured sync hours', () => {
    expect(getCurrentSyncWindow(new Date(2026, 3, 25, 9, 10))).not.toBeNull();
    expect(getCurrentSyncWindow(new Date(2026, 3, 25, 10, 10))).toBeNull();
  });

  it('extracts only numeric shipment box ids', () => {
    const { ids, skipped } = getNumericShipmentBoxIds([
      order({ shipmentBoxId: 123 }),
      order({ id: '00000000-0000-4000-8000-000000000003', shipmentBoxId: null }),
    ]);
    expect(ids).toEqual([123]);
    expect(skipped).toHaveLength(1);
  });
});
```

- [ ] **Step 3.7: Verify web utility tests**

Run:

```bash
(cd apps/web && npx vitest run src/app/orders/__tests__/order-pipeline.spec.ts)
```

Expected: tests pass without rendering the page.

- [ ] **Step 3.8: Team-lead checkpoint hook and utility foundation**

```bash
git diff -- apps/web/src/lib/query-keys.ts apps/web/src/app/orders/lib/order-pipeline.ts apps/web/src/app/orders/hooks/useOrdersPipeline.ts apps/web/src/app/orders/hooks/useScheduledOrderSync.ts apps/web/src/app/orders/hooks/useOrderActions.ts apps/web/src/app/orders/__tests__/order-pipeline.spec.ts
```

Expected: hook diff is W3-owned and does not edit channel implementation files. Do not run `git commit` from worker lanes.

---

### Task 4 — Rewire `/orders` page and components to typed data

**Files:**
- Modify: `apps/web/src/app/orders/page.tsx`
- Modify: `apps/web/src/app/orders/components/OrderHeader.tsx`
- Modify: `apps/web/src/app/orders/components/PipelineVisualization.tsx`
- Modify: `apps/web/src/app/orders/components/OrderTable.tsx`

- [ ] **Step 4.1: Replace local data fetching in `page.tsx`**

Remove the local `OrderRow` interface, inline node constants, `SYNC_HOURS`, manual sync `useEffect`, and direct `apiClient` calls. Compose the hooks:

```typescript
const { data: pipelineData, isLoading: loading, error: queryError, dataUpdatedAt, refetch } = useOrdersPipeline(showCompleted);
const syncQuery = useScheduledOrderSync();
const { confirmMutation, invoiceMutation } = useOrderActions();
```

Use:

```typescript
const pipeline = pipelineData?.pipeline ?? buildPipelineFromResponses([]).pipeline;
const counts = pipelineData?.counts ?? buildPipelineFromResponses([]).counts;
const error = queryError ? '주문 조회 실패' : null;
const lastUpdated = dataUpdatedAt ? formatTime(dataUpdatedAt) : '';
```

If calling `buildPipelineFromResponses([])` twice is undesirable, export an `emptyOrderPipeline()` helper from `order-pipeline.ts` and use that.

- [ ] **Step 4.2: Wire selected order actions**

In `page.tsx`, derive selected order objects from the active pipeline:

```typescript
const selectedActiveOrders = activeOrders.filter((order) => selectedOrders[order.id]);
```

Implement:

```typescript
const handleConfirm = () => {
  if (selectedActiveOrders.length === 0) return;
  confirmMutation.mutate(selectedActiveOrders);
};

const handleInvoice = () => {
  if (selectedActiveOrders.length !== 1) {
    toast.info('송장 전송은 주문 1건씩 처리합니다.');
    return;
  }
  const deliveryCompanyCode = window.prompt('택배사 코드 (예: CJGLS)');
  if (!deliveryCompanyCode) return;
  const invoiceNumber = window.prompt('송장번호');
  if (!invoiceNumber) return;
  invoiceMutation.mutate({ order: selectedActiveOrders[0]!, deliveryCompanyCode, invoiceNumber });
};
```

Prompt/confirm is allowed by `apps/web/AGENTS.md`. Do not use `alert()`.

- [ ] **Step 4.3: Update `OrderHeader` props**

Add typed props for scheduled sync status:

```typescript
syncStatus: 'idle' | 'pending' | 'success' | 'error';
syncError: boolean;
```

Pass `syncStatus={syncQuery.fetchStatus === 'fetching' ? 'pending' : syncQuery.status}` and `syncError={syncQuery.isError}` or an equivalent typed mapping.

Render:

- “쿠팡 동기화 중...” while pending
- “자동 동기화: 9/12/15/18시” as today
- an error badge if `syncError` is true

Use `cn()` for conditional classes and semantic tokens for touched styles.

- [ ] **Step 4.4: Update `PipelineVisualization` types**

Import `OrderPipelineNode` and `OrderPipelineEdge` from `../lib/order-pipeline`. Keep the current SVG layout. For touched text/surface classes, prefer semantic tokens:

```typescript
<div className="table-card">
  <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)]">
```

SVG hard-coded node colors may remain because pipeline colors are data-driven status colors.

- [ ] **Step 4.5: Update `OrderTable` to consume `OrderListItem`**

Replace the local `OrderRow` interface with:

```typescript
import type { OrderListItem } from '@kiditem/shared';
```

Change props:

```typescript
activeOrders: OrderListItem[];
```

Field mapping:

- Product cell: `order.primaryProductName || '-'`
- Secondary product line: show `order.primaryOptionName` and `order.lineItemCount > 1 ? "+${order.lineItemCount - 1}" : null`
- Order number: `order.displayOrderNumber`
- Quantity: `order.totalQuantity`
- Address: `order.receiverAddr`
- Customer: `order.customerName || order.receiverName || '-'`

Replace direct date calls:

```typescript
{formatDate(order.orderedAt)}
<br />
<span className="text-[var(--text-tertiary)]">
  {formatTime(order.orderedAt, { hour: '2-digit', minute: '2-digit' })}
</span>
```

Import both `formatDate` and `formatTime` from `@/lib/utils`.

- [ ] **Step 4.6: Disable action buttons while mutations run**

Pass `confirming={confirmMutation.isPending}` and `invoicing={invoiceMutation.isPending}` to `OrderTable`, or derive a single `actionPending` prop. Disable buttons when pending or no selected rows. The confirm button should only be useful in `ACCEPT`; if the active node is not `ACCEPT`, disable and show a title explaining “신규주문 단계에서만 발주확인 가능”.

- [ ] **Step 4.7: Grep away legacy local row and direct formatting**

Run:

```bash
rg -n "interface OrderRow|apiClient\.get<|/api/coupang-sync\"|createdAtFrom|toLocale(Date|Time)String|API 연동 예정|placeholder action" apps/web/src/app/orders
```

Expected: no matches. If placeholder action comments appear under `orders`, remove or rewrite the comment as a concrete out-of-scope note.

- [ ] **Step 4.8: Team-lead checkpoint page/component rewire**

```bash
git diff -- apps/web/src/app/orders/page.tsx apps/web/src/app/orders/components/OrderHeader.tsx apps/web/src/app/orders/components/PipelineVisualization.tsx apps/web/src/app/orders/components/OrderTable.tsx
```

Expected: page/component diff removes local shadow order row types and direct `toLocale*` formatting from touched order files. Do not run `git commit` from worker lanes.

---

### Task 5 — Add orders page RTL coverage

**Files:**
- Create: `apps/web/src/app/orders/__tests__/orders-page.spec.tsx`
- Modify test setup only if existing test infrastructure requires a missing provider import; prefer using existing helpers from nearby tests.

- [ ] **Step 5.1: Inspect existing RTL provider pattern**

Run:

```bash
rg -n "QueryClientProvider|render\(" apps/web/src/app/**/__tests__ apps/web/src/hooks/__tests__ | head -40
```

Use the nearest existing React Query test wrapper pattern. Do not add a new global test framework.

- [ ] **Step 5.2: Create `orders-page.spec.tsx`**

Create a test file that mocks `apiClient` and renders `OrdersPage` inside a `QueryClientProvider`. The test should include these cases:

1. `GET /api/orders?status=ACCEPT` returns `OrderListResponseSchema`-compatible data and the table renders `primaryProductName`, `displayOrderNumber`, and `totalQuantity`.
2. Confirming a selected order posts to `/api/orders` with `{ action: 'confirm', shipmentBoxIds: [12345] }`.
3. Scheduled sync posts to `/api/coupang-sync/orders` with `{ from, to }` when current hour is one of `SYNC_HOURS` and does not use `/api/coupang-sync`.

Use fake timers or a fixed Date constructor spy for the scheduled sync case. Keep assertions focused on URL/body and visible data; avoid testing SVG internals.

- [ ] **Step 5.3: Use this response fixture in the test**

Use a fixture compatible with Task 1 schemas:

```typescript
const orderItem = {
  id: '00000000-0000-4000-8000-000000000001',
  platform: 'coupang',
  externalOrderId: '12345',
  externalNumber: 'CO-1',
  displayOrderNumber: 'CO-1',
  shipmentBoxId: 12345,
  status: 'ACCEPT',
  customerName: '홍길동',
  receiverName: '홍길동',
  receiverAddr: '서울시 중구',
  memo: null,
  orderedAt: '2026-04-25T00:00:00.000Z',
  shippedAt: null,
  deliveredAt: null,
  trackingNumber: null,
  shippingCompany: null,
  totalPrice: 35000,
  totalQuantity: 2,
  lineItemCount: 1,
  primaryProductName: '키즈 티셔츠',
  primaryOptionName: '120 / Blue',
  lineItems: [{
    id: '00000000-0000-4000-8000-000000000002',
    productName: '키즈 티셔츠',
    optionName: '120 / Blue',
    sku: 'SKU-001',
    quantity: 2,
    unitPrice: 17500,
    totalPrice: 35000,
    status: 'ACCEPT',
    externalLineId: '98765',
  }],
};
```

For statuses other than `ACCEPT`, return `{ items: [], total: 0, deliveryCompanies: [] }`.

- [ ] **Step 5.4: Verify RTL coverage**

Run:

```bash
(cd apps/web && npx vitest run src/app/orders/__tests__/order-pipeline.spec.ts src/app/orders/__tests__/orders-page.spec.tsx)
```

Expected: both orders web tests pass.

- [ ] **Step 5.5: Team-lead checkpoint tests**

```bash
git diff -- apps/web/src/app/orders/__tests__/orders-page.spec.tsx
```

Expected: RTL coverage diff is isolated to W3 order tests. Do not run `git commit` from worker lanes.

---

### Task 6 — Full verification, release note, and handoff

**Files:**
- Create: `docs/release-notes/2026-04-orders-ui-rewire.md`
- Modify: no application files unless verification exposes a W3-owned regression

- [ ] **Step 6.1: Run shared verification**

```bash
npx vitest run packages/shared/src/schemas/order.spec.ts
(cd packages/shared && npm run build)
```

Expected: shared order schema tests pass and `@kiditem/shared` dist exports include the new order response types.

- [ ] **Step 6.2: Run server orders verification**

```bash
(cd apps/server && npx vitest run src/orders/services/__tests__/order-flow.spec.ts)
(cd apps/server && npx tsc --noEmit --pretty false)
```

Expected: orders service tests pass; server TypeScript passes or fails only on a documented non-W3 lane blocker. If a failure is in `apps/server/src/orders/**` or caused by Task 1 shared exports, fix it in W3.

- [ ] **Step 6.3: Boot NestJS for DI verification**

Run:

```bash
npm run dev:server
```

Expected: Nest starts successfully and logs that the application started. Stop the process after boot evidence is captured. Because W3 changes server response imports and DTOs, do not skip this boot check.

- [ ] **Step 6.4: Run web orders tests and frontend build**

```bash
(cd apps/web && npx vitest run src/app/orders/__tests__/order-pipeline.spec.ts src/app/orders/__tests__/orders-page.spec.tsx)
npm run build --workspace=apps/web
```

Expected:

- Orders tests pass.
- No `apps/web/src/app/orders/**` TypeScript or build errors remain.
- No direct `toLocaleDateString()` / `toLocaleTimeString()` calls remain in touched orders files.
- If the web build fails on W2/W6/ad-ops/product files, document the first failing file and do not fix it in W3.

- [ ] **Step 6.5: Run W3 closure greps**

```bash
rg -n "interface OrderRow|apiClient\.get<|/api/coupang-sync\"|createdAtFrom|createdAtTo|API 연동 예정|toLocale(Date|Time)String|placeholder action" apps/web/src/app/orders apps/server/src/orders packages/shared/src/schemas/order.ts
rg -n "satisfies Order(ListItem|ListResponse|StatsResponse|ActionResponse)" apps/server/src/orders/services/orders.service.ts
```

Expected:

- First grep returns no matches.
- Second grep shows `satisfies` guards for list item/list response/stats/action response shapes.

- [ ] **Step 6.6: Create release note**

Create `docs/release-notes/2026-04-orders-ui-rewire.md` with these sections:

```markdown
# Orders UI Rewire — April 2026

## Summary
- `/orders` now parses shared order response schemas at the API boundary.
- The pipeline table displays fields derived from canonical `Order` + `OrderLineItem` data.
- Scheduled Coupang order sync now calls `POST /api/coupang-sync/orders` with `{ from, to }`.
- 발주확인 and minimal invoice actions call the existing `POST /api/orders` action endpoint.

## Domain boundary
- Owner domain: `orders`.
- No inventory, ad-ops, root action-task, or channel-dashboard implementation changed.

## DB impact
- No Prisma migration.
- No native enum added.

## Verification
- Shared order schema tests: include exact command/result.
- Server orders tests and `dev:server`: include exact command/result.
- Web orders tests and web build: include exact command/result or first non-W3 blocker.
```

Do not leave empty command/result bullets in the committed release note; fill them with actual execution results from Steps 6.1–6.4.

- [ ] **Step 6.7: Team-lead final commit grouping**

```bash
git status --short
```

Expected: team lead groups the verified W3 changes into coherent commits after all lanes finish. If verification required W3-owned fixes, include them in the final grouping; worker lanes must not create intermediate commits.

## Acceptance Criteria

- `packages/shared/src/schemas/order.ts` exports list, stats, action, and pipeline response schemas for the `/orders` page.
- `OrdersService.findAll()` maps `Order + lineItems` into `OrderListItem` and uses `satisfies OrderListItem` / `satisfies OrderListResponse`.
- `OrdersService.findAll()` and `findOne()` include line items with `where: { companyId }`; no W3-owned service read leaves plain `include: { lineItems: true }`.
- `OrdersService.getStats()`, `confirm()`, and `uploadInvoice()` use shared response types with `satisfies` guards.
- `/orders` web code has no local `OrderRow` shadow type and no `apiClient.get<T>` for order data.
- Scheduled sync calls `POST /api/coupang-sync/orders` with `{ from, to }` and runs through React Query `refetchInterval`, not `setInterval`.
- Confirm action calls `POST /api/orders` with numeric `shipmentBoxIds` derived from canonical `externalOrderId` / `shipmentBoxId` mapping.
- Invoice action calls the existing `POST /api/orders` invoice action for one selected row at a time.
- `OrderTable` uses `formatDate()` / `formatTime()` utilities and no direct `Intl.*` / `toLocale*` calls.
- Returns and CS server contracts are unchanged.
- `npm run dev:server` boots successfully after server changes.
- `npm run build --workspace=apps/web` has no W3-owned failures.

## Review Checklist

- [ ] `apps/web/src/app/orders/page.tsx` imports no `apiClient` directly.
- [ ] `apps/web/src/app/orders/page.tsx` has no manual scheduled-sync `useEffect`.
- [ ] `apps/web/src/app/orders/hooks/useScheduledOrderSync.ts` uses `/api/coupang-sync/orders`, not `/api/coupang-sync`.
- [ ] `apps/web/src/app/orders/components/OrderTable.tsx` renders `primaryProductName`, `displayOrderNumber`, and `totalQuantity`.
- [ ] `apps/web/src/app/orders/components/OrderTable.tsx` has no direct `toLocale*` date formatting.
- [ ] `apps/server/src/orders/services/orders.service.ts` has no direct return of raw Prisma `orders` from `findAll()`.
- [ ] `apps/server/src/orders/controllers/orders.controller.ts` still exposes a single `POST /api/orders` action endpoint; no `/confirm` route added.
- [ ] `apps/server/src/channels/**` was not modified by W3.
- [ ] `packages/shared` build was run after schema export changes.
- [ ] Release note states no DB migration and names any non-W3 build blocker exactly.

## Staffing Guidance for Later `$team` Execution

Recommended team size: **4 workers + 1 lead/verifier**. Keep workers inside the approved roster for the active team run; if only generic `executor` workers are available, assign these lanes explicitly in each inbox.

| Lane | Suggested role | Ownership | Reasoning level | Files |
|---|---|---|---|---|
| A | shared-contract executor | Shared order schemas | medium | `packages/shared/src/schemas/order.ts`, `packages/shared/src/schemas/index.ts`, `packages/shared/src/index.ts`, `packages/shared/src/schemas/order.spec.ts` |
| B | backend-orders executor | Orders service response mapping | high | `apps/server/src/orders/services/orders.service.ts`, `apps/server/src/orders/dto/list-orders.dto.ts`, `apps/server/src/orders/controllers/orders.controller.ts`, `apps/server/src/orders/services/__tests__/order-flow.spec.ts` |
| C | web-orders executor | Hooks/page/component rewire | high | `apps/web/src/app/orders/**`, `apps/web/src/lib/query-keys.ts` |
| D | verification executor | Tests, build, release note evidence | medium | `apps/web/src/app/orders/__tests__/**`, `docs/release-notes/2026-04-orders-ui-rewire.md`, verification logs |
| Lead | integrator/reviewer | Merge lane outputs, enforce domain boundary | high | Review all W3-scoped diffs; reject edits in W2/W6/ad-ops/inventory/root files |

Suggested launch hint after plan approval:

```bash
omx team 4:executor "Implement Plan W3 orders-ui from docs/superpowers/plans/2026-04-25-plan-w3-orders-ui.md. Preserve exclusive orders-domain scope; do not edit W2/W6/ad-ops/inventory/root files. Assign lanes A-D from the plan and report verification evidence before shutdown."
```

Verification path for the team lead:

1. Integrate Lane A first, run `npx vitest run packages/shared/src/schemas/order.spec.ts && (cd packages/shared && npm run build)`.
2. Integrate Lane B second, run `(cd apps/server && npx vitest run src/orders/services/__tests__/order-flow.spec.ts)` and `(cd apps/server && npx tsc --noEmit --pretty false)`.
3. Integrate Lane C third, run `(cd apps/web && npx vitest run src/app/orders/__tests__/order-pipeline.spec.ts src/app/orders/__tests__/orders-page.spec.tsx)`.
4. Run final gates: `npm run dev:server` and `npm run build --workspace=apps/web`.
5. Only after terminal verification, write the release note with actual command results.

## RALPLAN-DR Summary

- **Role:** W3 owns `orders-ui` planning only; implementation will be handled by later plan execution workers.
- **Assumptions:** W1 stabilizes product shared exports before W3 execution; W2 and W6 may edit their own plans/code in parallel, so W3 implementation must not touch their files.
- **Limit:** W3 fixes `/orders` typed-boundary/runtime gaps and minimal existing order actions. It does not build new inventory/shipping/returns/CS functionality.
- **Plan:** Add shared response schemas, map server orders responses with `satisfies`, create typed React Query hooks, rewire page/components, add tests, then verify shared/server/web.
- **Evidence:** Current file map shows legacy local row casts, broken `/api/coupang-sync` call, direct `toLocale*` formatting, and missing shared response schemas.
- **Next control gate:** Approve this plan, then run a scoped `$team` implementation with the staffing lanes above.

## ADR Section — W3 Orders UI Typed Boundary

### Decision

W3 will make `@kiditem/shared` order response schemas the typed boundary between `apps/server/src/orders` and `apps/web/src/app/orders`. The server maps canonical `Order` + `OrderLineItem` rows into an explicit `OrderListItem` view model; the frontend parses that response and builds the pipeline UI locally.

### Drivers

- The frontend currently assumes a legacy flat order shape that no longer matches the channel-agnostic schema from ADR-0015.
- The orders page has a concrete runtime bug: scheduled sync calls the wrong endpoint path and body shape.
- `packages/shared/AGENTS.md` requires `satisfies` guards for backend service methods returning shared types.
- `apps/web/AGENTS.md` requires React Query for server state and formatting utilities instead of direct locale calls.
- ADR-0019 allows same-domain cross-layer work but forbids mixing unrelated business domains.

### Alternatives considered

1. **Keep local frontend interfaces and only fix the sync URL.** Rejected because it leaves the flat-row mismatch, invisible product/quantity fields, and no drift detection.
2. **Return raw Prisma `Order` with `lineItems` and make the UI know Prisma shape.** Rejected because it leaks server persistence details and forces UI components to duplicate derivation logic.
3. **Add a dedicated `/api/orders/pipeline` endpoint.** Rejected for W3 because existing `GET /api/orders?status=` is sufficient and adding a new endpoint is not necessary for typed-boundary closure.
4. **Move scheduled sync into the orders server module.** Rejected because `channels` already owns Coupang API sync; W3 should consume the existing endpoint rather than cross-import channel services or duplicate adapter calls.
5. **Build full shipping/invoice workflow now.** Rejected because W3 is a typed UI rewire, not an inventory/picking/shipment project.

### Why chosen

The chosen approach is the smallest owner-local change that closes the actual stale boundary: shared schemas define the wire contract, orders service maps canonical rows once, and the frontend renders a stable view model. It also keeps channel sync as an external dependency and respects the project’s no-cross-domain session boundary.

### Consequences

- The orders list API response shape becomes intentionally UI-ready, not raw Prisma.
- Future order UI components can import `OrderListItem` instead of inventing local row shapes.
- Backend changes must keep shared schema exports built before web build.
- The `/orders` page will expose sync failures instead of silently swallowing endpoint mismatches.
- Minimal prompt-based invoice upload is acceptable as a bridge, but a richer shipment workflow remains separate.

### Follow-ups

- `W6 root-boundaries` owns root page typed-boundary debt outside `/orders`.
- `W5 ad-ops-rewire` owns ad-ops after product/inventory/order data contracts stabilize.
- A future shipping/picking plan may replace the prompt-based invoice bridge with a dedicated shipment UI.
- A future returns/CS UI plan may add typed shared response schemas for `OrderReturn` and `CSRecord`; W3 leaves current server returns/CS behavior unchanged.
