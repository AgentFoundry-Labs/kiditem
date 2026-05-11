# products — Master, Option, Bundle Domain

Products owns catalog families, physical SKU options, bundle composition, and
the `/api/categories` compatibility capability.

## 3-Layer Contract

- `MasterProduct`: family/planned product and operating/ads/strategy unit.
  Codes use `MasterCodeCounter('master_product')` and `M-00000001` format.
- `ProductOption`: physical SKU/barcode/inventory unit. SKU format is
  `{master.code}-{NN}`.
- `BundleComponent`: set composition. Cross-master is allowed; cross-organization
  and nested bundles are forbidden.

## Layout

```text
products/
  products.module.ts
  categories/                 /api/categories compatibility capability
  adapter/in/http/            controllers and HTTP DTO binding
  adapter/out/prisma/         persistence, raw SQL, query helpers
  application/service/        transaction-owning orchestration
  domain/policy/              pure validation rules
  domain/service/             pure computations
  mapper/                     Prisma row -> shared contract
  dto/
  util/
```

`categories/` stays flat compatibility CRUD unless a product-catalog plan
retires or reconstructs it.

## Core Rules

- `MasterCodeService.generate(tx)` is the only master code issuer. It uses
  Prisma `MasterCodeCounter`, not raw SQL sequences.
- `OptionsService.create` generates SKU inside the transaction by incrementing
  the master option counter with `isDeleted: false` guard.
- `BundleStockService.recompute` is the only writer of materialized
  `availableStock`.
- `OptionsService.update` strips system fields via
  `stripProductOptionSystemFields`.
- `BundleComponent.organizationId` derives from `bundleOption.organizationId`.
- Bundle component CRUD recomputes inline inside the transaction and uses the
  canonical row-lock helper in `adapter/out/prisma/bundle-stock.persistence.ts`.
- Master and option use soft delete. BundleComponent uses hard delete.

## Controller And Service Rules

- Controllers use global `OrganizationScopeGuard` and global `ValidationPipe`;
  do not add per-route `@UseGuards` / `@UsePipes`.
- Controllers receive organization id from `@CurrentOrganization()`.
- DTOs must not accept client-provided `organizationId`.
- Application services may return raw Prisma rows internally; controllers map
  and validate serializable output.
- Domain code imports no Prisma or NestJS.
- Mutating application services accept optional `tx?: Prisma.TransactionClient`
  as the last parameter when they need transaction composition.

## Exports

- Exported application services: `MastersService`, `OptionsService`,
  `BundleComponentsService`, `ProductCatalogService`.
- `MasterCodeService` is not exported.
- `BundleStockService` is restricted to inventory recompute integration. Other
  modules should not call it directly.

## Organization Scope

Products relies on application-level `where.organizationId`, not DB RLS.
Agent/chat contexts must be provided through products application services or
query adapters, never direct DB access.

## Verification

```bash
npm exec --workspace=apps/server -- vitest run src/products
npm run build --workspace=apps/server
npm run dev:server
```
