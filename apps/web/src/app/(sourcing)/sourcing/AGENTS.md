# web/sourcing — Source Candidate Workspace + Generated Content Editor

`/sourcing` is the canonical productization workspace. It starts from
`SourcingCandidate`, can promote a candidate into `MasterProduct`, shows content
generated from the candidate, and opens the GrapesJS detail-page editor for
`ContentGeneration` rows. Do not reintroduce `/product-content`; generated
content navigation belongs under `/sourcing`.

## Subroute Map

```text
sourcing/
├── page.tsx                                  # source candidate list/workspace entry
├── [id]/page.tsx                            # candidate detail and generated content links
├── [id]/editor/page.tsx                     # candidate-scoped editor bridge
├── detail-pages/[generationId]/editor/page.tsx
│                                             # unscoped ContentGeneration editor
├── [id]/editor/components/                  # GrapesJS editor surface
├── components/list/, detail/
├── hooks/
└── lib/
    ├── sourcing-api.ts
    ├── sourcing-routing.ts                  # canonical sourcing editor hrefs
    ├── template-html.tsx
    └── preview-sandbox.ts
```

## Data Ownership

- `SourcingCandidate` is the raw source/opportunity workspace.
- `MasterProduct` means the candidate has been promoted into inventory/catalog
  product state.
- `ContentGeneration` is the source of truth for generated detail pages and
  generated/edited images.
- Candidate-scoped generated content must link to
  `/sourcing/{candidateId}/editor?generationId={contentGenerationId}`.
- Product-less generated content must link to
  `/sourcing/detail-pages/{contentGenerationId}/editor`.

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

- No `/product-content` route, sidebar entry, or new href.
- No direct DB access from frontend.
- No editor localStorage persistence.
- No server upload from the generic image picker; uploaded picker files remain
  base64/client-side unless the owning flow explicitly persists them.
- No silent fallback between candidate id, master id, and generation id. Use
  `lib/sourcing-routing.ts` for route construction.

## Together Map

| Change | Also Check |
|---|---|
| Generated-content href | `lib/sourcing-routing.ts`, panel/toast alert hrefs, server `detailPageResultHref` |
| Detail-page editor save/load | `[id]/editor/components/ContentGenerationEditorSurface.tsx`, backend `ai/detail-page` endpoints |
| Candidate promotion/rejection | `components/detail/ProductEditHeader.tsx`, server sourcing candidate APIs |
| Generated content list for candidate | `[id]/components/LinkedProducedContentPanel.tsx`, `GET /api/ai/content-archive/sourcing/:candidateId` |
| Template render/sandbox | `lib/template-html.tsx`, `lib/preview-sandbox.ts` |
