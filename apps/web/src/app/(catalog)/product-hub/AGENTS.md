Consult this document first instead of relying on memorized knowledge.

# product-hub — Product Operations Center

`app/(catalog)/product-hub/` owns the KidItem product operations workflows:

- `/product-hub` lists and manages `MasterProduct` metadata;
- `/product-hub/[masterProductId]` shows product metadata, variants, inherited
  Sellpia recipe capacity, bottlenecks, and component identity;
- `/product-hub/options` is the full read-only Sellpia inventory table;
- `/product-hub/matching` explicitly links channel products and options to
  KidItem products and variants.

## Data Flow

```text
/product-hub and /product-hub/[id]
  -> /api/products/masters
  -> /api/products/recipe-component-candidates
  -> queryKeys.products.operations

/product-hub/options
  -> /api/inventory/sellpia-skus
  -> queryKeys.inventory

/product-hub/matching
  -> /api/channels/product-mappings
  -> queryKeys.channelProductMappings
```

## State Rules

- Preserve the operations-center composition: header controls, command cards,
  category strip, filters, metric columns, and product rows. Metrics without a
  product/variant fact source render `미수집`; do not derive them from
  organization/date/seller aggregates.
- Command-center counts use the list response summary for the full filtered
  result. Do not label or calculate command-center metrics as current-page
  values; pagination applies only to the product rows.
- Search, filters, period, and page on `/product-hub` are URL-authoritative.
- Product create/edit mutations invalidate only the product operations list and
  affected detail keys.
- Variant recipes are complete atomic replacements owned by the product detail
  route. Operators select confirmed physical Inventory identities through a
  focused search; a component is saved by `sellpiaInventorySkuId` and positive
  integer quantity.
- `/product-hub/options` owns independent Sellpia search, stock, active, link,
  refresh, and paging state. Its stock and price fields are provider facts.
- Candidate generation on `/product-hub/matching` never confirms a link.
  Product and variant mutations require explicit operator confirmation.
- Products owns transaction-aware creation or exact reuse of channel-origin
  products and variants during catalog publication. Channels owns typed exact
  evidence extraction and the final still-null listing/option link writes.
- Channel-origin rows without a confirmed Sellpia component recipe remain
  visible here as `재고 연결 필요`; matching is the operator correction and
  recipe-attention workspace.
- List, detail, and channel-origin edit surfaces render product and variant
  `displayReference` values. Never expose deterministic internal `CP-*` or
  `CP-SKU-*` codes as operator-facing product or option identifiers.

## Boundary Rules

- Product list/detail never read `/api/inventory/sellpia-skus`; options is the
  only product-hub route that owns the Sellpia inventory collection. The detail
  recipe picker uses the Products-owned focused candidate endpoint.
- Do not create catalog-owned stock balances or editable Sellpia stock/price
  inputs.
- Do not infer product, variant, or recipe identity from display text.
  Normalized names and AI never auto-confirm publication or matching links.
- Channel rows may show inherited recipe status and capacity, but recipe edits
  belong only to `/product-hub/[masterProductId]`.
- All API calls use `apiClient` + React Query and never send `organizationId`.
- Keep all edited UI light-only; do not add `dark:` variants.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(catalog\)/product-hub
```
