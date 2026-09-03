# Coupang Wing Full Catalog Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import every parent product, sellable option, and provider image from an authenticated Coupang Wing tab into account-scoped KidItem listings without an Excel export, while supporting durable resume and immediate registered-product visibility.

**Architecture:** Browser collection is staged in Channels-owned `ChannelScrapeRun` and `ChannelScrapeChunk` rows. A complete validated collection is canonically hashed and handed to the existing `SourceImportRun`-fenced catalog publisher; publication atomically updates listings/options and invokes an AI-owned transaction-aware capability that creates listing workspaces and provider assets. Image bytes are copied to managed storage after commit by a durable per-asset lease worker, while the external URL remains usable immediately.

**Tech Stack:** Chrome Manifest V3, plain JavaScript content/service-worker scripts, Zod, TypeScript, NestJS hexagonal modules, Prisma v7/PostgreSQL, React Query, Next.js App Router, Vitest, Node test runner, Testcontainers.

## Global Constraints

- This work ships inside root `VERSION` `0.1.8`; do not bump to `0.1.9`.
- Do not read, copy, stage, rename, or depend on Excel files under `docs/references/`.
- Preserve all current user worktree changes outside files explicitly named by a task.
- Prefix every shell command with `rtk` and use `apply_patch` for source edits.
- The extension never receives `organizationId`, database credentials, Coupang credentials, or cookies. NestJS authentication resolves the organization; the selected `ChannelAccount` supplies the marketplace boundary.
- `ChannelListing` is the Coupang parent identity and `ChannelListingOption` is the sellable SKU identity. Never create or infer `MasterProduct` or `ChannelSkuComponent` rows from Wing names, images, barcodes, or option IDs.
- Partial collection never changes the live catalog. Only a successfully validated complete snapshot may inactivate unseen listings, options, or provider assets.
- Preserve listing/option UUIDs, confirmed component recipes, source-candidate provenance, manual/generated thumbnail selections, detail-page history, and KidItem-authored operational fields.
- `SourceImportRun.fileName` remains a legacy database column. Browser publication stores the literal provenance label `browser-extension:coupang-wing:v1` in `source_import_runs.file_name`; no JSON file is created or written to disk.
- Actual resumable browser payloads live in `channel_scrape_chunks.payload` as bounded JSONB. `SourceImportRun.fileHash` stores the SHA-256 of the canonical completed snapshot; canonical rows live in `ChannelListing`, `ChannelListingOption`, `ContentWorkspace`, and `ContentAsset`.
- Use validated `String` status values instead of Prisma/PostgreSQL enums.
- Do not add substantial behavior to the existing 1,836-line extension service worker, 691-line channel catalog repository, or 904-line registration content repository. New behavior goes into focused files.
- Default to React Query polling. Do not add SSE, WebSocket, Agent OS runs, a generic queue framework, or a generic provider-import framework.
- The classic MV3 service worker may split local packaged code with `importScripts()`; do not convert the whole extension to ES modules in this feature.

---

## Current-Code Corrections

The source design remains authoritative for product behavior, completeness, tenancy, and failure semantics, with these implementation corrections locked by the 2026-07-14 code review:

| Original design detail | Current-code implementation authority |
|---|---|
| Generalize `SourceImportRun` for browser collection and add `SourceImportChunk` | Keep `SourceImportRun` as the final publication fence. Reuse `ChannelScrapeRun` and add `ChannelScrapeChunk` for browser collection. |
| Add `ContentWorkspaceAsset` | Do not add it. Use the existing `ContentGenerationGroup(groupType='workspace_assets') -> ContentAsset` ownership path with a workspace-scoped asset key. |
| Convert registered products from legacy groups to `ChannelListing` | Already complete. Add only account selection, import controls, progress, and query invalidation. |
| Remove the old backend image-sync path after replacement | Backend path is already deleted. Remove the remaining dead frontend hook/components/query keys after the replacement UI exists. |
| Account-scoped publication sequence | Keep the existing organization/source publication sequence. It is provenance ordering only. |
| Account-scoped publication lock | Add `channelAccountId` to the existing advisory-lock key so different Coupang accounts can finalize independently. |
| Reuse the current raw publisher without a safety boundary | Preserve its current one-to-one parent column mapping with a PostgreSQL characterization test, then extract focused publication persistence from the 691-line adapter before adding cross-domain media writes. |

Source design:

- [Coupang Wing full catalog snapshot design](/Users/yhc125/workspace/kiditem/docs/superpowers/specs/2026-07-13-coupang-wing-full-catalog-snapshot-design.md)

## Plan Set and Execution Order

Execute these plans in order. Each plan ends at a buildable, reviewable checkpoint and must be merged into the same `0.1.8` feature branch before the final live acceptance run.

1. [Durable collection and extension adapter](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-07-14-coupang-wing-catalog-collection.md)
2. [Atomic publication, listing media, and materialization](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-07-14-coupang-wing-catalog-publication-media.md)
3. [Registered-products UI, legacy cleanup, and acceptance](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-07-14-coupang-wing-catalog-ui-acceptance.md)

## Fixed Data Flow

