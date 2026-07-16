Consult this document first instead of relying on memorized knowledge.

# product-hub/matching — Coupang ChannelSku to Sellpia Matching

`app/(catalog)/product-hub/matching/` owns `/product-hub/matching`, the operator
workspace for importing Coupang Wing product/SKU metadata and confirming which
Sellpia `MasterProduct` rows one channel SKU consumes.

## Owned Surfaces

- Active ChannelAccount selector; only `channel === 'coupang'` accounts can
  receive a Wing workbook in release `0.1.19`
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

## Recipe State Rules

- React Query owns accounts, server-paged rows, candidates, status refresh,
  catalog import, and component replacement.
- Candidate rows are suggestions and are never auto-saved.
- A recipe draft contains unique MasterProduct rows with positive integer
  quantities. `PUT .../components` replaces the whole recipe atomically.
- A successful Wing import refreshes advisory statuses, then invalidates
  matching lists, candidates, and channel availability.
- Component replacement, confirmed unmap, and explicit status refresh also
  invalidate channel availability immediately.
- The workspace retains account, search, status, and server paging controls.
- The shared Sellpia provider owns synchronization; route-local controls must
  not replace the baseline workspace layout.

## Boundary Rules

- All API calls go through `apiClient` + React Query.
- Do not send `organizationId`; backend session scope owns it.
- Do not load the complete queue into browser memory.
- Do not infer or save a component recipe from names, barcodes, or candidate
  rank.
- Component quantity is the only editable Sellpia number.
- Rocket PO collection, preview, and order handling remain outside this route.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(catalog\)/product-hub/matching
```
