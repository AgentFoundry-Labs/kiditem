# supply — Owner Domain

Supply owns supplier registry, master-supplier policy (`MasterSupplierProduct`),
and purchase-order procurement. Suppliers are organization-private.
The sourcing/supply boundary reflects different actors (sourcing buyer vs
vendor manager) working against different mutation surfaces.

`supplier-payments` is a finance capability and lives in `finance/`.
`supplier-stats` is a read-model and lives in `analytics/supplier-stats/`.

## Public Routes

| Capability | Route |
|---|---|
| supplier CRUD | `/api/suppliers/*` |
| purchase orders | `/api/purchase-orders/*` |

Route shape is frozen.

## Layout

```text
supply/
  supply.module.ts
  adapter/in/http/         suppliers / procurement controllers + DTOs
  application/service/     suppliers, procurement services
  domain/policy/           purchase-order-status state machine
  __tests__/
```

## Boundary Rules

- Supplier mutation is **organization-private**. All writes scope by
  `@CurrentOrganization()` and persist `organization_id`.
- `MasterSupplierProduct` is the master-supplier policy table. Currently
  has **no write path** in the codebase — only `analytics/supplier-stats`
  consumes it via read-only join. New writers must use a supply-owned port
  such as `SUPPLY_ATTACH_PORT`.
- Purchase orders are state-machine controlled. Transitions use the pure
  domain policy in `domain/policy/purchase-order-status.ts`.
- supplier-payments writes go through finance services; supply does **not**
  write `SupplierPayment`. supply may read for back-references when needed.
- Suppliers stay transitional flat CRUD until a concrete reconstruction
  driver appears.

## Contracts

- `GET /api/suppliers/:id`, `PATCH`, `DELETE` use `findFirst({ id, organizationId })`.
  `findUnique({ where: { id } })` is an IDOR bug.
- `POST /api/suppliers` writes with `organizationId` from `@CurrentOrganization()`.
- `GET /api/purchase-orders` returns paginated, organization-scoped rows.
- Purchase-order status order is
  `draft -> pending -> ordered -> shipped -> received`; delete is allowed only
  from `draft` or `pending`.
- `/api/purchase-orders` keeps the legacy single POST action body
  (`create | updateStatus | delete`).

## Hard Bans

- `findUnique({ where: { id } })` for supplier or purchase-order access.
- `$queryRawUnsafe`. Raw SQL uses Prisma tagged templates only.
- Writing `SupplierPayment` — finance owns that table.
- Reintroducing supplier/procurement code under `sourcing/`.

## Verification

```bash
git diff --check
npm exec --workspace=apps/server -- vitest run src/supply
npm run check:idor
npm run check:tenant-scope
npm run build --workspace=apps/server
npm run dev:server
```
