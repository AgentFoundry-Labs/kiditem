Consult this document first instead of relying on memorized knowledge.

# product-hub/matching — ChannelSku to Sellpia Matching

`app/(catalog)/product-hub/matching/` owns `/product-hub/matching`, the operator
workspace for importing Coupang Wing product/SKU metadata and confirming which
Sellpia `MasterProduct` rows one Coupang or Rocket channel SKU consumes.

## Owned Surfaces

- Active Coupang or Rocket ChannelAccount selector; only
  `channel === 'coupang'` accounts can receive a Wing workbook
- Coupang Wing catalog upload
- Server-paged all/unmatched/needs-review/matched queue
- Live Sellpia candidate search and multi-component recipe editor
- Explicit confirmed unmap flow

## Data Flow

```text
React Query + apiClient
  -> GET /api/channels/accounts
  -> POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing
  -> GET /api/channels/sku-mappings
  -> POST /api/channels/sku-mappings/status-refresh
  -> GET /api/channels/sku-mappings/:channelSkuId/candidates
  -> PUT /api/channels/sku-mappings/:channelSkuId/components
```

## State Rules

- React Query owns accounts, server-paged rows, candidates, status refresh,
  catalog import, and component replacement. Do not mirror server state in
  Zustand.
- Candidate rows are live computed suggestions and are never auto-saved.
- The dialog owns a local complete-recipe draft. Adding a candidate defaults
  its quantity to `1`; saving requires one or more unique MasterProduct rows
  with positive integer quantities.
- `PUT .../components` replaces the whole recipe atomically. Normal save sends
  a nonempty recipe; the separate confirmed `매칭 해제` action sends
  `{ components: [] }`.
- A successful Wing import refreshes the imported account's advisory statuses,
  then invalidates server-paged matching lists and channel availability.
- Completed Wing and Rocket PO catalog publications share the same server-paged
  mapping queue and component-recipe editor.
- Component replacement, confirmed unmap, and explicit status refresh also
  invalidate channel availability immediately.
- `status=all|unmatched|needs_review|matched` is URL-authoritative and preserves
  account, search, and page parameters.
- Inactive mapped components surface as an availability warning under
  `매칭 확인 필요`; the warning does not rewrite persisted mapping status and
  never saves a recipe without the operator action.
- The standalone matching header owns one compact Sellpia freshness status;
  the shared provider still owns the single drawer.

## Cross-Domain Dependencies

- `@kiditem/shared/channel-account` provides account selector metadata.
- `@kiditem/shared/source-import` provides Wing import results.
- `@kiditem/shared/channel-sku-matching` provides mapping rows, candidate
  reasons, status counts, replacement input, and the 50-component limit.

## Boundary Rules

- All API calls go through `apiClient` + React Query.
- Do not send `organizationId`; backend session scope owns it.
- Do not load the complete queue into browser memory; use server page, search,
  status, and account parameters.
- Do not expose raw JSON or inputs for Sellpia current stock, Sellpia prices,
  or channel prices. Component quantity is the only editable number.
- Do not infer component quantity from option or bundle text.
- Wing catalog collection may attach provider media to registered products but
  must not create, refresh, or confirm ChannelSku component recipes here.
- Rocket PO identities are included in this common matching queue. Rocket PO
  collection, preview calculation, and order handling remain outside this
  route.
- See the [operator runbook](../../../../../../../docs/runbooks/channel-sellpia-matching.md)
  for import order, accepted local files, recovery, and baseline counts.
