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
  accounts receive a Wing workbook.

## Boundary Rules

- Do not recreate channel-owned component recipes or quantity inputs.
- Do not infer or auto-confirm product/variant identity from candidate rank,
  code, barcode, provider identity, normalized name, or AI evidence.
- Do not send `organizationId`; backend session scope owns it.
- Wing and Rocket collection must preserve already confirmed links.
- Rocket order collection, purchase preview, and order handling remain outside
  this route.
