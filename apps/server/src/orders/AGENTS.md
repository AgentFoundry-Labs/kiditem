# orders — Orders, Returns, CS, Reviews, Return Transfers

Orders owns the channel-agnostic order spine and adjacent operational surfaces:
orders, returns, CS, reviews, and return transfers. Return transfers remain
record-only; stock movement stays with inventory.

## Architecture Mode

Mode: Transitional Flat.

Orders remains flat because current surfaces are channel-agnostic CRUD/actions
with provider work delegated to channels. Do not add new provider APIs, Agent OS
runtime, row-lock transactions, raw SQL reporting, or cross-domain mutations to
flat services. Those changes require moving the touched surface behind local
ports/adapters.

## Schema Contract

- `Order` is the aggregate root.
- `OrderLineItem` is the per-SKU line.
- `OrderReturn` and `OrderReturnLineItem` model returns/exchanges.
- Channel identity is `platform: string`; provider payloads live in
  `metadata Json`.
- New channels add `platform` values and channel adapters, not channel-specific
  order tables.

Keys:

- `Order`: unique `(organizationId, platform, externalOrderId)`.
- `OrderLineItem`: unique `(orderId, externalLineId)`.
- `OrderReturn`: unique `(organizationId, platform, externalReturnId)`.
- `OrderLineItem.optionId` is denormalized for SKU reads.

`Order.status` is aggregate/UI status. `OrderLineItem.status` is line-level
status. Keep them independent.

## Layout

```text
orders/
  controllers/          orders, returns, cs, reviews
  services/             orders, returns, cs, reviews
  dto/
  return-transfers/     controller, service, dto
  orders.module.ts
```

`ReturnTransfer` currently remains in the Inventory Prisma namespace, but the
HTTP/service owner is this module.

## Routes

| Route | Responsibility |
|---|---|
| `POST /api/orders` | action enum endpoint for confirm/invoice |
| `GET /api/orders` | date range + status list |
| `GET /api/orders/stats` | revenue/status summary |
| `GET /api/orders/:id` | order detail |
| `POST/GET /api/returns` | return lifecycle |
| `POST/GET /api/cs` | CS tickets with pagination |
| `GET /api/return-transfers` | transfer list |
| `POST /api/return-transfers` | record-only transfer create |
| `PATCH /api/return-transfers/:id` | transfer status/quantity update |

## Rules

- Order mutations stay on `POST /api/orders` with an action enum.
- Returns and CS require pagination.
- Date/time filters use ISO strings plus hour-boundary normalization.
- Coupang confirm/invoice/return actions delegate through the channels provider
  port/adapter. Do not call provider APIs directly from orders services.
- Single-resource reads/writes use `findFirst({ id, organizationId })`.
- `OrderLineItem` / `OrderReturnLineItem` organizationId denormalization exists
  for line-level IDOR checks.
- Return transfers are record-only and do not change stock.

## CS Compatibility Alias

`CreateCsBodyDto` accepts `listingId` as canonical and `productId` only as a
backward-compatible alias. If both are present, `listingId` wins. New callers
must send `listingId`; removing `productId` requires a caller grep and scoped
plan.

## Hard Bans

- Service-layer direct Coupang/provider HTTP calls.
- DTO-layer aggregation logic.
- New channel-specific order tables.
- `findUnique({ where: { id } })` for organization-owned rows.
- Mixing aggregate order status with line status.

## Change Map

| Change | Also update |
|---|---|
| order schema | `prisma/models/orders.prisma`, channel sync upsert, shared orders schema |
| status semantics | orders service and channel status normalizer |
| order action | action DTO, orders service handler, channel provider adapter |
| return workflow | returns service and channel provider return action |
| CS pagination | CS service and pagination helper |
| new platform | channel sync method and `platform` value |

## Verification

```bash
npm exec --workspace=apps/server -- vitest run src/orders
npm run build --workspace=apps/server
npm run dev:server
```
