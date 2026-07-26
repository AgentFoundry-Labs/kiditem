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
- Candidate queries are read-only evidence; opening, ranking, or searching
  never changes confirmed identity.
- A product must be explicitly confirmed before any of its channel options can
  be linked; both actions live inside the expanded product row.
- Variant candidates are limited to the listing's confirmed `MasterProduct`.
- Link and unlink mutations are separate explicit operator actions and
  invalidate product-mapping and channel-availability query families.
- Recipe status/capacity are inherited summaries. Manual replacement links to
  `/product-hub/[masterProductId]#variants`; the explicit version-fenced
  `상품·재고 자동 매칭` command may fill empty recipes without a second dialog.
- Coupang and Rocket share the queue; only Coupang gets a Wing workbook, and
  initial selection prefers populated Wing over an empty Rocket queue.
- Browser catalog publication may arrive already linked through Products-owned
  channel-origin provisioning or unique typed seller-SKU/safe-barcode reuse.
  Matching remains the operator correction and recipe-attention workspace for
  `재고 연결 필요` rows.
- Published product-detail chunks appear immediately; full snapshots are only
  required for absence/deactivation reconciliation.
- Product rows show `listing.channelImageUrl` beside the channel identity and
  `linkedProduct.displayImageUrl` beside the confirmed KidItem identity. These
  are read-time values; opening or confirming a match does not copy media into
  `MasterProduct.imageUrls`.

## Boundary Rules

- Recipe and identity safety policy is inherited from the catalog guide; this
  route adds no arbitrary quantity or component editor.
- Do not recreate channel-owned component recipes or arbitrary quantity inputs.
  The only recipe mutation here is the explicit version-fenced command that
  creates an empty central recipe as one active Sellpia SKU with a backend-
  verified positive integer quantity.
- The automatic command independently applies safe children while unresolved
  siblings remain review/blocked; confirmed links and recipes stay untouched.
- Recipe evidence must uniquely, non-conflictingly select one SKU via
  name-cross-checked exact code/barcode, exact normalized identity, or a
  high-confidence name with runner-up margin; quantities above one need an
  explicit integer pack ratio. Unverifiable pack/BOM, duplicates, conflicts,
  close names, raw aliases, and AI require review. Matching never auto-confirms
  identity from rank/name/AI: only catalog publication may use unique typed
  seller SKU or safely normalized barcode evidence.
- Do not send `organizationId`; backend session scope owns it.
- Wing and Rocket collection must preserve already confirmed links.
- Rocket order collection, purchase preview, and order handling remain outside
  this route.
