Before working in this directory, always read this document first rather than relying on memory.

# orders — Orders And Reviews

`src/orders/` owns the channel-agnostic Order aggregate, reviews,
record-only return transfers, Coupang directship collection conversion, and
durable Sellpia transmission intents. Channels owns marketplace identity;
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

- Coupang confirmation, invoice, and return actions are explicitly unsupported
  until a browser/source-owner replacement exists. Orders services do not call
  marketplace HTTP APIs; collection and Sellpia transmission use their owner
  paths.
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
- Coupang reviews are the operation kind `orders.coupang_reviews`
  ([ADR-0025](../../../../docs/adr/0025-operations-are-one-contract.md)); there
  is no review attempt route. Its finalize writes one operation row per review
  only after every planned month window's `review_windows` marker matches its
  `reviews` chunk count, and the reader prefers operation rows over legacy
  SourceImportRun rows.
- Coupang shipment date summary is the operation kind
  `orders.coupang_shipment_summary` (organization lock). Its finalize keeps the
  old scan-proof validation and writes date rows with `operationId`; the
  calendar reads operation rows and untagged baseline rows only.

## Boundaries

- Order mutations keep the existing action-enum endpoint; reviews remain
  paginated.
- Time filters use ISO values plus the established hour-boundary normalization.
- Creator authority handles normal transmission resolution; owner/admin is
  reserved for reconciliation.
- Keep the hexagonal layout: HTTP in `adapter/in/web/`, services in
  `application/service/`, ledger helpers in `adapter/out/persistence/read/`,
  pure mappers in `domain/`. Coupang shipments add a `shipments/` folder per
  layer. `coupang-directship/` stays at the root because `nest-cli.json` and
  the Dockerfile bind its Python and template assets to that path. Verify with
  `npm run check:hexagonal`.
- Flat channel-agnostic CRUD remains acceptable. New provider IO, Agent OS
  runtime, raw-SQL reporting, or cross-domain mutation requires a scoped
  port/adapter boundary.
