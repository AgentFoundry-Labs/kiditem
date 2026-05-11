# sourcing — Owner Domain

Sourcing owns sourcing ingest/scrape, suppliers, and purchase-order
procurement. Suppliers and procurement are capabilities inside `sourcing/`, not
standalone owner domains. `supplier-payments` belongs to finance.

Sourcing scrape/agent and products-catalog boundaries use application ports and
outgoing adapters. Suppliers and some procurement paths remain transitional
flat capability services; provider, Agent OS, or cross-domain creation work must
stay behind the declared ports.

## Public Routes

| Capability | Route |
|---|---|
| extension ingest + scrape | `/api/sourcing/extension/*`, `/api/sourcing/scrape-url` |
| sourcing product detail | `GET /api/sourcing/:id` |
| disabled detail-page generate | `POST /api/sourcing/:id/generate` |
| purchase orders | `/api/purchase-orders/*` |
| supplier CRUD | `/api/suppliers/*` |

Route shape is frozen.

## Layout

```text
sourcing/
  sourcing.module.ts
  adapter/in/http/        sourcing/procurement/suppliers controllers + DTOs
  adapter/out/agent/      SOURCING_AGENT_GATEWAY_PORT implementation
  adapter/out/products/   products catalog port adapter
  application/port/out/   agent gateway + products catalog ports
  application/service/    sourcing, procurement, suppliers services
  domain/policy/          purchase order status state machine
  __tests__/
```

## Boundary Rules

- `/api/sourcing/scrape-url` delegates to Agent OS through
  `SOURCING_AGENT_GATEWAY_PORT`. `SourcingService` must not inject Agent OS
  services or runtime adapters directly.
- Cross-domain `MasterProduct` creation flows through
  `SOURCING_PRODUCTS_CATALOG_PORT`; the products adapter is the only sourcing
  call site of `MastersService.create`.
- Updating an existing `MasterProduct` by `{ sourceUrl, organizationId }` may
  stay inside `SourcingService.receiveExtensionData`; it does not issue new
  product codes.
- Purchase-order transitions use pure domain policy in
  `domain/policy/purchase-order-status.ts`.
- Suppliers stay transitional flat CRUD until a concrete reconstruction driver
  appears.

## Contracts

- Extension ingest is idempotent by `{ sourceUrl, organizationId }`.
- `/api/sourcing/extension/products` returns paginated, organization-scoped
  `MasterProduct` rows.
- `GET /api/sourcing/:id` uses `findFirst({ id, organizationId })` and
  `pipelineStep IS NOT NULL`; miss is 404.
- `POST /api/sourcing/:id/generate` stays disabled with
  `NotImplementedException` until sourced candidates are modeled separately from
  operational `MasterProduct`.
- `/api/purchase-orders` keeps the legacy single POST action body
  (`create | updateStatus | delete`).
- Purchase-order status order is
  `draft -> pending -> ordered -> shipped -> received`; delete is allowed only
  from `draft` or `pending`.
- Supplier read/update/delete is tenant-scoped by `{ id, organizationId }`.

## Hard Bans

- Direct Agent OS injection from `application/service/**`.
- `findUnique({ where: { id } })` for supplier or purchase-order access.
- Importing `supplier-payments`.
- Direct import of products services from application services.
- Raw `master_products` INSERT from sourcing; code issuance belongs to products.
- Reintroducing top-level `suppliers` or `procurement` folders.

## Verification

```bash
git diff --check
npm exec --workspace=apps/server -- vitest run src/sourcing
npm run check:idor
npm run check:tenant-scope
npm run build --workspace=apps/server
npm run dev:server
```
