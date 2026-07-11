Consult this document first instead of relying on memorized knowledge.

# web/catalog - Product Hub and Channel SKU Matching

`app/(catalog)/` owns catalog product browsing/editing, product options, product
hub detail pages, and Coupang ChannelSku-to-Sellpia matching. Public product
URLs live under `/product-hub`. Do not add a sibling `products/` route or
implementation scope; product hub implementation code lives under
`product-hub/`. This group does not own sourcing candidate promotion, generated
content workspaces, or marketplace ingest.

Verify list/detail UI through `/product-hub` and `/product-hub/[id]`.

## Owned Surfaces

- Product and product option lists/details under `/product-hub`
- Product hub detail panels and catalog activity context
- Coupang Wing catalog upload and account-scoped ChannelSku component matching
  under `/product-hub/matching`
- Product export helpers and catalog-only grading helpers

## Data Flow

```text
React Query + apiClient
  -> /api/products/*
  -> /api/products/options/*
  -> /api/channels/accounts
  -> /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing
  -> /api/channels/sku-mappings/*
  -> queryKeys.products, productOptions, channelAccounts, channelSkuMappings
```

## State Rules

- Prefer focused product/option API helpers under route-local `lib/`.
- Product option mutations invalidate `queryKeys.productOptions.all`.
- Product mutations invalidate the relevant `queryKeys.products.*` family.
- Channel matching uses focused account, source-import, and ChannelSku matching
  contracts and never sends `organizationId`.
- Candidate rows are computed suggestions. Only an explicitly saved
  `ChannelSkuComponent` recipe is matching truth.

## Boundary Rules

- Do not create or infer `MasterProduct`/`ProductOption` links from a Wing
  catalog row or candidate.
- Do not pull sourcing raw rows or generated content workspace behavior into
  catalog routes.
- Workflow runs shown on product pages are context actions; workflow engine
  behavior remains backend/automation-owned.
- Traffic uploads must stay aligned with backend upload contracts.
- Do not edit Sellpia reported stock or channel prices from the matching route.
- Coupang image synchronization is separate from ChannelSku matching.
- Rocket catalog, purchase-order, and order behavior is outside this route.
