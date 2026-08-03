# product-hub — Product Operations Center

`app/(catalog)/product-hub/` owns the KidItem product operations workflows:

- `/product-hub` lists and manages `MasterProduct` metadata;
- `/product-hub/[masterProductId]` shows product metadata, linked channel
  listings/options, direct Sellpia consumption rules, capacity, and bottlenecks;
- `/product-hub/options` is the full read-only Sellpia inventory table;
- `/product-hub/matching` explicitly links channel listings to KidItem products
  and configures option-level Sellpia consumption rules.

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
  -> /api/channels/product-mappings/auto-match
  -> /api/products/channel-options/:channelListingOptionId/inventory-components
  -> queryKeys.channelProductMappings
```

## State Rules

- Preserve the operations-center composition: header controls, command cards,
  category strip, filters, metric columns, and product rows. Metrics without a
  product fact source render `미수집`; do not derive them from
  organization/date/seller aggregates.
- Command-center counts use a dedicated unfiltered operations-list summary for
  the active operating catalog. Search, category, active, advertising, inventory, ABC, and
  page parameters affect only the product rows, their displayed result count,
  and pagination; they must never change the command-center numbers.
- Reorder counts and row badges use the Analytics-owned depletion projection
  hydrated by Products. Link the evidence to
  `/stock-ops?tab=product-outflow`; label shared coverage as `공유 SKU 기준`.
  Imminent stock is the explicit non-persisted operations policy: not already
  needing reorder and known remaining coverage above 1.5 months and at or below
  3 months. Command-card counts and list filters use the same server predicate.
- Filters, period, and page are URL-authoritative. Products displays Finance's
  contribution-profit ABC; unconnected variable costs are `0원 · NOT_APPLIED`.
  Dashboard/outflow consume it.
  `abcGrade` and `abcCalculationStatus` are exclusive; unclassified is not C.
- `수익성 데이터 갱신` requests `full` (product-profit then ABC),
  separately from inventory refresh.
- Product detail and matching share the complete option-component replacement
  contract. Matching uses one listing modal for product identity plus child
  Sellpia identities and quantities. Linked options inherit the product, hide
  its picker until explicit correction, and a sole option renders as `기본 옵션`.
- `/product-hub/options` owns independent Sellpia search, stock, active, link,
  refresh, and paging state. Its stock and price fields are provider facts.
- Candidate generation on `/product-hub/matching` never confirms an identity
  link. Product link mutations and component replacement require explicit
  operator confirmation.
- Channel catalog publication preserves existing `ChannelListing ->
  MasterProduct` links and option consumption rules. It does not create
  channel-origin MasterProducts or infer a product link.
- Channel options without a confirmed Sellpia component rule remain
  visible here as `재고 연결 필요`; matching is the operator correction and
  component-attention workspace.
- List and detail surfaces render product `displayReference` values. Never
  expose deterministic internal codes as operator-facing product identifiers.
- Product list/detail display surfaces render calculated `displayImageUrls`.
  Product create/edit forms read and submit only operator-managed `imageUrls`;
  they never promote a channel fallback into direct product metadata.

## Boundary Rules

- Product list/detail never read `/api/inventory/sellpia-skus`; options is the
  only product-hub route that owns the Sellpia inventory collection. The detail
  inventory picker uses the Products-owned focused candidate endpoint.
- Product operations and product-outflow are separate views of one automatic
  `MasterProduct.abcGrade`; do not add manual or secondary sales grades.
- Do not create catalog-owned stock balances or editable Sellpia stock/price
  inputs.
- Do not infer product identity from display text, normalized names, or AI. The
  nested matching guide owns the narrower component-evidence and pack-ratio
  policy.
- Channel rows show component status and capacity. Manual complete component
  edits are available both in product detail and the matching page's unified
  operating-product modal through the same direct option-component contract.
- All API calls use `apiClient` + React Query and never send `organizationId`.
- Keep all edited UI light-only; do not add `dark:` variants.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(catalog\)/product-hub
```
