Before working in this directory, always read this document first rather than relying on memory.

# web/sourcing-ai - Sourcing Discovery Workspace

`app/(sourcing-ai)/` owns AI-assisted sourcing discovery: keyword work,
category sourcing, market/competitor analysis, wholesale/1688 search,
recommendations, validation, final selection, Wing catalog support, and
sourcing settings. It reads and writes sourcing owner APIs, not catalog
master data directly.

## Data Flow

```text
snapshot read -> owner API/read model -> React Query
explicit collection CTA -> extension operation.start{kind, scope} -> GET /api/operations
explicit collection CTA (server-run source) -> owner begin/terminal
explicit persisted-fact calculation CTA -> owner command
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
  collection. Only an explicit CTA calls the source-specific owner or
  extension helper; persisted-fact calculations do not collect sources.
- Keep the last persisted owner snapshot visible during active/failed runs.
  Owner status polling invalidates direct-source snapshots after COMPLETE;
  Product tracking uses the owner bulk history read, not per-product useQueries.

## Boundary Rules

- Do not create or mutate catalog master products directly from this group.
  Promotion belongs to backend sourcing/catalog APIs.
- Do not add silent model fallbacks. Missing model selection must remain an
  explicit error.
- Read detailed rows and source status from the owning domain API. Extension
  responses carry correlation and progress, not canonical data for UI storage.
- Browser collection kinds (`sourcing.*`, KID-360) go through
  `sourcing-ai/lib/sourcing-operations.ts`: the page asks the extension to start
  and reads the operations list; it never begins an operation or holds its
  token. Wing search runs on the organization's primary Coupang account.
