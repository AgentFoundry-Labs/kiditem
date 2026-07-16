Consult this document first instead of relying on memorized knowledge.

# product-hub/matching — Preserved Matching Center + Sellpia Recipes

`app/(catalog)/product-hub/matching/` owns two additive views under
`/product-hub/matching`:

- the default pre-SDD matching-center surface with `자동 연결`, `확인 필요`,
  `충돌`, `처리 완료`, and `제외` tabs;
- `?view=channel-recipes`, the current ChannelSku-to-Sellpia component recipe
  workspace.

The sidebar opens the preserved default surface. Do not replace it with the
recipe workspace. Link the two views explicitly instead.

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

The removed legacy channel-reconciliation API is not recreated. The default
surface adapts current `needs_review` and `matched` rows into its preserved
table. Legacy-only distinctions (`자동 연결`, `충돌`, `제외`) remain visible
with an explicit unavailable state. The `이미지 동기화 데이터 점검` action
remains visible but disabled until a supported server contract exists.

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
- The recipe view retains account, search, status, and server paging controls.
- The shared Sellpia provider owns synchronization; these views only show the
  compact freshness control.

## Boundary Rules

- All API calls go through `apiClient` + React Query.
- Do not send `organizationId`; backend session scope owns it.
- Do not revive removed reconciliation, legacy ProductOption, or
  `/api/products*` endpoints just to make preserved controls interactive.
- Do not load the complete queue into browser memory.
- Do not infer or save a component recipe from names, barcodes, candidate
  rank, or the preserved legacy table.
- Component quantity is the only editable Sellpia number.
- Rocket PO collection, preview, and order handling remain outside this route.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(catalog\)/product-hub/matching
```
