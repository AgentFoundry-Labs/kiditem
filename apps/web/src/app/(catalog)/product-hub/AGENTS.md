Consult this document first instead of relying on memorized knowledge.

# product-hub - Read-only Sellpia Product Catalog

`app/(catalog)/product-hub/` owns `/product-hub` and
`/product-hub/[masterProductId]` as the operator-facing catalog for the latest
Sellpia inventory snapshot. `/product-hub/options` preserves its existing URL
while reusing the channel SKU matching workspace.

## Data Flow

```text
React Query + apiClient
  -> GET /api/inventory/sellpia-skus
  -> GET /api/inventory/sellpia-skus/:masterProductId
  -> GET /api/channels/sku-availability
  -> queryKeys.inventory, channelSkuAvailability
```

## State Rules

- Use `queryKeys.inventory.snapshot(...)` for paged list reads and the
  `queryKeys.inventory.snapshots()` family for detail reads.
- Preserve server paging, search, stock status, and active status parameters.
- Render Sellpia identity, option name, barcode, current stock, source prices,
  active state, and last-import provenance as read-only facts.
- Link inventory import work to `/inventory-hub?tab=sellpia-sync` and component
  matching work to `/product-hub/matching`.

## Boundary Rules

- No manual MasterProduct create/update/delete, inventory adjustment, traffic
  upload, grading, workflow action, or legacy product-option management.
- Do not call `/api/products*` or introduce a catalog-owned stock balance.
- Do not infer or persist channel mappings from the catalog list/detail.
- Keep all edited UI light-only; do not add `dark:` variants.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(catalog\)/product-hub
```
