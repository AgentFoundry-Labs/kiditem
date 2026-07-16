Consult this document first instead of relying on memorized knowledge.

# web/catalog — Product Operations and Channel Matching

`app/(catalog)/` owns KidItem product metadata, product variants and their
central Sellpia component recipes, plus explicit channel-to-product identity
confirmation. Public URLs remain under `/product-hub`.

## Owned Surfaces

- Product operations list, create/edit, and variant detail under `/product-hub`
- Coupang/Rocket account-scoped product-first, option-second matching under
  `/product-hub/matching`
- Dedicated read-only Sellpia option table under `/product-hub/options`

## Data Flow

```text
React Query + apiClient
  -> GET/POST/PATCH /api/products/masters
  -> GET /api/products/masters/:masterProductId
  -> PUT /api/products/variants/:productVariantId/components
  -> GET /api/products/recipe-component-candidates (focused recipe picker)
  -> GET /api/inventory/sellpia-skus (options table only)
  -> GET /api/channels/accounts
  -> POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing
  -> GET /api/channels/product-mappings
  -> GET/PUT product and option candidate/confirmation endpoints
  -> queryKeys.products.operations, inventory, channelProductMappings
```

## State Rules

- `MasterProduct` is KidItem product metadata; `ProductVariant` is a sellable
  KidItem option. Neither is a physical Sellpia inventory row.
- `/product-hub` preserves the staged operations composition. Metrics without
  a product-level fact source render `미수집`; page-derived metrics say
  `현재 페이지` explicitly.
- Variant recipes are complete atomic replacements of confirmed
  `SellpiaInventorySku` components and positive integer quantities.
- `/product-hub/options` owns the complete read-only Sellpia inventory
  collection and publishes product/variant destinations only from confirmed,
  organization-fenced component relations.
- Matching confirms channel listing -> `MasterProduct` before channel option ->
  `ProductVariant`. Candidate evidence never confirms identity.

## Boundary Rules

- Product list/detail and its recipe picker use Products APIs. They never call
  the Inventory SKU collection route directly.
- Do not infer product, variant, recipe, or channel identity from display text,
  barcode, normalized name, or candidate rank.
- Do not edit Sellpia stock, source prices, or channel prices in catalog routes.
- Do not recreate channel-owned component quantities; central recipe edits live
  only on product detail.
- Never send `organizationId`; backend session scope owns it.
- Sourcing candidates, generated content workspaces, marketplace ingest,
  Rocket operations, and purchase orders remain in their owner domains.
