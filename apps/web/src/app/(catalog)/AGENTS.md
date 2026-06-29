Consult this document first instead of relying on memorized knowledge.

# web/catalog - Product Hub and Channel Matching

`app/(catalog)/` owns catalog product browsing/editing, product options, product
hub detail pages, and Coupang-to-KidItem matching. Public product URLs live
under `/product-hub`. Do not add a sibling `products/` route or implementation
scope; product hub implementation code lives under `product-hub/`. This group
does not own sourcing candidate promotion, generated content workspaces, or
marketplace ingest.

## Folder Map

```text
(catalog)/
├── product-hub/
│   ├── [id]/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── matching/
│   └── options/
```

Verify list/detail UI through `/product-hub` and `/product-hub/[id]`.

## Owned Surfaces

- Product and product option lists/details under `/product-hub`
- Product hub detail panels and catalog activity context
- Manual channel reconciliation to active product options
- Product export helpers and catalog-only grading helpers

## Data Flow

```text
React Query + apiClient
  -> /api/products/*
  -> /api/products/options/*
  -> /api/channels/reconciliation/coupang/*
  -> queryKeys.products, productOptions, channelReconciliation
```

## State Rules

- Prefer focused product/option API helpers under route-local `lib/`.
- Product option mutations invalidate `queryKeys.productOptions.all`.
- Product mutations invalidate the relevant `queryKeys.products.*` family.
- Reconciliation uses shared channel-reconciliation contracts and never sends
  `organizationId`.

## Boundary Rules

- Do not create `MasterProduct` from a Coupang reconciliation row.
- Do not pull sourcing raw rows or generated content workspace behavior into
  catalog routes.
- Workflow runs shown on product pages are context actions; workflow engine
  behavior remains backend/automation-owned.
- Traffic uploads must stay aligned with backend upload contracts.

## Verification

```bash
npm run build --workspace=apps/web
```
