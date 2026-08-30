# orders — Orders, Returns, And Reviews

`src/orders/` owns the channel-agnostic Order aggregate, returns, reviews,
record-only return transfers, Coupang directship collection conversion, and
durable Sellpia transmission intents. Channels owns provider sync and actions;
Inventory owns physical stock; Supply owns Rocket catalog/workbook evidence.

## Identity And State

- `Order` is the aggregate and `OrderLineItem` is the channel SKU line.
  Aggregate and line status remain independent.
- Provider identity is stored as platform plus metadata; new channels add
  adapters rather than channel-specific order tables.
- Return transfers are Orders-owned operations even though their current Prisma
  namespace is transitional; completion does not imply stock movement.
- Sellpia transmission intents and reconciliation audit fence duplicate browser
  submissions. They do not carry or finalize Inventory state.

The model authority is
[prisma/models/orders.prisma](../../../../prisma/models/orders.prisma), with
cross-cutting identities in
[prisma/models/core.prisma](../../../../prisma/models/core.prisma).
Action, collection, transmission, and reconciliation behavior is executable in
[the Orders tests](__tests__/).

## Provider And Collection Contract

- Provider actions delegate through Channels ports; Orders services do not call
  marketplace HTTP APIs.
- Prepare a stable transmission intent before irreversible Sellpia browser IO.
  Observed acceptance finalizes it, explicit confirmed non-submission aborts
  it, and privileged reconciliation is audited. Unknown outcomes remain
  reconcilable and do not trigger Inventory work.
- Directship conversion persists deterministic collection identities,
  reconciles exact rows with the active Supply-owned Rocket workbook, and
  exports every collected row for the selected transport. Unmatched rows remain
  selectable.
- Non-empty output carries the stable source-run/transport transmission key.
  An empty SHIPMENT or MILKRUN probe persists no-match evidence and returns no
  transmission key.
- Provider rejection is returned as the provider error rather than translated
  into an Inventory refresh or recovery action.

## Boundaries

- Order mutations keep the existing action-enum endpoint; returns and reviews
  remain paginated.
- Time filters use ISO values plus the established hour-boundary normalization.
- Creator authority handles normal transmission resolution; owner/admin is
  reserved for reconciliation.
- Flat channel-agnostic CRUD remains acceptable. New provider IO, Agent OS
  runtime, raw-SQL reporting, or cross-domain mutation requires a scoped
  port/adapter boundary.
