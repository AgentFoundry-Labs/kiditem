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
- Directship capture is the operation kind `orders.coupang_directship`
  (account lock); its finalize only stores the capture as an
  `OrderCollectionArtifact` (`operationId`) and `result.rowCount` — completing
  a collection publishes nothing downstream. Conversion takes a succeeded
  operation's ID, persists deterministic collection identities
  (`Order.operationId`), reconciles exact rows with the active Supply-owned
  Rocket workbook, and exports every collected row for the selected transport.
  Unmatched rows remain selectable. The arrival-date calendar reads the
  account's latest succeeded capture (`GET …/coupang-directship/snapshot`,
  carrying its `operationId`); reading it starts no operation and nothing is
  stored for it.
- Non-empty output carries the stable operation/transport transmission key.
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
- Sellpia shipment tracking is the operation kind
  `orders.sellpia_shipment_tracking`, locked by `resource:sellpia:login` (one
  Sellpia login per organization, shared by every kind that reads through it).
  Its finalize keeps the tracking rows as one `OrderCollectionArtifact` keyed by
  `operationId`; the tracking screen downloads it by operation id. There is no
  tracking attempt route.
- Mall order collection is the operation kind `orders.mall_orders` for the
  first-batch malls (`MALL_ORDER_OPERATION_MALLS`: icecream-mall, kidkids,
  art09, domeggook), locked by `account:<channelAccountId>`. Finalize keeps the
  capture (the body the old convert route took) as `OrderCollectionArtifact`
  keyed by `operationId` and writes the converted order count to
  `result.rowCount`; a day with no orders succeeds with 0. Convert routes and
  `attempts/:id/convert` accept a body `operationId` for these malls and write
  nothing. The other malls stay on the attempt path until the remaining malls move (나머지 몰이 옮겨질 때까지).
- Today's order count is one Orders capability
  (`ORDER_COLLECTION_TODAY_ORDERS_PORT`): per mall the latest succeeded
  operation's `rowCount`, else the latest completed legacy run. The order
  screen and the dashboard both read it.
- Coupang shipment date summary is the operation kind
  `orders.coupang_shipment_summary` (organization lock). Its finalize keeps the
  old scan-proof validation and writes date rows with `operationId`; the
  calendar reads operation rows and untagged baseline rows only.
- Rocket PO is the operation kind `orders.coupang_rocket_po` (account lock).
  Its finalize keeps the old completion checks and publishes provider identity,
  Channels observed identities (`lastOperationId`) and the snapshot
  (`operationId`) in the finish transaction. Supply reads a published
  collection by `rocketPoOperationId` through `ROCKET_PO_CATALOG_PORT`.

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
