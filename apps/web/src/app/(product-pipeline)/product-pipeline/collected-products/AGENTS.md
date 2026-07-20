Consult this document first instead of relying on memorized knowledge.

# web/collected-products — Collected Product Workspace

`app/(product-pipeline)/product-pipeline/collected-products/` owns the collected
product workspace for imported/manual `SourcingCandidate` rows. It can create
account-scoped product-registration preparations, launch candidate-scoped
detail/thumbnail generation, and open the shared generated-content editor.

Shared editor, template render, preview sandbox, download modal, workspace
tabs/history/preview, inbox shells, hooks, and product-pipeline route builders
live under `product-pipeline/_shared/`.

## Owned Surfaces

- Collected candidate inbox
- Candidate detail route
- Candidate registration-preparation/rejection controls
- Candidate-scoped generated detail/thumbnail history links
- Candidate editor bridge into the shared generated-content editor

Do not reintroduce standalone sourcing or product-content routes.

## Data Ownership

- `SourcingCandidate` is the raw source/opportunity workspace.
- Candidate status is only `sourced|rejected`; registration progress must not
  be copied into candidate status.
- `ProductPreparation` owns account-scoped reviewed input and selected content;
  its submitting/failed/registered columns are legacy compatibility
  projections, not provider-side-effect authority.
- `ProductRegistrationExecution` owns the frozen request, actor, idempotency,
  provider outcome, reconciliation state, and terminal listing result. The UI
  retries or polls the same execution ID and must never turn an uncertain
  execution into a new create request.
- `ChannelListing` is the real registered marketplace identity. Registered
  products derive membership and navigation from listing/workspace existence.
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

The product registration-preparation button requires an explicit
`ChannelAccount` selection. It calls the canonical
`POST /api/sourcing/candidates/{id}/preparations` route with
`channelAccountId`, `displayName`, editable `registrationInput`, and selected
content IDs. The response is exactly `{ preparationId, status: 'draft' }`; it
never returns or creates a master.

Draft creation keeps the user in the candidate workspace and renders reviewed
input from `ProductPreparation` plus operation state from the authoritative
execution projection. A product appears in registered-products only after the
execution succeeds with a real `ChannelListing`; registered navigation uses the
listing/content-workspace identifiers.

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
- Do not silently fall back between candidate, preparation, listing,
  content-workspace, and generation identifiers.

## Change Coupling

- Generated-content href changes require checking product-pipeline route
  helpers, panel/toast alert hrefs, and server detail-page result hrefs.
- Editor save/load changes require checking the shared editor surface and AI
  detail-page endpoints together.
- Candidate registration-preparation/rejection changes require checking shared
  workspace headers and sourcing APIs together.

## Verification

For collected-products changes, run the narrow route suite first, then the web
build:

```bash
npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/collected-products'
```

Route href, editor bridge, registration-preparation, or deletion behavior
changes need a focused regression spec for the changed workspace contract.
