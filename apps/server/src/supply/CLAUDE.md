Before working in this directory, always read this document first rather than relying on memory.

# supply — Suppliers And Procurement

`src/supply/` owns private supplier identity, source-product supplier policy,
supplier-offer evidence, procurement test intents, purchase orders, and Rocket
workbook decisions. Sourcing owns discovery and handoff; Finance owns supplier
payments.

## Identity And State

- `SupplierProduct` links a Products-owned `MasterProduct` to supplier price
  and primary-supplier policy.
- Offer snapshots and price tiers are immutable commercial evidence.
  `ProcurementTestIntent` is a proposed RFQ/sample/test order, never a
  purchase order or provider submission.
- Purchase-order state is
  `draft -> pending -> ordered -> shipped -> received`; the pure policy in
  `domain/policy/purchase-order-status.ts` owns legal transitions. Delete is
  allowed only before ordering.
- Supply does not write `SupplierPayment`.
- Throw `Kiditem*Error` with a registered `SUPPLY_*` or common code (ADR-0023);
  a `SourcingProcurementPolicyError` leaves as `VALIDATION_FAILED` with its
  spelling in `details.reason`.

The complete data authority is
[prisma/models/supply.prisma](../../../../prisma/models/supply.prisma).
Submission, reconciliation, Rocket allocation, workbook, and handoff matrices
are executable in [the Supply tests](__tests__/).

## Procurement Contract

- Server-built evidence and request hashes freeze selected snapshots, tiers,
  conversion inputs, quantities, and computed totals.
- RFQ, sample, and test-order eligibility follows the tested evidence policy.
  Never silently raise a requested quantity to MOQ.
- Test intents are create-only in proposed state and have no provider runtime
  or direct PO conversion.
- Real ordering uses the submission port with an authenticated actor and
  caller-stable idempotency key; generic status updates cannot perform
  pending-to-ordered.
- Submission verifies the completed Sellpia attempt and revalidates its
  generation and fence inside the submission transaction; elapsed time is not
  an inventory rejection rule.
- Persist a prepared attempt before external checkout. Only its creator may
  call the provider. Observers reconcile unresolved outcomes rather than
  calling create again.
- Submission, reconciliation, and deletion share the purchase-order lock.
  Deletion cannot erase unresolved provider intent.

## Rocket Workbook Contract

- Preview reads the referenced account-scoped COMPLETE Rocket snapshot through
  Channels after Sellpia collection successfully publishes to Products. Each
  calculation carries the exact completed Products attempt ID; failed or
  cancelled collection cannot fall back to older stock. Rocket source publication
  and failure belong to Channels; preview only allocates and never reserves stock,
  writes a workbook, or calls a purchase provider.
- Allocate shared component stock once in stable ETA/PO/line order. Strict edits
  fail by default; explicit clamping applies in that same global order.
- Official export reruns canonical preview against that completed attempt, requires every line
  to have an active confirmed option recipe and reviewed quantity, and fences
  the artifact to the source snapshot, Products generation, and unchanged
  component identities.
- Only recipe-backed insufficient capacity may export with quantity zero and a
  controlled shortage reason. Mapping or configuration blockers cannot export.
- One advisory-locked workflow is active per organization. Idempotency returns
  the same stored bytes only for the same normalized request; re-download does
  not recalculate.
- Orders reconciliation links exact account, PO, product, and available barcode
  evidence. Matching classifies rows but does not filter collection output or
  mutate Orders/Products tables.
- Completion depends on linked Orders transmission intents, not a Products
  refresh. Abandonment uses the tested empty-probe policy and takes no reason.

Read
[sellpia-rocket-inventory-sync.md](../../../../docs/runbooks/sellpia-rocket-inventory-sync.md)
before changing the operator boundary.

## Ports And Boundaries

- Sourcing creates handoffs only through
  `SUPPLY_SOURCING_PROCUREMENT_PORT`; Channels and Products capabilities are
  consumed through their published ports.
- Application services use repository/transaction ports. Submission and
  workbook units of work are the documented locked transaction exceptions.
- Supply may read but never mutate Products current stock, and an exported
  workbook is operator evidence rather than proof of provider acceptance.
- Supplier-product currently has no write path; analytics reads it through a
  read-only join.
