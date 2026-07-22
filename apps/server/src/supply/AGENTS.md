Consult this document first instead of relying on memorized knowledge.

# supply — Suppliers + Procurement

`src/supply/` owns supplier registry, Sellpia physical-SKU supplier policy
(`SupplierProduct`), and purchase-order procurement. Suppliers are
organization-private. Sourcing and supply are separate because sourcing buyer
work and vendor-manager/procurement work mutate different surfaces.

## Folder Map

```text
supply/
├── supply.module.ts
├── adapter/in/http/         # suppliers and procurement controllers + DTOs
├── adapter/out/repository/  # Prisma-backed supplier/procurement repositories
├── adapter/out/transaction/ # one locked freshness + purchase submission unit of work
├── application/port/out/    # outgoing repository contracts
├── application/service/     # supplier and procurement services
├── domain/policy/           # purchase-order status state machine
└── __tests__/
```

## Owned Surfaces

- Supplier CRUD: `/api/suppliers/*`
- Purchase orders: `/api/purchase-orders/*`

Route shape is frozen.

## Main Data Models

- `Supplier` is organization-private supplier identity.
- `SupplierProduct` links a `SellpiaInventorySku` to supplier price, MOQ, and
  primary-supplier policy.
- `PurchaseOrder` is procurement state.
- `SupplierPayment` is finance-owned and must not be written from supply.

## Procurement Rules

- Supplier writes use `organizationId` from `@CurrentOrganization()`.
- Purchase-order transitions use
  `domain/policy/purchase-order-status.ts`.
- Status order is `draft -> pending -> ordered -> shipped -> received`.
- Delete is allowed only from `draft` or `pending`.
- `/api/purchase-orders` keeps the single POST action body
  (`create | updateStatus | delete | submit | reconcileSubmission |
  previewRocket | confirmRocket | releaseRocketConfirmation |
  listRocketCommitments | settleRocketFinalOrderCommitments |
  releaseRocketFinalOrderCommitments`).
- `pending -> ordered` is forbidden through generic `updateStatus`; every real
  purchase uses `PurchaseOrderSubmissionPort` with an authenticated actor and
  caller-stable idempotency key.
- External checkout writes a durable `prepared` attempt before provider IO.
  Only the transaction creator may call the provider; every observer of an
  unresolved attempt must reconcile and must not call the provider again.
- Normalize the caller idempotency key and validate the active actor inside the
  locked submission lane before a draft can mutate to `pending`.
- A fresh `prepared` attempt is in flight and cannot be reconciled. Only
  `provider_unknown` or `provider_failed` may be reconciled.
- Purchase-order deletion uses the same row lock as submission and rejects any
  unresolved provider attempt so cascade deletion cannot erase its intent.
- Prepared attempts older than 15 database minutes become `provider_unknown`.
  Providerless ordering, attempt creation, terminal recording, and
  reconciliation stay organization-scoped and row-locked.
- Repository adapters own Prisma details and `SellpiaInventorySku` ownership
  checks; application services depend on `application/port/out/*` contracts
  only.
- `previewRocket` publishes complete Rocket PO catalog evidence through the
  Channels-owned port. That publication applies only freshly evaluated safe
  deterministic recipes for the published Rocket options, then Supply resolves
  confirmed component recipes through
  `CHANNEL_SKU_AVAILABILITY_PORT`, and applies the Inventory freshness gate
  before calculating quantities.
- Rocket allocation replaces any earlier projected stock with Inventory's
  same-generation gated capacity snapshot before calculation. A refresh cannot
  bless quantities copied from an older generation.
- Rocket preview allocation is a pure in-memory policy over Inventory-owned
  `availableStock`, which already subtracts every active common commitment. It may return
  mapping, inactive-component, insufficient-capacity, or collection/account
  blocking reasons, but the preview itself never commits, writes a workbook,
  mutates physical stock, or calls a purchase provider.
- Edited quantities are bounded before every result, including collection,
  vendor, mapping, inactive-component, and zero-capacity rows. The pure domain
  policy throws only framework-neutral outcomes; the application service owns
  HTTP exception translation.
- Preview edits are strict by default. The explicit `clampEditedQuantities`
  request mode jointly clamps retained edits in the same stable ETA/PO/line
  allocation order, so rows sharing a component cannot each retain an
  independently valid but collectively impossible quantity.
- `confirmRocket` reruns the canonical preview from the submitted collection,
  requires a confirmed active `ChannelListingOption -> ProductVariant ->
  ProductVariantComponent` recipe for every official line (including a
  zero-quantity line), and requires an explicit reviewed quantity for every
  line. Mapping, configuration, and recipe-review blockers cannot be
  confirmed; only a recipe-backed insufficient-capacity row may continue with
  a controlled shortage reason.
- Rocket confirmation uses one organization advisory lock, the current
  Inventory generation, the completed Rocket source artifact, and unchanged
  `ChannelListingOption -> ProductVariant -> ProductVariantComponent` identity
  before persisting an active capacity allocation.
- A caller-stable UUID idempotency key returns the same confirmation only for
  the same normalized request. Reusing it with different input is a conflict.
- Inventory-owned active commitments reduce later previews and confirmations.
  Supply keeps confirmation line/allocation rows as immutable audit evidence,
  but does not aggregate them as a second capacity ledger. A provisional
  request may be released after cancellation. PA collection replaces it with
  one final-order commitment; that final commitment is settled only after a
  newer Sellpia snapshot proves the physical movement, or released with an
  explicit reason when the order is cancelled. None of these operations writes
  `SellpiaInventorySku.currentStock` or calls Coupang.
- Coupang PA order collection calls the exported
  `ROCKET_FINAL_ORDER_RECONCILIATION_PORT` with its caller-owned transaction.
  Supply resolves exactly one active confirmation line by account, PO number,
  and product number, verifies barcode evidence when both sides provide it,
  and asks Inventory to replace the request commitment with the final-order
  commitment. Supply does not write Orders tables.
- Commitment list actions page Supply confirmation lines first and then use
  one Inventory bulk read for their request/final lineage and availability.
  Never issue an Inventory query per line.

## Cross-Domain Ports

- Future writers for `SupplierProduct` must use a supply-owned port such
  as `SUPPLY_ATTACH_PORT`.
- Finance owns supplier-payment writes. Supply may read payment data for
  back-references when needed.
- Sourcing must not reintroduce supplier/procurement code or direct supply
  model mutations.

## Boundary Rules

- Supplier and purchase-order single-resource access is repository-scoped by
  `{ id, organizationId }`.
- Raw SQL uses Prisma tagged templates only.
- Purchase-order submission and Rocket confirmation transaction adapters are
  the Supply exceptions to repository-only Prisma access. Rocket confirmation
  delegates generation fencing, capacity checks, and logical reserve/release
  to `InventoryCommitmentPort` in the same Prisma transaction; it must not
  derive Inventory policy, mutate Inventory state/current stock, or expose
  those tables through a Supply repository.
- Do not write `SupplierPayment`.
- Rocket confirmation is an internal capacity commitment and workbook input,
  not a purchase-provider submission or proof that Coupang accepted anything.
- Do not reintroduce supplier/procurement controllers, services, DTOs, or
  supply model mutations under `src/sourcing/`.

## Current Non-Goals

- `SupplierProduct` currently has no write path; analytics reads it via a
  read-only join.
