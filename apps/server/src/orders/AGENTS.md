# orders — Orders, Returns, CS, Reviews

`src/orders/` owns the channel-agnostic order spine and adjacent operational
surfaces: orders, returns, CS, reviews, and return transfers. Return transfers
are record-only; stock movement stays with inventory.

## Folder Map

```text
orders/
├── controllers/          # orders, returns, CS, reviews
├── services/             # flat channel-agnostic CRUD/action services
├── dto/
├── return-transfers/     # controller, service, dto
└── orders.module.ts
```

## Owned Surfaces

- Order actions/list/detail/stats under `/api/orders/*`
- Return lifecycle under `/api/returns/*`
- CS tickets under `/api/cs/*`
- Reviews under orders-adjacent routes
- Return transfer list/create/update under `/api/return-transfers/*`

## Main Data Models

- `Order` is the aggregate root.
- `OrderLineItem` is the per-SKU line.
- `OrderReturn` and `OrderReturnLineItem` model returns/exchanges.
- `platform` stores channel identity; provider payloads live in `metadata`.
- `ReturnTransfer` currently lives in the Inventory Prisma namespace, but this
  module owns its HTTP/service surface.

## Provider Action Flow

Provider-specific confirm, invoice, and return actions delegate through the
channels provider boundary. Orders services must not call Coupang or other
provider HTTP APIs directly.

## Cross-Domain Ports

- Channels writes orders/returns during marketplace sync.
- Orders delegates marketplace provider actions through channels-owned
  provider ports/adapters.
- Inventory owns actual stock movement; return transfers in orders are
  record-only.

## Boundary Rules

- Order mutations stay on `POST /api/orders` with an action enum.
- Returns and CS require pagination.
- Date/time filters use ISO strings plus hour-boundary normalization.
- Single-resource reads/writes use `findFirst({ id, organizationId })`.
- `Order.status` is aggregate/UI status; `OrderLineItem.status` is line-level
  status. Keep them independent.
- New channels add `platform` values and channel adapters, not
  channel-specific order tables.
- `CreateCsBodyDto.productId` is only a backward-compatible alias for
  `listingId`; new callers send `listingId`.

## Transitional Exceptions

- Orders remains flat while current surfaces are channel-agnostic CRUD/actions.
  New provider APIs, Agent OS runtime, row-lock transactions, raw SQL
  reporting, or cross-domain mutations require a scoped port/adapter split.
