Before working in this directory, always read this document first rather than relying on memory.

# orders — Orders And Reviews

`src/orders/` owns the channel-agnostic Order aggregate, reviews,
record-only return transfers, Coupang directship collection conversion, and
the Sellpia transfer outcome capability. Channels owns marketplace identity;
Inventory owns physical stock; Supply owns Rocket catalog/workbook evidence.

## Identity And State

- `Order` is the aggregate and `OrderLineItem` is the channel SKU line.
  Aggregate and line status remain independent.
- Provider identity is stored as platform plus metadata; new channels add
  adapters rather than channel-specific order tables.
- Return transfers are Orders-owned operations even though their current Prisma
  namespace is transitional; completion does not imply stock movement.

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
- An empty SHIPMENT or MILKRUN probe persists no-match evidence and returns no
  file. The web keys a generated file by `{operationId}:{transport}`, the
  Sellpia transfer source.
- Provider rejection is returned as the provider error rather than translated
  into an Inventory refresh or recovery action.
- Coupang reviews are the operation kind `orders.coupang_reviews`
  ([ADR-0025](../../../../docs/adr/0025-operations-are-one-contract.md)); there
  is no review attempt route. Its finalize writes one operation row per review
  only after every planned month window's `review_windows` marker matches its
  `reviews` chunk count; readers show only operation rows (KID-365).
- Sellpia shipment tracking is the operation kind
  `orders.sellpia_shipment_tracking`, locked by `resource:sellpia:login` (one
  Sellpia login per organization, shared by every kind that reads through it).
  Its finalize keeps the tracking rows as one `OrderCollectionArtifact` keyed by
  `operationId`; the tracking screen downloads it by operation id. There is no
  tracking attempt route.
- Mall order collection is the operation kind `orders.mall_orders` for the
  malls in `MALL_ORDER_OPERATION_MALLS`, locked by
  `account:<channelAccountId>`. A mall that downloads a file uploads it as
  ordered base64 parts; finalize joins them. Finalize keeps the
  capture (the body the old convert route took) as `OrderCollectionArtifact`
  keyed by `operationId` and writes the converted order count to
  `result.rowCount`; a day with no orders succeeds with 0. Convert routes and
  `attempts/:id/convert` take only a body `operationId` and write nothing;
  there is no attempt-header conversion.
- Only Kakao (`MALL_ORDER_ATTEMPT_MALLS`, KID-379) stays on the old attempt
  path: begin, read, control, `sources`, fail (raw source artifact plus the
  mall failure alert), and cancel. It never completes — Kakao has no Sellpia
  conversion — so there is no complete, replay, or source download. Code kept
  for it is marked `KID-379`; remove it when Kakao moves to the kind.
- A manual excel upload (`POST …/malls/:mallKey/upload`, the malls in
  `MALL_ORDERS_MANUAL_UPLOAD_MALLS`) is the same kind with
  `collectionMode: 'manual-upload'`: the server begins, chunks the file and
  finishes in one request (the Rocket matching CSV shape). An encrypted
  workbook is decrypted before begin, so the stored capture converts without
  the password; the password is never stored.
- Today's order count is one Orders capability
  (`ORDER_COLLECTION_TODAY_ORDERS_PORT`): per mall the latest succeeded
  operation's `rowCount`; legacy attempt runs are not counted. The order
  screen and the dashboard both read it.
- Order facts are orders an operation converted (`Order.operationId`), observed
  at that operation's finish; a window's coverage is the succeeded
  `orders.mall_orders` operations' `result.coverage`. Orders and coverage only
  an old import run carries are not facts (KID-365).
  적용 범위는 몰 주문 수집 실행이 선언한 창만이다. 사실을 낸 원천마다 적용
  범위를 요구하던 규칙은 KID-365에서 폐기.
- Coupang shipment date summary is the operation kind
  `orders.coupang_shipment_summary` (organization lock). Its finalize keeps the
  old scan-proof validation and writes date rows with `operationId`; the
  calendar reads operation rows and untagged baseline rows only.
- Rocket PO is the operation kind `orders.coupang_rocket_po` (account lock).
  Its finalize keeps the old completion checks and publishes provider identity,
  Channels observed identities (`lastOperationId`) and the snapshot
  (`operationId`) in the finish transaction. Supply reads a published
  collection by `rocketPoOperationId` through `ROCKET_PO_CATALOG_PORT`.
- The old worker's Sellpia and mall actions are operation kinds
  (`@kiditem/shared/orders-action-operations`, KID-355). Writes: Sellpia order
  transfer, post-transfer and auto invoice (`resource:sellpia:login`) and mall
  tracking upload (`account:<channelAccountId>`). Reads: Sellpia order
  snapshot (`resource:sellpia:login`) and Coupang shipment list
  (`resource:coupang-supplier:login`). Results live only in the operation
  `result`.
- The transfer file is never uploaded: plan regenerates it from the succeeded
  source operation (`orders.mall_orders`, or `orders.coupang_directship` with
  its consumed `transport`) and freezes the file's order numbers;
  `GET …/action-operations/:id/source` regenerates it again and refuses when
  the numbers differ from the plan. A succeeded transfer of the same source
  (and `transport`) refuses a new one with `ORDERS_TRANSFER_ALREADY_SENT`
  unless the scope says `resend: true` (plan `resendOf`); a closed transfer
  does not block.
- Auto-invoice targets are the accepted numbers of transfers that succeeded in
  the last 24 hours minus the numbers a succeeded invoice that finished after
  that transfer issued (numbers restart per file); a number the grid did not
  show stays a target within those 24 hours.
  A `reconciling` transfer is not a source until confirmed. No targets refuses
  the start; an issued row outside the plan fails the finish.
- Transfer, auto invoice and tracking upload may finish `reconciling`. The
  operator closes them with `POST …/action-operations/:id/confirm {result?}` or
  `/close {reason?}`; a closed transfer is `SELLPIA_TRANSFER_NOT_SUBMITTED`
  (resend allowed), the others `ORDERS_ACTION_CLOSED_BY_OPERATOR`.
- Other owners ask whether a source file reached Sellpia only through
  `SELLPIA_TRANSFER_OUTCOME_PORT` (`sellpia-transfer-outcome.module.ts`): per
  `{sourceOperationId, transport}` the latest transfer's status (`none`,
  `in_progress`, `reconciling`, `succeeded`, `failed`), read through
  `readOperationsByPlan` in the caller's transaction (KID-388).

## Boundaries

- Order mutations keep the existing action-enum endpoint; reviews remain
  paginated.
- Time filters use ISO values plus the established hour-boundary normalization.
- Keep the hexagonal layout: HTTP in `adapter/in/web/`, services in
  `application/service/`, ledger helpers in `adapter/out/persistence/read/`,
  pure mappers in `domain/`. Coupang shipments add a `shipments/` folder per
  layer. `coupang-directship/` stays at the root because `nest-cli.json` and
  the Dockerfile bind its Python and template assets to that path. Verify with
  `npm run check:hexagonal`.
- Flat channel-agnostic CRUD remains acceptable. New provider IO, Agent OS
  runtime, raw-SQL reporting, or cross-domain mutation requires a scoped
  port/adapter boundary.
