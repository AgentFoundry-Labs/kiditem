Consult this document first instead of relying on memorized knowledge.

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
- Extension-backed Wing catalog and keyword collection helpers
- Final selection chat and sourcing interest tracking

## Data Flow

```text
React Query + route-local lib helpers
  -> /api/sourcing/*
  -> /api/sourcing-agent/*
  -> sourcing/wing extension bridges where documented
```

## State Rules

- Use `queryKeys.sourcing.*` for source candidate and scrape-url state when the
  data is shared beyond one component.
- Keep extension session sync in global auth/extension helpers; route code calls
  focused sourcing extension wrappers.
- Keep ranking/matching/projection helpers pure and covered by focused tests.
- UI filters and selected rows are local state unless they affect backend
  queries.

## Boundary Rules

- Do not create or mutate catalog master products directly from this group.
  Promotion belongs to backend sourcing/catalog APIs.
- Do not add silent model fallbacks. Missing model selection must remain an
  explicit error.
- Extension-backed browser collection must stay aligned with the relevant
  extension AGENTS guide.
