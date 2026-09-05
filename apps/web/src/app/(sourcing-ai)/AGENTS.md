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
- Operation-backed Wing, keyword, competitor, validation, and tracking
  collection controls, plus direct 1688 source-owner refresh controls
- Final selection chat and sourcing interest tracking

## Data Flow

```text
snapshot read -> owner API/read model -> React Query
explicit 1688 CTA -> KidItem OS action -> source owner begin/terminal
other explicit CTA -> /api/operations start -> owner operation handler
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
  collection. Only an explicit CTA calls a shared operation action or its
  source-specific extension helper.
- Keep the last persisted owner snapshot visible during active/failed runs.
  Owner status polling invalidates direct-source snapshots after COMPLETE;
  Product tracking uses the owner bulk history read, not per-product useQueries.

## Boundary Rules

- Do not create or mutate catalog master products directly from this group.
  Promotion belongs to backend sourcing/catalog APIs.
- Do not add silent model fallbacks. Missing model selection must remain an
  explicit error.
- Operations never owns sourcing or Ads canonical rows. UI operation results are
  safe status summaries; detailed rows always come from owner read APIs.
- Browser collection must stay aligned with the relevant extension AGENTS guide.
  The 1688 refresh page calls the extension only; it does not begin or expose a
  source attempt/token itself.
