# web/sourcing-ai - Sourcing Discovery Workspace

`app/(sourcing-ai)/` owns AI-assisted sourcing discovery: keyword work,
category sourcing, market/competitor analysis, wholesale/1688 search,
recommendations, validation, final selection, Wing catalog support, and
sourcing settings. It reads and writes sourcing workflow APIs, not catalog
master data directly.

## Owned Surfaces

- Sourcing dashboard and keyword workflows
- 1688/new-product/search model API wrappers
- Recommendation and validation screens
- Operation-backed Wing, keyword, competitor, 1688, trend, validation, and
  tracking collection controls
- Final selection chat and sourcing interest tracking

## Data Flow

```text
snapshot read -> owner API/read model -> React Query
explicit CTA -> /api/operations start -> owner operation handler
browser handler -> KidItem OS claim -> fenced owner ingest
```

## State Rules

- Use `queryKeys.sourcing.*` for source candidate and scrape-url state when the
  data is shared beyond one component.
- Keep extension status/wake sync in global auth/extension helpers. Route code
  never imports retired direct collection helpers or waits on a provider promise.
- Keep ranking/matching/projection helpers pure and covered by focused tests.
- UI filters and selected rows are local state unless they affect backend
  queries.
- Mount, reload, navigation, filter change, and read effects start zero external
  collection. Only an explicit CTA calls the shared operation action.
- Keep the last persisted owner snapshot visible during active/failed runs; the
  shared operation hook invalidates the successful snapshot once. Product
  tracking uses the owner bulk history read, not per-product useQueries.

## Boundary Rules

- Do not create or mutate catalog master products directly from this group.
  Promotion belongs to backend sourcing/catalog APIs.
- Do not add silent model fallbacks. Missing model selection must remain an
  explicit error.
- Operations never owns sourcing or Ads canonical rows. UI operation results are
  safe status summaries; detailed rows always come from owner read APIs.
- Browser collection must stay aligned with the relevant extension AGENTS guide
  and accept only its claimed, fenced OperationRun.
