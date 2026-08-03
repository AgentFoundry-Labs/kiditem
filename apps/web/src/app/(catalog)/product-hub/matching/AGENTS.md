# product-hub/matching — Channel Product Matching

`app/(catalog)/product-hub/matching/` owns `/product-hub/matching`: Coupang Wing
catalog import and channel/Sellpia matching review. The model keeps one
confirmed `ChannelListing -> MasterProduct` product link and a direct inventory
consumption rule on each `ChannelListingOption` inside one expandable row.

## Data Flow

```text
React Query + apiClient
  -> GET /api/channels/accounts
  -> POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing
  -> /api/channels/product-mappings (queue, candidates, confirmations)
  -> /api/channels/product-mappings/auto-match
  -> /api/products/channel-options/:channelListingOptionId/inventory-components
```

## State Rules

- React Query owns accounts, queue rows, candidates, import, and confirmations.
- Candidate reads never change confirmed identity.
- A product link and every option consumption rule are independently visible
  and editable inside the expanded listing row.
- Link/unlink actions invalidate product-mapping and channel-availability.
- Component status/capacity are direct option summaries. Manual replacement
  uses the option's expected-component-fenced complete replacement contract.
  The single `상품 매칭 실행` command may fill an empty rule only when evidence
  resolves one active Sellpia SKU and a verified positive pack quantity.
- Coupang/Rocket share the queue; only Coupang imports Wing workbooks. The
  account checklist combines queues; recipe apply requires one selected account.
- Browser catalog publication preserves a previously confirmed product link and
  component rule but does not create or infer them. Matching remains the
  operator correction and component-attention workspace for
  `재고 연결 필요` rows.
- Product-detail chunks appear immediately; full snapshots reconcile absence.
- Product rows show `listing.channelImageUrl` beside the channel identity and
  `linkedProduct.displayImageUrl` beside the confirmed KidItem identity. These
  are read-time values; opening or confirming a match does not copy media into
  `MasterProduct.imageUrls`.

## Boundary Rules

- Component and identity safety policy is inherited from the catalog guide; this
  route adds no arbitrary quantity or component editor.
- The direct option editor replaces the complete component list using active
  Sellpia SKU identities, positive integer quantities, and expected current
  components. Never silently merge or overwrite the confirmed rule.
- The command refreshes Sellpia evidence once and applies safe children per
  account; unresolved siblings stay blocked and confirmed data stays untouched.
- Component evidence must uniquely select one SKU by name-checked exact
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
