Consult this document first instead of relying on memorized knowledge.

# web/product-pipeline - Sourcing Content Pipeline

`app/(product-pipeline)/` owns the product content pipeline UI: collected
products, registered products, content workspaces, detail-page generation,
detail editing, thumbnail analysis, and thumbnail generation. It coordinates
backend AI/content APIs but does not own the model prompts or durable generation
state.

## Owned Surfaces

- Collected product workspace and raw-data projections
- Content workspace tabs for product, thumbnail, and detail-page work
- Detail-page generation, preview, editor, and history views
- Thumbnail analysis, batch analysis, tracking, sync, and generation flows
- Channel listing confirmation and registration handoff views

## Data Flow

```text
React Query + apiClient
  -> /api/sourcing/*
  -> /api/ai/*
  -> /api/thumbnail-analysis/*
  -> /api/thumbnail-editor/*
  -> /api/channels/listings/*
```

## State Rules

- Route-specific generation hooks own polling with `refetchInterval`; do not use
  `setInterval`.
- Shared product-pipeline helpers live in `product-pipeline/_shared/` only while
  they are used by multiple product-pipeline routes.
- Prefer tested pure helpers for payload assembly, route builders, HTML
  preview/sandbox logic, and status projections.
- Large editors must be split by pure helpers, presentational components, hooks,
  and orchestration before adding substantial behavior.

## Boundary Rules

- Do not add Canvas/image transforms to thumbnail-generation unless the backend
  DTO and route contract are updated together.
- Upload and generation payload changes require checking frontend request
  builders, backend DTOs, and shared schemas together.
- Do not move product-pipeline helpers to global `src/lib` unless another route
  group imports them.
- Generated detail/thumbnail history is backend-owned; local UI selection state
  is not a source of truth.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline'
```
