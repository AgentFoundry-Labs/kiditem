# Thumbnail ContentWorkspace Contract Design

## Goal

Make `ContentWorkspace.id` the canonical identity for thumbnail analysis,
generation, editing, and registration flows. Remove the transitional
`productId` and `masterId` aliases that currently carry a
`ContentWorkspace.id` while preserving identifiers that genuinely refer to a
`MasterProduct`, `SourceCandidate`, `ChannelListing`, or generation ledger row.

## Scope

This reconstruction covers the AI thumbnail bounded context and its web/shared
contracts:

- thumbnail analysis requests and responses;
- thumbnail generation list, editor, polling, selection, and apply flows;
- registered-product and collected-product thumbnail workspace links;
- Wing thumbnail registration lookup;
- thumbnail performance tracking responses;
- shared Zod/TypeScript contracts used by server and web.

Inventory, Sellpia matching, procurement, and other domains that genuinely use
`MasterProduct.id` keep `masterId` unchanged.

## Canonical identifiers

| Meaning | Canonical field |
|---|---|
| Thumbnail content owner | `contentWorkspaceId` |
| Collected-product provenance | `sourceCandidateId` |
| Marketplace listing used for registration/tracking | `channelListingId` |
| Thumbnail generation ledger row | `generationId` |
| Inventory/catalog master outside AI | `masterId` |

The AI thumbnail module must not describe a `ContentWorkspace` as a master
product. Public requests, public responses, server application ports, repository
adapters, web URL parameters, React Query keys, and UI state all use the same
identifier vocabulary.

## Public contract

The change is intentionally immediate and breaking:

- `productId` and `productIds` that carry workspace IDs become
  `contentWorkspaceId` and `contentWorkspaceIds`;
- `masterId` aliases on thumbnail generation rows become
  `contentWorkspaceId`;
- `ThumbnailGenerationItem.product` becomes `contentWorkspace`;
- `ThumbnailTrackingRecord.productId`, which currently carries a listing ID,
  becomes `channelListingId`;
- product-pipeline URLs use `contentWorkspaceId` and no longer emit
  `productId` for thumbnail ownership;
- no compatibility aliases are returned or accepted.

Removed request keys must fail with `400 Bad Request`. They must not be silently
removed by NestJS whitelist validation and accidentally turn into a direct
upload request.

## Subject model and data flow

Thumbnail requests have exactly three supported entry paths:

1. `contentWorkspaceId`
   - verify an active, non-deleted workspace owned by the active organization;
   - use workspace name, category, selected thumbnail, and source media;
   - persist and return the same `contentWorkspaceId`.
2. `sourceCandidateId`
   - verify the candidate belongs to the active organization;
   - resolve its active workspace or create one;
   - keep `sourceCandidateId` as provenance and return the resolved
     `contentWorkspaceId` as the canonical generated-content identity.
3. Direct upload
   - when neither owner ID is present, create a direct content workspace;
   - return the new `contentWorkspaceId` and `generationId`.

`contentWorkspaceId` and `sourceCandidateId` are mutually exclusive request
subjects. A request containing both fails with `400 Bad Request`.

## Backend naming

Use workspace terminology throughout the thumbnail module. The required
renames include:

- `findProductForEditor` -> `findWorkspaceForThumbnailEditor`;
- `findJobMaster` -> `findWorkspaceForThumbnailJob`;
- `findJobMastersByIds` -> `findWorkspacesForThumbnailJobs`;
- `findGenerationMaster(s)` -> `findGenerationWorkspace(s)`;
- `ThumbnailGenerationJobMasterRow` ->
  `ThumbnailGenerationWorkspaceContext`;
- `resolveMasterThumbnailImage` -> `resolveWorkspaceThumbnailSource`;
- `findRegistrableMaster` -> `findRegistrableWorkspace`;
- `findFirstListingForMaster` -> `findChannelListingForWorkspace`.

The repository layer returns Prisma's existing `contentWorkspaceId` directly.
It must not add a `masterId` projection.

## Error behavior

- removed `productId`, `productIds`, or `masterId` request fields: `400`;
- multiple subject identifiers: `400`;
- missing or foreign-organization workspace/candidate/listing: `404`;
- workspace/direct-upload request without usable image input: `400`;
- missing selected generation image during registration: `404`;
- registration without a workspace-owned channel listing: `400` or `404`
  according to whether the workspace exists but is ineligible, or does not
  exist.

All single-resource queries remain scoped by `{ id, organizationId }`.

## Web behavior

The visual UI and user workflow remain unchanged. Only the contract vocabulary
and identity plumbing change:

- request builders send `contentWorkspaceId`;
- response maps and sets key by `contentWorkspaceId`;
- editor and registered-product URLs use `contentWorkspaceId`;
- collected products continue to enter through `sourceCandidateId`;
- polling and recovery reconnect to a generation through `generationId` plus
  the canonical workspace ID.

## Data, migration, and release

No Prisma schema migration or data backfill is required. The persisted
`ThumbnailGeneration` relation already uses required `contentWorkspaceId`, and
thumbnail analysis already persists `contentWorkspaceId`.

`VERSION` remains unchanged. This PR changes application contracts and names
without changing persisted schema or data behavior. The PR body must state that
there is no DB migration or backfill and explain why the current version remains
valid.

## Verification

Tests must cover:

- workspace-bound analysis, generation, candidate selection, and apply;
- candidate-bound generation resolving or creating a workspace;
- direct upload creating a workspace;
- removed request keys returning `400`;
- foreign-organization workspace access returning `404`;
- generation and analysis responses joining on `contentWorkspaceId`;
- Wing registration resolving the workspace-owned `ChannelListing`;
- tracking responses returning `channelListingId`;
- product-pipeline URLs, refresh recovery, and polling using
  `contentWorkspaceId`.

Final gates are the focused shared/server/web tests, shared/server/web builds,
NestJS boot, stale-vocabulary search, and browser smoke coverage of the
thumbnail dashboard and registered-product thumbnail workspace.
