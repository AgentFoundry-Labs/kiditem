Before working in this directory, always read this document first rather than relying on memory.

# web/collected-products — Collected Product Workspace

`app/(product-pipeline)/product-pipeline/collected-products/` owns the collected
product workspace for imported/manual `SourcingCandidate` rows. Each collected
candidate has a `SalesProduct` draft from the moment of collection (ADR-0022) — the workspace resolves (creates or reuses) an account-scoped
`RegistrationTarget` for that draft, launches content-workspace-scoped
detail/thumbnail generation, and opens the shared generated-content editor.

Shared editor, template render, preview sandbox, download modal, workspace
tabs/history/preview, inbox shells, hooks, and product-pipeline route builders
live under `product-pipeline/_shared/`.

## Owned Surfaces

- Collected candidate inbox
- Candidate detail route
- Candidate rejection controls and draft registration-target resolution
- Content-workspace-scoped generated detail/thumbnail history links
- Candidate editor bridge into the shared generated-content editor

Do not reintroduce standalone sourcing or product-content routes.

## Data Ownership

- `SourcingCandidate` is the raw source/opportunity workspace.
- Candidate status is only `sourced|rejected`; registration progress must not
  be copied into candidate status.
- `SalesProduct` (status `draft` until a sell decision issues its KID) owns
  the reviewed input directly — name, pricing, options, media, and mall
  defaults all live on it from collection onward (ADR-0022).
  `RegistrationTarget` owns the resolved per-`ChannelAccount` registration
  setting (options/price/category frozen at prepare time); at most one active
  target exists per (`SalesProduct`, `ChannelAccount`) pair.
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

The registration button requires an explicit `ChannelAccount` selection and
resolves (creates or reuses) that pair's `RegistrationTarget` through
`POST /api/channels/registration-targets/resolve` with `{ salesProductId,
channelAccountId }` (`registrationTargetApi.resolve`, ADR-0022).
Because the server caps active targets at one per (`SalesProduct`,
`ChannelAccount`) pair, resolving is idempotent — pressing it again on an
already-resolved pair reuses the same target instead of creating a duplicate,
and the server answers a genuine conflict with 409. There is no separate
preparation draft and no `{ preparationId, status }` response to render; the
resolved target's id stands in for the old preparation id.

A product appears in registered-products only after a registration execution
succeeds with a real `ChannelListing`; registered navigation uses the
listing/content-workspace identifiers.

## Mall Bulk Sheet

[몰 대량등록] opens the shared mall bulk-sheet dialog directly with the
`salesProductId` each selected card already carries (ADR-0022) — a
candidate's sales-product draft exists from collection, so there is no
from-candidates conversion call. Cards without a linked `salesProductId`
(not yet a draft) are skipped with a toast; it never changes candidate status.

## Boundary Rules

- Deleting a collected card calls `DELETE /api/sourcing/candidates/{id}` and
  invalidates sourcing/detail/thumbnail history queries; it must not call
  product-master delete APIs.
- Thumbnail-only results must not create collected or registered inbox cards.
- Product-less direct detail output must not appear as a collected-product card.
- No editor localStorage persistence; GrapesJS storage is disabled.
- Uploaded generic picker files remain base64/client-side unless the owning
  flow explicitly persists them.
- Do not silently fall back between candidate, sales-product,
  registration-target, listing, content-workspace, and generation identifiers.
- Deleting a candidate with a linked `SalesProduct` draft retires that draft
  server-side; the delete response's `draftRetired`/`draftWarning` fields say
  so — do not re-derive that decision on the client.

## Change Coupling

- Generated-content href changes require checking product-pipeline route
  helpers, panel/toast alert hrefs, and server detail-page result hrefs.
- Editor save/load changes require checking the shared editor surface and AI
  detail-page endpoints together.
- Candidate registration-target-resolution/rejection changes require checking
  shared workspace headers and sourcing APIs together.

## Regression Focus

Route href, editor bridge, registration-target-resolution, or deletion
behavior changes need a focused regression spec for the changed workspace
contract.
