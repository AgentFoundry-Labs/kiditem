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
- Supplier-offer evidence: owner/admin POST + GET under
  `/api/supplier-offer-snapshots/*`
- Procurement test intents: read-only GET under
  `/api/procurement-test-intents/*`; intent creation is an internal incoming-port
  capability, not an HTTP mutation route.

Route shape is frozen.

## Main Data Models

- `Supplier` is organization-private supplier identity.
- `SupplierProduct` links a `SellpiaInventorySku` to supplier price, MOQ, and
  primary-supplier policy.
- `SupplierOfferSkuSnapshot` and nested `SupplierOfferPriceTier` freeze observed
  pre-inventory supplier identity and commercial terms.
- `ProcurementTestIntent` is a proposed RFQ, sample, or test-order handoff. It is
  not a purchase order and never submits to a supplier/provider.
- `PurchaseOrder` is procurement state.
- `SupplierPayment` is finance-owned and must not be written from supply.

## Procurement Rules

- Supplier writes use `organizationId` from `@CurrentOrganization()`.
- Supplier-offer snapshot hashes are server-built and organization-idempotent.
  Test-intent request hashes freeze the selected snapshot, tier, quantities,
  conversions, and server-computed CNY total.
- RFQs may use offer-only evidence without quantity or price. Samples require
  exact-variant identity and positive quantity. Test orders additionally require
  a matching launch candidate, selected tier, known MOQ, and quantity at or above
  MOQ; requested quantity is rejected rather than silently raised.
- Procurement test intents are create-only in `proposed` state. No review,
  purchase-order conversion, provider runtime, or status-transition API is owned
  by this pre-purchase intent surface.
- Purchase-order transitions use
  `domain/policy/purchase-order-status.ts`.
- Status order is `draft -> pending -> ordered -> shipped -> received`.
- Delete is allowed only from `draft` or `pending`.
- `/api/purchase-orders` keeps the single POST action body
  (`create | updateStatus | delete | submit | reconcileSubmission |
  previewRocket | exportRocketWorkbook | getActiveRocketWorkbook |
  downloadRocketWorkbook | abandonRocketWorkbook | listSavedRocketPos |
  loadSavedRocketCollection`).
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
  Channels-owned port before reading inventory, so inventory state never
  discards a completed marketplace collection. Operator preview resolves
  confirmed component recipes through `CHANNEL_SKU_AVAILABILITY_PORT` and uses
  the latest stored inventory snapshot immediately; it does not wait for or
  request a Sellpia refresh. Official workbook export reruns the same canonical
  preview in fresh mode before persisting the artifact.
- Fresh-mode Rocket allocation replaces any earlier projected stock with
  Inventory's same-generation gated `currentStock` snapshot before official
  export. A refresh cannot bless quantities copied from an older generation.
- Rocket preview allocation is a pure in-memory policy over Sellpia
  `currentStock`. It seeds one remaining-stock map per preview and consumes
  shared component stock in stable ETA/PO/line order. It may return
  mapping, inactive-component, insufficient-capacity, or collection/account
  blocking reasons, but the preview itself never reserves stock, writes a workbook,
  mutates physical stock, or calls a purchase provider.
- Edited quantities are bounded before every result, including collection,
  vendor, mapping, inactive-component, and zero-capacity rows. The pure domain
  policy throws only framework-neutral outcomes; the application service owns
  HTTP exception translation.
- Preview edits are strict by default. The explicit `clampEditedQuantities`
  request mode jointly clamps retained edits in the same stable ETA/PO/line
  allocation order, so rows sharing a component cannot each retain an
  independently valid but collectively impossible quantity.
- `exportRocketWorkbook` reruns the canonical preview from the submitted collection,
  requires a confirmed active `ChannelListingOption ->
  ChannelListingOptionInventoryComponent -> SellpiaInventorySku` consumption
  rule for every official line (including a
  zero-quantity line), and requires an explicit reviewed quantity for every
  line. Mapping, configuration, and recipe-review blockers cannot be
  exported; only a recipe-backed insufficient-capacity row may continue with
  a controlled shortage reason.
- Rocket workbook export uses one organization advisory lock, the current
  Inventory generation, the completed Rocket source artifact, and unchanged
  `ChannelListingOption -> ChannelListingOptionInventoryComponent ->
  SellpiaInventorySku` identity
  before persisting the exact uploaded workbook bytes and immutable line audit
  evidence. One organization may have at most one non-terminal workflow.
- A caller-stable UUID idempotency key returns the same workbook only for the
  same normalized request and bytes. Reusing it with different input is a
  conflict. Re-download returns the stored artifact without recalculation.
- Coupang PA order collection calls the exported
  `ROCKET_FINAL_ORDER_RECONCILIATION_PORT` with its caller-owned transaction.
  Supply links an exact active workbook line by account, PO number, and product
  number and verifies barcode evidence when both sides provide it. Workbook
  linkage classifies matched versus unmatched rows but never filters the
  collected Sellpia output. Every non-empty transport returns the stable
  `rocket-final-order:{sourceImportRunId}:{transport}` transmission key; an
  empty probe has no transmission key. Supply does not write Orders or Inventory
  stock tables.
- Workflow completion requires all linked Orders-owned transmission intents to
  be finalized. It does not wait for or request a Sellpia Inventory generation.
  Abandonment requires fresh SHIPMENT and MILKRUN probes with no matched rows
  plus an explicit reason.

## Cross-Domain Ports

- Future writers for `SupplierProduct` must use a supply-owned port such
  as `SUPPLY_ATTACH_PORT`.
- Finance owns supplier-payment writes. Supply may read payment data for
  back-references when needed.
- Sourcing must not reintroduce supplier/procurement code or direct supply
  model mutations.
- Sourcing creates procurement handoffs only through the exported
  `SUPPLY_SOURCING_PROCUREMENT_PORT`.

## Boundary Rules

- Supplier and purchase-order single-resource access is repository-scoped by
  `{ id, organizationId }`.
- Raw SQL uses Prisma tagged templates only.
- Purchase-order submission and Rocket workbook transaction adapters are the
  Supply exceptions to repository-only Prisma access. Workbook export delegates
  generation fencing and progress projection to Inventory ports; it must not
  mutate Inventory state/current stock or expose those tables through a Supply
  repository.
- Do not write `SupplierPayment`.
- Rocket workbook export is an operator artifact, not a purchase-provider
  submission or proof that Coupang accepted anything.
- Do not reintroduce supplier/procurement controllers, services, DTOs, or
  supply model mutations under `src/sourcing/`.

## Current Non-Goals

- `SupplierProduct` currently has no write path; analytics reads it via a
  read-only join.
