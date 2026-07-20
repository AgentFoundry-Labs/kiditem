Consult this document first instead of relying on memorized knowledge.

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
  between product, source candidate, content workspace, and generation ids.
- Thumbnail ownership uses `contentWorkspaceId`; `sourceCandidateId` remains
  provenance and `channelListingId` remains the marketplace listing identity.

## Boundary Rules

- Do not add route-specific UI copy or one-off panels here.
- Do not make generated content history a local source of truth.
- Large editor behavior belongs in smaller helpers/components before adding new
  orchestration.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(product-pipeline\)/product-pipeline/_shared
```
