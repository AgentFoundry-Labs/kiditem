Consult this document first instead of relying on memorized knowledge.

# orders — Orders, Returns, CS, Reviews

`src/orders/` owns the channel-agnostic order spine and adjacent operational
surfaces: orders, returns, CS, reviews, and return transfers. Return transfers
are record-only; stock movement stays with inventory.

## Owned Surfaces

- Order actions/list/detail/stats under `/api/orders/*`
- Return lifecycle under `/api/returns/*`
- CS tickets under `/api/cs/*`
- Reviews under orders-adjacent routes
- Return transfer list/create/update under `/api/return-transfers/*`
- Coupang Rocket PA collection and Sellpia workbook conversion at
  `/api/orders/collection/coupang-directship/convert`

## Main Data Models

- `Order` is the aggregate root.
- `OrderLineItem` is the per-SKU line.
- `OrderReturn` and `OrderReturnLineItem` model returns/exchanges.
- `platform` stores channel identity; provider payloads live in `metadata`.
- `ReturnTransfer` currently lives in the Inventory Prisma namespace, but this
  module owns its HTTP/service surface.
- `RocketPoReservation` lives in the `channels` Prisma namespace but is
  owned by this module: it is the orders-owned reservation ledger behind the
  preserved `/rocket-orders` confirmation panel (user original, commit
  `03123c2f`), written only by `RocketPoConfirmService.commitReservations` and
  read only for barcode availability. It sits on top of the single Sellpia
  stock owner and never mutates physical stock. It is intentionally distinct
  from Supply's `RocketPurchaseConfirmation` + Inventory `InventoryCommitment`
  canonical ledger; the preserved orders route does not use that path.

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
- Coupang directship conversion (`/api/orders/collection/coupang-directship/convert`)
  is stateless workbook generation (user original design): the collected
  directship purchase-order rows in the request are exported straight to the
  Sellpia workbook. It does not persist orders/import runs and does not gate on
  Supply reconciliation — collected rows are exported regardless of Supply
  confirmation state. Supply's `RocketFinalOrderReconciliationPort` remains in
  the module but is not on this convert path.

## Boundary Rules

- Order mutations stay on `POST /api/orders` with an action enum.
- Returns and CS require pagination.
- Date/time filters use ISO strings plus hour-boundary normalization.
- Single-resource reads/writes use `findFirst({ id, organizationId })`.
- `Order.status` is aggregate/UI status; `OrderLineItem.status` is line-level
  status. Keep them independent.
- New channels add `platform` values and channel adapters, not
  channel-specific order tables.
- Directship convert exports the collected rows as-is: no import-run
  persistence, deterministic order identity, or reconciliation gate on this
  path. The selected transport only splits shipment vs milkrun output; an empty
  request is the only reason no workbook is produced.
- `CreateCsBodyDto.productId` is only a backward-compatible alias for
  `listingId`; new callers send `listingId`.

## Transitional Exceptions

- Orders remains flat while current surfaces are channel-agnostic CRUD/actions.
  New provider APIs, Agent OS runtime, row-lock transactions, raw SQL
  reporting, or cross-domain mutations require a scoped port/adapter split.
