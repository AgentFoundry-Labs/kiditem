Consult this document first instead of relying on memorized knowledge.

# products — Catalog, Options, Bundles

`src/products/` owns catalog families, catalog options, bundle composition,
product content reads, and the `/api/categories` compatibility capability. It
does not own stock or marketplace SKU availability.

## Folder Map

```text
products/
├── products.module.ts
├── categories/              # /api/categories compatibility CRUD
├── adapter/in/http/         # controllers and HTTP DTO binding
├── adapter/out/repository/  # persistence adapters and query helpers
├── application/
│   ├── port/in/             # owner-side ports consumed by other domains
│   ├── port/out/            # repository/code/transaction ports
│   └── service/             # transaction-owning orchestration
├── domain/
│   ├── policy/              # pure validation rules
│   └── service/             # pure computations
├── mapper/                  # repository row -> shared contract
├── dto/                     # legacy compatibility DTOs
└── util/                    # legacy compatibility helpers
```

## Owned Surfaces

- Product catalog and option APIs under `/api/products/*`
- Product content card/preview/editor compatibility APIs
- Catalog bundle component behavior
- `/api/categories` compatibility capability

## Main Data Models

- `MasterProduct` is the family/planned product and operating/ads/strategy
  unit. Codes use `MasterCodeCounter('master_product')` and `M-00000001`
  format.
- `ProductOption` is an internal catalog option and barcode identity. SKU
  format is `{master.code}-{NN}`; it has no current, reserved, safety, reorder,
  or available-stock field.
- `BundleComponent` stores internal catalog composition. It does not produce a
  bundle stock balance and is distinct from a marketplace
  `ChannelSkuComponent` recipe.
- `ProductPreparation` captures selected registration inputs after sourcing
  promotion.

## Catalog Flow

- `MASTER_CODE_PORT.generate(tx)` is the only master code issuer.
- `OptionsService.create` generates option SKUs inside the transaction.
- Bundle component CRUD validates and persists composition only.
- Master and option rows use soft delete. `BundleComponent` uses hard delete.

## Cross-Domain Ports

- Products publishes `PRODUCT_MASTER_PROMOTION_PORT` for sourcing candidate
  promotion.
- Cross-owner modules consume products through local `adapter/out/products/`
  bridges, not by injecting products services directly.

## Boundary Rules

- Controllers receive `organizationId` from `@CurrentOrganization()`; DTOs do
  not accept client-provided organization ids.
- Application services depend on `application/port/out/*`, not concrete
  repository adapters or Prisma types.
- Domain code imports no Prisma, NestJS, HTTP DTOs, or provider SDKs.
- Mutating application services accept an optional
  `ProductsRepositoryTransaction` as the last parameter when transaction
  composition is needed.
- Sourcing-only columns on `master_products` are deprecated migration residue;
  products code must not select, filter on, or echo them.
- `lifecycleState` is the master lifecycle API field and uses
  `@kiditem/shared/product` validation.
- Product DTOs and read models must not recreate stock, reorder, stockout,
  lead-time, or bundle-capacity fields. Marketplace sellable capacity belongs
  to Channels and Sellpia physical quantity belongs to Inventory.

## Transitional Exceptions

- `categories/`, root `dto/`, and root `util/` are compatibility surfaces.
  New product behavior should not copy those shapes.
- `ProductContentController` still owns legacy non-AI content history and
  editor compatibility routes while generated-content source of truth moves
  through AI detail-page artifacts/revisions.
