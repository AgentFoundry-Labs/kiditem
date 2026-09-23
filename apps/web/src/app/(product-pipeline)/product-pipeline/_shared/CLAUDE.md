Before working in this directory, always read this document first rather than relying on memory.

# web/product-pipeline/_shared - Pipeline Shared UI and Helpers

`product-pipeline/_shared/` owns code reused by multiple product-pipeline
routes: workspace screens, detail editor pieces, thumbnail/detail generation
hooks, route builders, preview helpers, and content workspace API wrappers.

## State Rules

- Keep helpers here only while they are product-pipeline-shared. Move to
  global `src/lib` only when another route group imports them.
- Use React Query hooks for backend state and `refetchInterval` for polling.
- Keep preview/sandbox/route/status helpers pure and covered by focused tests.
- Content workspace and generation identity must preserve the distinction
  between product, sales product, content workspace, and generation ids.
- Thumbnail ownership and history scoping use only `contentWorkspaceId`
  (KID-310) — do not reintroduce `sourceCandidateId` as a query/ownership
  parameter; it remains row-level provenance only. `channelListingId` remains
  the marketplace listing identity.

## Boundary Rules

- Do not add route-specific UI copy or one-off panels here.
- Do not make generated content history a local source of truth.
- Large editor behavior belongs in smaller helpers/components before adding new
  orchestration.
