Consult this document first instead of relying on memorized knowledge.

# product-hub/matching — Channel Product Matching

`app/(catalog)/product-hub/matching/` owns `/product-hub/matching`, the operator
workspace for importing Coupang Wing catalog metadata and explicitly confirming
two levels of identity:

1. channel listing -> `MasterProduct`;
2. channel listing option -> `ProductVariant` within that confirmed product.

## Data Flow

```text
React Query + apiClient
  -> GET /api/channels/accounts
  -> POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing
  -> GET /api/channels/product-mappings
  -> GET /api/channels/product-mappings/:channelListingId/candidates
  -> PUT /api/channels/product-mappings/:channelListingId/master-product
  -> GET /api/channels/product-mappings/options/:channelListingOptionId/candidates
  -> PUT /api/channels/product-mappings/options/:channelListingOptionId/product-variant
```

## State Rules

- React Query owns accounts, queue rows, candidates, import, and confirmations.
- Candidate queries are read-only suggestions with evidence. Opening, ranking,
  or searching candidates never changes confirmed identity.
- A product must be explicitly confirmed before any of its channel options can
  be linked.
- Variant candidates are limited to the listing's confirmed `MasterProduct`.
- Link and unlink mutations are separate explicit operator actions and
  invalidate product-mapping and channel-availability query families.
- Recipe status and capacity are inherited read-only summaries. Recipe changes
  link to `/product-hub/[masterProductId]#variants`.
- Coupang and Rocket catalog rows share the matching queue. Only Coupang
  accounts receive a Wing workbook, and the initial account selection prefers
  Coupang Wing before Rocket so a populated Wing queue is not hidden by an empty
  Rocket account.
- Browser catalog publication may arrive already linked through Products-owned
  channel-origin provisioning or unique typed seller-SKU/safe-barcode reuse.
  Matching remains the operator correction surface and the read-only
  recipe-attention workspace for `재고 연결 필요` rows.
- Product-detail chunks already published by a running browser collection appear
  immediately; full-snapshot completion is required only for absence and
  deactivation reconciliation.

## Boundary Rules

- Do not recreate channel-owned component recipes or quantity inputs.
- Matching candidates never auto-confirm identity from rank, normalized name,
  or AI evidence. The only automatic identity decision is the backend catalog
  publication boundary's unique, non-conflicting typed seller SKU or safely
  normalized barcode policy; raw aliases and names are never confirming.
- Do not send `organizationId`; backend session scope owns it.
- Wing and Rocket collection must preserve already confirmed links.
- Rocket order collection, purchase preview, and order handling remain outside
  this route.
