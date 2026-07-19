# product-hub/matching — Channel Product Matching

`app/(catalog)/product-hub/matching/` owns `/product-hub/matching`, the operator
workspace for importing Coupang Wing catalog metadata and reviewing channel
identity plus Sellpia inventory matching by product. The data model still keeps
channel listing -> `MasterProduct` and child listing option -> `ProductVariant`
as separate confirmed links, but operators work from one product row and expand
its options instead of switching between peer workspaces.

## Data Flow

```text
React Query + apiClient
  -> GET /api/channels/accounts
  -> POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing
  -> /api/channels/product-mappings (queue, candidates, confirmations)
  -> /api/channels/product-mappings/recipe-automation (preview, apply)
```

## State Rules

- React Query owns accounts, queue rows, candidates, import, and confirmations.
- A product must be explicitly confirmed before any of its channel options can
  be linked; both actions live inside the expanded product row.
- Variant candidates are limited to the listing's confirmed `MasterProduct`.
- Link and unlink mutations are separate explicit operator actions and
  invalidate product-mapping and channel-availability query families.
- Recipe status and capacity are inherited summaries. Manual replacement links
  to `/product-hub/[masterProductId]#variants`; `상품·재고 자동 매칭` applies the
  current version-fenced proposal without a second confirmation dialog.
- Coupang and Rocket catalog rows share the matching queue. Only Coupang
  accounts receive a Wing workbook, and the initial account selection prefers
  Coupang Wing before Rocket so a populated Wing queue is not hidden by an empty
  Rocket account.
- Browser catalog publication may arrive already linked through Products-owned
  channel-origin provisioning or unique typed seller-SKU/safe-barcode reuse.
  Matching remains the operator correction and recipe-attention workspace for
  `재고 연결 필요` rows.
- Product-detail chunks already published by a running browser collection appear
  immediately; full-snapshot completion is required only for absence and
  deactivation reconciliation.

## Boundary Rules

- Recipe and identity safety policy is inherited from the catalog guide; this
  route adds no arbitrary quantity or component editor.
- Wing and Rocket collection must preserve already confirmed links.
- Rocket order collection, purchase preview, and order handling remain outside
  this route.
