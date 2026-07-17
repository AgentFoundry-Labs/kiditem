Consult this document first instead of relying on memorized knowledge.

# product-hub/options — Sellpia Inventory

`app/(catalog)/product-hub/options/` owns `/product-hub/options`, the complete
organization-scoped read-only Sellpia inventory table. The historical URL is
preserved; this is not an editable KidItem option-management screen.

## Data Flow

```text
React Query + apiClient
  -> GET /api/inventory/sellpia-skus
  -> queryKeys.inventory
```

## State Rules

- `sellpiaInventorySkuId` is the row identity.
- Search, stock, active, link, refresh, and page filters are independent from
  `/product-hub` and URL-authoritative.
- Render Sellpia ID, code, name, option, barcode, current stock, source prices,
  active state, import provenance, and linked destinations as read-only facts.
- Product and variant destinations come only from confirmed,
  organization-fenced `ProductVariantComponent` relations. Never infer a link;
  unlinked inventory stays visible and filterable.
- Inventory import work links to `/inventory-hub?tab=sellpia-sync`; channel
  matching work links to `/product-hub/matching`.

## Boundary Rules

- Do not mutate Sellpia stock, price, active state, product identity, variant
  identity, or recipe quantity from this route.
- Do not reuse product-operations list state or call `/api/products/masters` to
  build this collection.
- All API calls use `apiClient` + React Query and never send `organizationId`.
