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
- Rocket PO catalog evidence and workbook workflow are not Orders-owned models.
  Channels owns the account-scoped catalog publication, while Supply owns the
  persisted workbook and its exact order-line links.

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
  persists the collection, reconciles rows against the active Supply-owned
  Rocket workbook, and exports only matching rows to the Sellpia workbook.
  The service returns a stable transmission key derived from workbook export
  and transport. An empty SHIPMENT or MILKRUN probe still persists no-match
  evidence and returns HTTP 204.

## Boundary Rules

- Order mutations stay on `POST /api/orders` with an action enum.
- Returns and CS require pagination.
- Date/time filters use ISO strings plus hour-boundary normalization.
- Single-resource reads/writes use `findFirst({ id, organizationId })`.
- `Order.status` is aggregate/UI status; `OrderLineItem.status` is line-level
  status. Keep them independent.
- New channels add `platform` values and channel adapters, not
  channel-specific order tables.
- Directship convert requires the active workbook identifiers supplied by the
  extension headers, persists deterministic order/import identities, and links
  exact PO/product rows through Supply reconciliation. The selected transport
  splits SHIPMENT vs MILKRUN output. No matching rows returns no workbook, but
  the probe remains durable evidence for safe workflow abandonment.
- `CreateCsBodyDto.productId` is only a backward-compatible alias for
  `listingId`; new callers send `listingId`.

## Transitional Exceptions

- Orders remains flat while current surfaces are channel-agnostic CRUD/actions.
  New provider APIs, Agent OS runtime, row-lock transactions, raw SQL
  reporting, or cross-domain mutations require a scoped port/adapter split.
