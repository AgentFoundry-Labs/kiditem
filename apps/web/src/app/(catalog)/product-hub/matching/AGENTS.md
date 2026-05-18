# product-hub/matching — Coupang to KidItem Matching

`app/(catalog)/product-hub/matching/` owns the UI for triaging Coupang Wing rows
that the channels backend has not auto-linked to `MasterProduct` /
`ProductOption`. The UI consumes `/api/channels/reconciliation/coupang/*`.

## Owned Surfaces

- Reconciliation queue tabs
- Manual link flow to an active `ProductOption`
- Ignore/re-link flow
- Image-sync-data queue rebuild button

## Data Flow

```text
React Query + apiClient
  -> /api/channels/reconciliation/coupang/*
  -> queue tabs and detail actions
  -> backend creates/updates ChannelListing links
```

## State Rules

- Tabs map to backend status filters.
- The `자동 연결` tab is a client-side slice over `linked` with
  `resolutionSource = auto_legacy_code`.
- Manual link searches active product options through
  `/api/products/options`.
- Ignore uses the shared `ConfirmDialog`; re-link is allowed from the ignored
  tab.

## Cross-Domain Dependencies

- `@kiditem/shared/channel-reconciliation` provides item, summary, and scan
  request/response schemas.
- `@/app/(catalog)/products/options/lib/product-options-api` provides product
  option search.

## Boundary Rules

- All API calls go through `apiClient` + React Query.
- Do not send `organizationId`; backend session scope owns it.
- The sync-from-image-listings button rebuilds only from active Coupang
  listings with `coupang-wing` master images.
- Do not pull ad, traffic, raw snapshot, or catalog-coverage rows into the
  reconciliation queue.
- Backend may create missing `ChannelListing`/option links on confirm; no
  `MasterProduct` is ever created from a Coupang row here.
