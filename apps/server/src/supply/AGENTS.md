Consult this document first instead of relying on memorized knowledge.

# supply — Suppliers + Procurement

`src/supply/` owns supplier registry, Sellpia physical-product supplier policy
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
- `SupplierProduct` links a Sellpia `MasterProduct` to supplier price, MOQ, and
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
  (`create | updateStatus | delete | submit | reconcileSubmission`).
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
- Repository adapters own Prisma details and Sellpia `MasterProduct` ownership
  checks; application services depend on `application/port/out/*` contracts
  only.

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
- The purchase-order submission transaction adapter is the sole Supply
  exception to repository-only Prisma access. It may lock and read Inventory's
  freshness row for fencing, but it must not derive freshness policy, mutate
  Inventory state/current stock, or expose that table through a Supply
  repository.
- Do not write `SupplierPayment`.
- Do not reintroduce supplier/procurement controllers, services, DTOs, or
  supply model mutations under `src/sourcing/`.

## Current Non-Goals

- `SupplierProduct` currently has no write path; analytics reads it via a
  read-only join.