```text
registered-products + selected Coupang ChannelAccount
  -> POST browser collection run by clientRunKey
  -> extension drives authenticated Wing tab
  -> exact discovery pages + bounded product-detail chunks
  -> ChannelScrapeRun + ChannelScrapeChunk JSONB
  -> POST finalize
  -> server completeness validation + canonical SHA-256
  -> SourceImportRun(fileName=browser-extension:coupang-wing:v1, fileHash=snapshotHash)
  -> one publication transaction
       -> ChannelListing / ChannelListingOption upsert + absence handling
       -> listing ContentWorkspace / workspace_assets / ContentAsset attach
       -> initial provider-primary thumbnail selection
       -> SourceImportRun completed
  -> registered-products query invalidation
  -> durable ContentAsset materialization leases
       -> external source URL fetch
       -> managed object storage save
       -> same ContentAsset.url moves to managed URL
```

## Fixed HTTP Contract

The existing workbook endpoint remains compatible:

```text
POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing
multipart: file
```

Browser collection adds:

```text
POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs
body: { clientRunKey: <uuid>, collectorVersion: <nonblank string> }

GET /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs/:runId

PUT /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs/:runId/chunks/:kind/:sequence
body: { checksum: <sha256>, itemCount: <nonnegative int>, payload: <versioned chunk> }

POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs/:runId/errors
body: { code: <nonblank string>, message: <bounded string>, phase: <collection phase> }

POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs/:runId/finalize
body: { snapshotHash: <sha256> }
```

`PUT` is idempotent for the same `(runId, kind, sequence, checksum)` and returns `409` when the same chunk key is replayed with a different checksum. Completed/failed publication runs reject new chunks. Collection/authentication interruptions leave a `running` run resumable.

## Fixed Browser Message Contract

```text
ping
  capabilities.coupangFullCatalog = true

startCoupangCatalogImport
  { channelAccountId, runId }

getCoupangCatalogImportStatus
  { runId }

cancelCoupangCatalogImport
  { runId }
```

The service worker writes browser-only progress to `chrome.storage.local`; server run/chunk state remains the canonical resume source.

## Import and Materialization State

### Browser collection

- `ChannelScrapeRun.status`: `running | completed | failed`.
- `metaJson.phase`: `discovery | hydration | ready_to_finalize | publishing | finished`.
- `metaJson.manifest`: expected item/page counts, page size, first-page fingerprint, collector version.
- `errorJson`: structured recoverable/terminal diagnostics.

### Final publication

- `SourceImportRun.status`: existing `running | completed | failed` contract.
- Browser artifact label: `browser-extension:coupang-wing:v1`.
- Browser `fileHash`: canonical normalized parent/option/media SHA-256; raw diagnostics and collection metadata are excluded.
- Same account + same hash returns the existing completed run with zero changes.

### Provider assets

- `ContentAsset.url` is immediately the normalized external URL.
- `ContentAsset.sourceUrl` permanently retains that external URL after materialization.
- `materializationStatus`: `pending | ready | failed`, nullable for unrelated assets.
- Lease columns prevent two server instances from copying the same asset concurrently.
- Failed materialization preserves the external `url`, records a bounded error, and retries only that asset.

## Acceptance Baseline

The observed `1,227` parents and `25` pages are diagnostic evidence, not constants. A live run must prove its current manifest.

- Every discovery page is stored exactly once and every discovered parent has one valid hydrated product record.
- The server rejects duplicate parent IDs, duplicate SKU IDs, SKU-to-parent conflicts, missing SKU identity, invalid media ownership, or snapshot-hash mismatch.
- A complete snapshot creates/updates every observed listing and option and inactivates unseen rows only after successful validation.
- Every published listing has one active listing-owned workspace.
- Every valid provider image is available through that workspace immediately after publication, before managed-storage copying finishes.
- Existing manual/generated thumbnail selection is preserved. A new listing, or a listing still using the prior provider-primary asset, selects the new primary provider asset.
- Closing Chrome or interrupting the network and restarting with the same client run key uploads only missing chunks.
- The registered-products screen shows one card per `ChannelListing` and refreshes after finalize without an Excel upload or separate thumbnail image-sync action.

## Final Verification Gate

Run from `/Users/yhc125/workspace/kiditem` after all three plans:

```bash
rtk npm install --legacy-peer-deps
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm exec --workspace=apps/server vitest -- run src/channels src/ai
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-catalog-collection.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts src/ai/__tests__/coupang-catalog-content.pg.integration.spec.ts src/ai/__tests__/content-asset-materialization.pg.integration.spec.ts
rtk node --test extensions/coupang-ads-scraper/tests/*.test.mjs
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/registered-products' 'src/app/(product-pipeline)/product-pipeline/thumbnail-ai'
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run check:conventions
rtk npm run db:erd
rtk npm run graphify:schema
rtk npm run check:schema-artifact-sync
rtk git diff --check -- extensions/coupang-ads-scraper docs/superpowers
rtk npm run dev:server
```

Expected: every non-watch command exits `0`; NestJS finishes module initialization; the unpacked extension reloads without a manifest/service-worker error. Stop the watch process only after boot is confirmed.

## Completion Definition

This plan set is complete only when all three subplans are complete, the source design amendment is reflected in durable documentation, the old frontend image-sync dependency is gone, and one live authenticated Wing run passes the acceptance baseline for a selected Coupang account.
