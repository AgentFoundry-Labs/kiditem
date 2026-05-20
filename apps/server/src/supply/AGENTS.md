# supply — Suppliers + Procurement

`src/supply/` owns supplier registry, master-supplier policy
(`MasterSupplierProduct`), and purchase-order procurement. Suppliers are
organization-private. Sourcing and supply are separate because sourcing buyer
work and vendor-manager/procurement work mutate different surfaces.

## Folder Map

```text
supply/
├── supply.module.ts
├── adapter/in/http/         # suppliers and procurement controllers + DTOs
├── adapter/out/repository/  # Prisma-backed supplier/procurement repositories
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
- `MasterSupplierProduct` is the master-supplier policy table.
- `PurchaseOrder` is procurement state.
- `SupplierPayment` is finance-owned and must not be written from supply.

## Procurement Rules

- Supplier writes use `organizationId` from `@CurrentOrganization()`.
- Purchase-order transitions use
  `domain/policy/purchase-order-status.ts`.
- Status order is `draft -> pending -> ordered -> shipped -> received`.
- Delete is allowed only from `draft` or `pending`.
- `/api/purchase-orders` keeps the legacy single POST action body
  (`create | updateStatus | delete`).
- Repository adapters own Prisma details and ProductOption ownership checks;
  application services depend on `application/port/out/*` contracts only.

## Cross-Domain Ports

- Future writers for `MasterSupplierProduct` must use a supply-owned port such
  as `SUPPLY_ATTACH_PORT`.
- Finance owns supplier-payment writes. Supply may read payment data for
  back-references when needed.
- Sourcing must not reintroduce supplier/procurement code or direct supply
  model mutations.

## Boundary Rules

- Supplier and purchase-order single-resource access is repository-scoped by
  `{ id, organizationId }`.
- Raw SQL uses Prisma tagged templates only.
- Do not write `SupplierPayment`.
- Do not reintroduce supplier/procurement controllers, services, DTOs, or
  supply model mutations under `src/sourcing/`.

## Current Non-Goals

- `MasterSupplierProduct` currently has no write path; analytics reads it via a
  read-only join.
