Before working in this directory, always read this document first rather than relying on memory.

# web/order-collection — Marketplace Collection

This route collects marketplace evidence through the unified extension or
uploads, converts it through NestJS, and manages local generated-file
convenience history.

## Collection Contract

- All extension IO goes through the shared extension bridge and route adapter.
  The order screen and dashboard share
  `useAllMarketplaceOrderCollection`; do not create a count-only collector.
- Discovery distinguishes ready, incompatible, and absent states. Preserve
  versioned failure evidence; only explicit authenticated empty evidence is a
  successful zero.
- Backend conversion uses raw blob responses where appropriate. Server import,
  Order rows, and transmission intents are durable truth.
- Rocket PA collection carries the selected Rocket account, persists complete
  SHIPMENT/MILKRUN evidence, and exports every collected row for the selected
  transport. Workbook linkage is optional and unmatched rows stay visible.

## Submission Contract

- Prepare the stable source-run/transport intent before irreversible Sellpia
  upload. Preparation failure blocks extension IO.
- Observed accepted/pending evidence finalizes the intent. Explicit confirmed
  non-submission aborts it. Extension failure or tab loss leaves it prepared
  for tested reconciliation/retry; Sellpia remains the order-level duplicate
  authority.
- Local submission markers may recover an already-prepared intent without
  another upload. Privileged retry records audited non-submission before
  reopening the same key.
- Upload never prechecks stock, requests Inventory freshness, invalidates
  Inventory queries, or auto-resubmits. Provider rejection displays the
  provider message.
- File actions lock by file ID, and irreversible sends execute through one
  ordered queue.

Preserve the existing collection shell and flat mall-card grid. Enabled
extension-session malls remain collectable without stored credentials.
Transmission actions stay inside generated files; do not add an Inventory
freshness workspace.

Focused specs in this directory own exact layout order, capability schemas,
retry/reconciliation states, personal-data masking, and query invalidation.
