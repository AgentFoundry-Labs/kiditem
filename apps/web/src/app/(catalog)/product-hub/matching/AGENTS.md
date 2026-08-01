# product-hub/matching — Channel Product Matching

`app/(catalog)/product-hub/matching/` owns `/product-hub/matching`: Coupang Wing
catalog import and product-first channel/Sellpia matching review. The model
keeps listing -> `MasterProduct` and option -> `ProductVariant` as separate
confirmed links inside one expandable product row.

## Data Flow

```text
React Query + apiClient
  -> GET /api/channels/accounts
  -> POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing
  -> /api/channels/product-mappings (queue, candidates, confirmations)
  -> /api/channels/product-mappings/recipe-automation (preview, apply)
  -> /api/channels/product-mappings/sellpia-manual-match (targets, import)
```

## State Rules

- React Query owns accounts, queue rows, candidates, import, and confirmations.
- Candidate reads never change confirmed identity.
- A product must be explicitly confirmed before any of its channel options can
  be linked; both actions live inside the expanded product row.
- Variant candidates are limited to the listing's confirmed `MasterProduct`.
- Link/unlink actions invalidate product-mapping and channel-availability.
- Recipe status/capacity are inherited summaries. Manual replacement links to
  `/product-hub/[masterProductId]#variants`; the single `상품 매칭 실행`
  command internally refreshes Sellpia manual-match aliases, recalculates the
  version-fenced proposal, and may fill empty recipes without a second dialog.
  Do not expose alias collection as a separate operator action.
- Coupang/Rocket share the queue; only Coupang imports Wing workbooks. The
  account checklist combines queues; recipe apply requires one selected account.
- Browser catalog publication may arrive already linked through Products-owned
  channel-origin provisioning or unique typed seller-SKU/safe-barcode reuse.
  Matching remains the operator correction and recipe-attention workspace for
  `재고 연결 필요` rows.
- Product-detail chunks appear immediately; full snapshots reconcile absence.
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
- The command refreshes Sellpia evidence once and applies safe children per
  account; unresolved siblings stay blocked and confirmed data stays untouched.
- Recipe evidence must uniquely select one SKU by name-checked exact
  code/barcode, exact normalized identity, high-confidence name, or an exact
  current Sellpia manual-match alias. `18개입`/`5개 묶음` are quantity candidates;
  auto-confirmation requires the same positive Sellpia `item_count`. Ambiguous,
  conflicting, or unverifiable evidence requires review. Rank/name/AI never
  confirms channel identity; only catalog publication may reuse a unique typed
  seller SKU or safe normalized barcode.
- Do not send `organizationId`; backend session scope owns it.
- Operator status is only `매칭 완료`, `매칭 수량 검토`, or `미매칭 상품`.
  Quantity review never counts as unmatched; internal reasons stay available.
- Wing and Rocket collection must preserve already confirmed links.
- Rocket order collection, purchase preview, and order handling remain outside
  this route.
