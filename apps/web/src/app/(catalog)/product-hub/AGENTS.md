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
  -> /api/channels/product-mappings/recipe-automation/preview
  -> /api/channels/product-mappings/recipe-automation/apply
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
- Reorder counts and row badges use the Analytics-owned depletion projection
  hydrated by Products. Link the evidence to
  `/stock-ops?tab=product-outflow`; label shared coverage as `공유 SKU 기준`.
  Do not synthesize an imminent-stock threshold when no policy exists.
- Search, filters, period, and page on `/product-hub` are URL-authoritative.
- Product create/edit mutations invalidate only the product operations list and
  affected detail keys.
- Manual variant recipe edits are complete atomic replacements owned by the
  product detail route. Operators select confirmed physical Inventory
  identities through a focused search; a component is saved by
  `sellpiaInventorySkuId` and positive integer quantity. Matching may only
  invoke the separate version-fenced create-if-empty command for one component
  at quantity `1` after an explicit confirmation dialog.
- `/product-hub/options` owns independent Sellpia search, stock, active, link,
  refresh, and paging state. Its stock and price fields are provider facts.
- Candidate generation on `/product-hub/matching` never confirms an identity
  link. Product/variant link mutations and deterministic recipe application
  require explicit operator confirmation.
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
- Product operations and product-outflow remain separate screens over the same
  depletion projection. Manual `MasterProduct.abcGrade` is not overwritten by
  sales-derived ABC.
- Do not create catalog-owned stock balances or editable Sellpia stock/price
  inputs.
- Do not infer product or variant identity from display text. Normalized names
  and AI never auto-confirm publication or matching links. Recipe automation
  may use only a strict exact normalized product-name plus option pair when it
  uniquely selects one SKU, has no conflicting evidence or pack/BOM
  uncertainty, and writes quantity `1`; product-name-only, similarity, rank,
  raw aliases, and AI remain review-only.
- Channel rows may show inherited recipe status and capacity. Manual complete
  recipe edits belong to `/product-hub/[masterProductId]`; matching owns only
  the narrow create-if-empty automation workflow.
- All API calls use `apiClient` + React Query and never send `organizationId`.
- Keep all edited UI light-only; do not add `dark:` variants.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(catalog\)/product-hub
```
