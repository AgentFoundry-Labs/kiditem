# product-hub/matching — Coupang ↔ KidItem 매칭 센터

`/product-hub/matching` triages Coupang Wing rows that the channels backend has
not auto-linked to a `MasterProduct` / `ProductOption`. UI consumes
`/api/channels/reconciliation/coupang/*`.

## Rules

- All API calls go through `apiClient` + React Query — no raw `fetch`, no
  `organizationId` in query strings or bodies. The backend resolves the
  tenant from `@CurrentOrganization()`.
- Tabs (`자동 연결`, `확인 필요`, `충돌`, `처리 완료`, `제외`) map to backend
  status filters. The `자동 연결` tab is a client-side slice over `linked`
  with `resolutionSource = auto_legacy_code`.
- `이미지 동기화 데이터 점검` button rebuilds the queue from active Coupang
  listings that have `coupang-wing` master images via
  `sync-from-image-listings`. It must not pull ad, traffic, raw snapshot, or
  catalog-coverage rows into the queue.
- Manual link picks an active `ProductOption` from
  `/api/products/options` (existing endpoint). The backend creates the
  missing `ChannelListing` (and option) on confirm — no `MasterProduct`
  is ever created from a Coupang row.
- "제외" uses the shared `ConfirmDialog`. Re-link is allowed from the
  ignored tab so users can recover from accidental ignores.

## Cross-domain deps

- `@kiditem/shared/channel-reconciliation` — Zod types for items / summary
  / scan request/response.
- `@/app/(catalog)/products/options/lib/product-options-api` — existing
  product-option search endpoint (search by name / SKU / legacyCode).
