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
- Durable Sellpia workbook submission intents under
  `/api/orders/sellpia-transmissions/intents/*`

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
- `SellpiaOrderTransmissionIntent` and its reconciliation audit are
  Orders-owned duplicate-submission fences. They do not carry current Inventory
  state; the legacy nullable `finalizedGeneration` column is not written by new
  transmissions.

## Provider Action Flow

Provider-specific confirm, invoice, and return actions delegate through the
channels provider boundary. Orders services must not call Coupang or other
provider HTTP APIs directly.

Sellpia workbook submission prepares a stable intent before the irreversible
browser action. Provider acceptance finalizes it, explicit confirmed
non-submission aborts it, and owner/admin reconciliation is audited. Neither
prepare nor finalize checks stock or freshness, and no outcome requests an
Inventory refresh. A provider rejection is returned to the operator as the
Sellpia error rather than translated into an Inventory action.

## Cross-Domain Ports

- Channels writes orders/returns during marketplace sync.
- Orders delegates marketplace provider actions through channels-owned
  provider ports/adapters.
- Inventory owns actual stock movement; return transfers in orders are
  record-only.
- Coupang directship conversion (`/api/orders/collection/coupang-directship/convert`)
  persists the collection, reconciles rows against the active Supply-owned
  Rocket workbook, and exports every collected row for the selected transport
  to the Sellpia workbook. Exact matches receive workbook linkage; unmatched
  rows remain in the operator-selectable file. The service returns a stable
  transmission key derived from source import run and transport. An empty
  SHIPMENT or MILKRUN probe still persists no-match evidence and returns HTTP
  204 without a transmission key.

## Boundary Rules

- Order mutations stay on `POST /api/orders` with an action enum.
- Returns and CS require pagination.
- Date/time filters use ISO strings plus hour-boundary normalization.
- Single-resource reads/writes use `findFirst({ id, organizationId })`.
- `Order.status` is aggregate/UI status; `OrderLineItem.status` is line-level
  status. Keep them independent.
- New channels add `platform` values and channel adapters, not
  channel-specific order tables.
- Directship convert requires the selected Rocket channel account, persists
  deterministic order/import identities, and links exact PO/product rows
  through Supply reconciliation when a workbook matches. The selected transport
  splits SHIPMENT vs MILKRUN output. Non-empty unmatched-only collection still
  returns a Sellpia workbook; a transport with no collected rows returns 204 and
  remains durable evidence for safe workflow abandonment.
- `CreateCsBodyDto.productId` is only a backward-compatible alias for
  `listingId`; new callers send `listingId`.
- Sellpia transmission persistence is scoped by `{ organizationId, intentKey }`
  and protected by an advisory transaction lock. Normal resolution is limited
  to the creator; owner/admin authority is reserved for reconciliation.

## Transitional Exceptions

- Orders remains flat for channel-agnostic CRUD/actions. The Sellpia
  transmission fence is the scoped port/adapter exception required by its
  row-lock transaction. New provider APIs, Agent OS runtime, raw SQL reporting,
  or cross-domain mutations require the same scoped boundary review.
