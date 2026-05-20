# web/collected-products — Collected Product Workspace

`app/(product-pipeline)/product-pipeline/collected-products/` owns the collected
product workspace for imported/manual `SourcingCandidate` rows. It can promote
a candidate into `MasterProduct`, launch candidate-scoped detail/thumbnail
generation, and open the shared generated-content editor.

## Folder Map

```text
collected-products/
├── page.tsx                                  # candidate inbox
├── [id]/page.tsx                             # candidate detail shell
├── [id]/editor/page.tsx                      # candidate-scoped editor bridge
├── components/list/
└── lib/
    ├── sourcing-api.ts
    ├── registration-selection.ts
    └── generation-progress-label.ts
```

Shared editor, template render, preview sandbox, download modal, workspace
tabs/history/preview, inbox shells, hooks, and product-pipeline route builders
live under `product-pipeline/_shared/`.

## Owned Surfaces

- Collected candidate inbox
- Candidate detail route
- Candidate promotion/rejection controls
- Candidate-scoped generated detail/thumbnail history links
- Candidate editor bridge into the shared generated-content editor

Do not reintroduce user-facing `/sourcing` or `/product-content` routes.

## Data Ownership

- `SourcingCandidate` is the raw source/opportunity workspace.
- `MasterProduct` means the candidate has been promoted into catalog state.
- A promoted candidate remains collected until its master has an active
  `ChannelListing`; registered products list marketplace listings.
- `ContentGeneration` stores generation request/result snapshots and candidate
  lineage.
- `DetailPageArtifact` + `DetailPageRevision` store saved editor HTML versions.
- `ContentAsset` + `ContentGenerationAssetUsage` store generated/edited images.
- Manual product registration creates a `SourcingCandidate`; product-less direct
  detail generation does not.

## Editor Flow

```text
candidate workspace
  -> generated detail-page history row
  -> /product-pipeline/detail-pages/{contentGenerationId}/editor
  -> shared ContentGenerationEditorSurface
  -> POST /api/ai/detail-page/{contentGenerationId}/edited-html
```

Use `_shared/lib/product-pipeline-routes.ts` for route construction. Candidate
links include `sourceCandidateId` and `returnTo`; registered workspace links
include `returnTo`.

## Registration Flow

The product registration button calls
`POST /api/sourcing/candidates/{id}/promote` with the selected thumbnail URL
and, when applied, the selected `ContentGeneration.id`. The server resolves
that selection to `DetailPageArtifact`/`DetailPageRevision` inside the
promotion transaction and persists it in `ProductPreparation`.

## Boundary Rules

- Deleting a collected card calls `DELETE /api/sourcing/candidates/{id}` and
  invalidates sourcing/detail/thumbnail history queries; it must not call
  product-master delete APIs.
- Thumbnail-only results must not create collected or registered inbox cards.
- Product-less direct detail output must not appear as a collected-product card.
- No direct DB access from frontend.
- No editor localStorage persistence; GrapesJS storage is disabled.
- Uploaded generic picker files remain base64/client-side unless the owning
  flow explicitly persists them.
- Do not silently fall back between candidate id, master id, and generation id.

## Change Coupling

- Generated-content href changes require checking product-pipeline route
  helpers, panel/toast alert hrefs, and server detail-page result hrefs.
- Editor save/load changes require checking the shared editor surface and AI
  detail-page endpoints together.
- Candidate promotion/rejection changes require checking shared workspace
  headers and sourcing APIs together.
