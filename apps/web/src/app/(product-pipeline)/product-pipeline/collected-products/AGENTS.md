# web/product-pipeline/collected-products — Collected Product Workspace

`/product-pipeline/collected-products` is the collected product workspace for
1688/imported `SourcingCandidate` rows. It can promote a candidate into
`MasterProduct`, can launch candidate-scoped detail/thumbnail generation, and
opens the GrapesJS detail-page editor for `ContentGeneration` rows backed by
detail-page artifacts/revisions. Do not reintroduce user-facing `/sourcing` or
`/product-content` routes.

## Subroute Map

```text
product-pipeline/collected-products/
├── page.tsx                                  # collected candidate inbox
├── [id]/page.tsx                             # candidate detail route shell
├── [id]/editor/page.tsx                      # candidate-scoped editor bridge
├── components/list/
└── lib/
    ├── sourcing-api.ts
    ├── registration-selection.ts
    └── generation-progress-label.ts
```

Shared detail-page editor, template render, preview sandbox, download modal,
product workspace screen/tabs/history/preview, inbox shells, hooks, and
product-pipeline route constructors live under `product-pipeline/_shared/`
because collected and registered products both use them.

## Data Ownership

- `SourcingCandidate` is the raw source/opportunity workspace.
- `MasterProduct` means the candidate has been promoted into inventory/catalog
  product state.
- `ContentGeneration` is the source of truth for generation request/result
  snapshots and direct candidate lineage.
- `DetailPageArtifact` + `DetailPageRevision` are the source of truth for saved
  editor HTML versions.
- `ContentAsset` + `ContentGenerationAssetUsage` are the source of truth for
  generated/edited images.
- Collected product cards are imported sourcing candidates plus manual product
  registration candidates (`sourcePlatform='KIDITEM_PRODUCT_REGISTRATION'`).
- Product-less detail-page generation is a transitional direct-detail shell. It
  must not create or represent a collected-product `SourcingCandidate`; its
  durable home is expected to move inside the product workspace.
- Manual product registration creates a `SourcingCandidate` and its generated
  detail pages stay visible from the collected product workspace.
- Thumbnail editor/generation results alone must not create collected or
  registered inbox cards.
- Generated detail pages link to the shared editor route
  `/product-pipeline/detail-pages/{contentGenerationId}/editor`.
- Candidate-scoped links add `sourceCandidateId` and `returnTo`; registered
  workspace links add `returnTo`.
- Use `_shared/lib/product-pipeline-routes.ts` for detail-page editor route
  construction. Do not put registered-product editor helpers back under
  `collected-products`.
- Deleting a collected product card means archiving the whole source-candidate
  workspace. The frontend calls `DELETE /api/sourcing/candidates/{id}` and then
  invalidates sourcing/detail/thumbnail history queries; it must not call
  product-master delete APIs for source candidate cards.

## Editor Contract

`DetailPageEditor.tsx` is a large legacy GrapesJS component. Keep edits scoped
and prefer small surrounding components/hooks for new behavior.

- Storage is disabled (`storageManager: false`); persistence is handled by the
  parent route through backend APIs.
- Save generated detail-page edits through
  `POST /api/ai/detail-page/{contentGenerationId}/edited-html`.
- Keep old `/api/products/{id}/preview` editor helpers working only where the
  candidate/product id is available; do not make them the generated-content
  source of truth.
- Do not add substantial behavior to the editor file without a split plan.

## Hard Bans

- No user-facing `/sourcing` or `/product-content` route, sidebar entry, or new
  href.
- No ownerless "direct generated content" tab inside collected products, and no
  collected-product card for product-unbound detail-page output.
- No direct DB access from frontend.
- No editor localStorage persistence.
- No server upload from the generic image picker; uploaded picker files remain
  base64/client-side unless the owning flow explicitly persists them.
- No silent fallback between candidate id, master id, and generation id.

## Together Map

| Change | Also Check |
|---|---|
| Generated-content href | `_shared/lib/product-pipeline-routes.ts`, panel/toast alert hrefs, server `detailPageResultHref` |
| Detail-page editor save/load | `_shared/components/detail-editor/ContentGenerationEditorSurface.tsx`, backend `ai/detail-page` endpoints |
| Candidate promotion/rejection | `_shared/components/workspace/detail/ProductEditHeader.tsx`, server sourcing candidate APIs |
| Generated content list for candidate | `_shared/components/workspace/GenerationHistoryTab.tsx`, `GET /api/ai/content-archive/sourcing/:candidateId` |
| Template render/sandbox | `_shared/lib/template-html.tsx`, `_shared/lib/preview-sandbox.ts` |

## Registration Selection

The product registration button uses the existing
`POST /api/sourcing/candidates/{id}/promote` command. Pass the current primary
thumbnail URL and, when the operator applied an Agent detail-page history row,
the selected `ContentGeneration.id`; the server resolves that to
`DetailPageArtifact`/`DetailPageRevision` inside the promotion transaction. Do
not persist this as a separate registration draft from the frontend.
