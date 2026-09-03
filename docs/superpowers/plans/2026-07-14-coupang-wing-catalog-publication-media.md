# Coupang Wing Catalog Atomic Publication and Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finalize a complete browser snapshot through the existing fenced catalog importer, atomically create/update account listings, options, listing workspaces, and provider assets, then copy provider image bytes into managed storage through durable per-asset leases.

**Architecture:** The browser snapshot and workbook parser converge on one Channels publication model. `SourceImportRun` remains the deduplication/publication fence, while the Channels repository owns the transaction and invokes an AI-owned incoming capability through a transaction-aware cross-domain port. Existing `ContentGenerationGroup(groupType='workspace_assets')` and `ContentAsset` rows represent listing media. A deterministic AI worker leases provider assets after commit and materializes them without blocking catalog visibility.

**Tech Stack:** TypeScript, NestJS hexagonal modules, Prisma v7/PostgreSQL, Zod, tagged raw SQL, Vitest, Testcontainers, existing image-fetch and image-storage ports.

**Parent plan:** [Coupang Wing full catalog snapshot](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-07-14-coupang-wing-full-catalog-snapshot.md)

**Prerequisite:** [Durable collection and extension adapter](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-07-14-coupang-wing-catalog-collection.md)

---

## Artifact Storage Decision

`SourceImportRun.fileName` is not a filesystem path and does not contain the snapshot. For browser imports it stores this literal database label:

```text
browser-extension:coupang-wing:v1
```

That string is written to `source_import_runs.file_name` only. No `wing-browser-snapshot-v1.json` or other artifact file is created locally, uploaded to object storage, or stored as a blob in `SourceImportRun`.

The data is persisted as follows:

| Data | Durable location |
|---|---|
| Resumable raw browser chunks | `channel_scrape_chunks.payload` JSONB |
| Browser collection identity/progress | `channel_scrape_runs` |
| Canonical completed hash | `source_import_runs.file_hash` |
| Publication provenance label | `source_import_runs.file_name` |
| Current products/options | `channel_listings`, `channel_listing_options` |
| Listing workspace/media | `content_workspaces`, `content_generation_groups`, `content_assets` |
| Managed image bytes | Existing image storage behind `IMAGE_STORAGE_PORT` |

`SourceImportRun.fileName` stays required because workbook imports still store the uploaded workbook's original name. Browser imports use the fixed label above for compatibility and provenance.

## Locked Publication and Media Rules

- Source type stays `coupang_wing_catalog` for workbook and browser publication.
- Browser `fileHash` is the server-computed canonical SHA-256 of the complete product snapshot. A client-provided mismatch returns `400` before any `SourceImportRun` is claimed.
- Same organization/account/hash returns the existing completed `SourceImportRun` and links the browser collection run to it without republishing.
- The advisory-lock key is `channel-catalog-import:<organizationId>:coupang_wing_catalog:<channelAccountId>`.
- Existing organization/source `publicationSequence` remains unchanged; it is provenance ordering, not a lock boundary.
- Browser collection is marked `completed` and linked through `sourceImportRunId` inside the same transaction that completes `SourceImportRun`.
- Workbook import stays supported and does not invent media it did not observe.
- No `ContentWorkspaceAsset` model is added. A listing workspace owns provider media through one existing `workspace_assets` generation group and its `ContentAsset` rows.
- Provider asset identity is workspace-scoped: `coupang-catalog:<workspaceId>:<sha256(normalizedSourceUrl)>`.
- Provider source URL is usable immediately on transaction commit. Managed copying is asynchronous and never rolls the catalog back.
- `MasterProduct`, `ChannelSkuComponent`, stock, source candidate provenance, manual/generated media, and generated content are not inferred or replaced.
- Root `VERSION` stays `0.1.8`. These are open 0.1.8 reconstruction fields with nullable/default-safe additions, so no data-migration script is required. Existing unrelated `ContentAsset` rows retain null provider/materialization fields and are not enqueued.

## Task 1: Converge workbook and browser data on one publication model

**Files:**

- Create: `apps/server/src/channels/domain/coupang-catalog-publication.ts`
- Create: `apps/server/src/channels/domain/coupang-catalog-publication.spec.ts`
- Modify: `apps/server/src/channels/application/service/coupang-wing-workbook.parser.ts`
- Modify: `apps/server/src/channels/application/service/coupang-wing-workbook.parser.spec.ts`
- Modify: `apps/server/src/channels/application/port/in/channel-catalog-import.port.ts`
- Modify: `apps/server/src/channels/application/port/out/repository/channel-catalog-import.repository.port.ts`
- Modify: `packages/shared/src/schemas/source-import.ts`
- Modify: `packages/shared/src/schemas/source-import.spec.ts`

- [ ] Write failing domain tests for:

  - mapping parsed workbook rows into parent products/options with empty media;
  - assembling browser detail chunks in discovery order;
  - duplicate parent IDs;
  - duplicate option IDs under one parent and across parents;
  - an existing SKU attempting to move to another parent;
  - media owned by an unknown parent/option;
  - normalized URL deduplication and stable primary/detail/option ordering;
  - canonical hash stability under object-key ordering and input chunk ordering;
  - canonical hash stability when only raw diagnostics or collection metadata changes;
  - canonical hash change when a product, option, or media value changes.

- [ ] Extend shared import response tests first to require additive counts:

```ts
inactivatedProductCount: number;
inactivatedSkuCount: number;
createdWorkspaceCount: number;
attachedProviderImageCount: number;
inactivatedProviderImageCount: number;
```

Duplicate responses require every change count to be zero.

- [ ] Run and confirm failure:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/domain/coupang-catalog-publication.spec.ts src/channels/application/service/coupang-wing-workbook.parser.spec.ts
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/source-import.spec.ts
```

- [ ] Implement `CoupangCatalogPublicationSnapshot` as a Channels domain type containing canonical products, coverage, source row count, and skipped row count. Implement:

  - `publicationSnapshotFromWorkbook`;
  - `publicationSnapshotFromBrowserChunks`;
  - `validatePublicationSnapshot`;
  - `canonicalPublicationHash`;
  - `flattenPublicationRows` only as a compatibility mapper for the current batched SQL writer.

The workbook mapper reuses `buildCoupangWingSnapshotCoverage` so skipped workbook identities keep the current safe absence behavior. A complete browser snapshot sets both absence flags true because missing identities are rejected before publication.

- [ ] Change the incoming/repository port payload from workbook-specific `ParsedWingCatalogRow[]` to `CoupangCatalogPublicationSnapshot`. Preserve the existing controller route by mapping workbook output before calling the service.

- [ ] Add the response counts to `CoupangWingCatalogImportResponseSchema`, then run:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/source-import.spec.ts
rtk npm run build --workspace=packages/shared
rtk npm exec --workspace=apps/server vitest -- run src/channels/domain/coupang-catalog-publication.spec.ts src/channels/application/service/coupang-wing-workbook.parser.spec.ts
```

Expected: all tests pass, and workbook/publication inputs share one typed model.

- [ ] Commit:

```bash
rtk git add apps/server/src/channels/domain/coupang-catalog-publication.ts apps/server/src/channels/domain/coupang-catalog-publication.spec.ts apps/server/src/channels/application/service/coupang-wing-workbook.parser.ts apps/server/src/channels/application/service/coupang-wing-workbook.parser.spec.ts apps/server/src/channels/application/port/in/channel-catalog-import.port.ts apps/server/src/channels/application/port/out/repository/channel-catalog-import.repository.port.ts packages/shared/src/schemas/source-import.ts packages/shared/src/schemas/source-import.spec.ts
rtk git commit -m "refactor: unify Coupang catalog publication input"
```

## Task 2: Add provider provenance and durable materialization state

**Files:**

- Modify: `prisma/models/ai.prisma`
- Modify: `prisma/models/core.prisma`
- Create: `apps/server/src/ai/domain/coupang-catalog-asset.ts`
- Create: `apps/server/src/ai/domain/__tests__/coupang-catalog-asset.spec.ts`

- [ ] Write failing pure tests for URL normalization, workspace-scoped asset keys, managed storage keys, materialization status transitions, bounded error text, and retry backoff `[60s, 5m, 30m, 6h, 24h]` capped at 24 hours.

- [ ] Run and confirm failure:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/ai/domain/__tests__/coupang-catalog-asset.spec.ts
```

- [ ] Add these nullable/default-safe fields to `ContentAsset`:

```prisma
sourceType                    String?   @map("source_type")
sourceUrl                     String?   @map("source_url")
sourceExternalProductId       String?   @map("source_external_product_id")
sourceExternalOptionId        String?   @map("source_external_option_id")
lastImportRunId               String?   @map("last_import_run_id") @db.Uuid
materializationStatus         String?   @map("materialization_status")
materializationAttempts       Int       @default(0) @map("materialization_attempts")
materializationLeaseToken     String?   @map("materialization_lease_token") @db.Uuid
materializationLeaseExpiresAt DateTime? @map("materialization_lease_expires_at") @db.Timestamptz
materializationNextAttemptAt  DateTime? @map("materialization_next_attempt_at") @db.Timestamptz
materializationLastError      String?   @map("materialization_last_error")
materializedAt                DateTime? @map("materialized_at") @db.Timestamptz
```

Add an organization-safe `ContentAssetLastImport` relation to `SourceImportRun`, the inverse relation on `SourceImportRun`, and an index on `(organizationId, sourceType, materializationStatus, materializationNextAttemptAt)`.

- [ ] Implement pure helpers:

  - `normalizeCoupangCatalogSourceUrl` strips fragments, normalizes host casing, and preserves meaningful query parameters;
  - `coupangCatalogAssetKey(workspaceId, normalizedSourceUrl)`;
  - `coupangCatalogStorageKey(organizationId, assetId, extension)` returning `content-assets/<org>/coupang-catalog/<assetId>.<ext>`;
  - `nextMaterializationAttemptAt(attempt, now)`;
  - `boundedMaterializationError(error)` limited to 500 characters.

- [ ] Apply and verify:

```bash
rtk npm run db:push
rtk npx prisma generate
rtk npm exec --workspace=apps/server vitest -- run src/ai/domain/__tests__/coupang-catalog-asset.spec.ts
rtk npm run check:tenant-scope
```

Expected: schema push/generation and tests pass.

- [ ] Commit:

```bash
rtk git add prisma/models/ai.prisma prisma/models/core.prisma apps/server/src/ai/domain/coupang-catalog-asset.ts apps/server/src/ai/domain/__tests__/coupang-catalog-asset.spec.ts
rtk git commit -m "feat: add Coupang provider asset provenance"
```

## Task 3: Implement the AI-owned transaction-aware catalog content capability

**Files:**

- Create: `apps/server/src/ai/application/port/in/workspace/coupang-catalog-content.port.ts`
- Modify: `apps/server/src/ai/application/port/in/workspace/index.ts`
- Create: `apps/server/src/ai/application/port/out/repository/coupang-catalog-content.repository.port.ts`
- Modify: `apps/server/src/ai/application/port/out/repository/index.ts`
- Create: `apps/server/src/ai/application/service/coupang-catalog-content.service.ts`
- Create: `apps/server/src/ai/application/service/__tests__/coupang-catalog-content.service.spec.ts`
- Create: `apps/server/src/ai/adapter/out/repository/coupang-catalog-content.repository.adapter.ts`
- Create: `apps/server/src/ai/adapter/out/repository/coupang-catalog-content.repository.adapter.spec.ts`
- Create: `apps/server/src/ai/__tests__/coupang-catalog-content.pg.integration.spec.ts`
- Modify: `apps/server/src/ai/ai.module.ts`
- Modify: `apps/server/src/ai/__tests__/ai.module.wiring.spec.ts`

- [ ] Define the AI incoming capability:

```ts
export interface CoupangCatalogContentPort {
  attachPublishedCatalog(
    transaction: object,
    input: {
      organizationId: string;
      sourceImportRunId: string;
      createdByUserId: string | null;
      listings: Array<{
        listingId: string;
        externalProductId: string;
        displayName: string;
        media: CoupangCatalogMediaV1[];
      }>;
    },
  ): Promise<{
    createdWorkspaceCount: number;
    attachedProviderImageCount: number;
    inactivatedProviderImageCount: number;
  }>;
}
```

- [ ] Write failing unit/adapter/integration tests proving:

  - one active `ownerType='channel_listing'` workspace is created or reused per listing;
  - a single existing `groupType='workspace_assets'` group is reused;
  - provider assets use workspace-scoped keys and are not shared across two listing workspaces with the same URL;
  - first import creates assets with external `url`, retained `sourceUrl`, `sourceType='coupang_catalog'`, `materializationStatus='pending'`, and `lastImportRunId`;
  - a later publication reuses asset IDs and does not reset active pending/failed lease or backoff state;
  - a materialized asset keeps its managed `url`, `storageKey`, and `ready` status on re-import while `sourceUrl` and `lastImportRunId` remain current;
  - provider assets absent from a complete snapshot are soft-deleted; reappearance reactivates the same asset ID;
  - duplicate occurrences of one URL across options become one asset; `sourceExternalOptionId` is populated only for a single-option owner and the complete option-ID set stays in metadata;
  - manual/generated assets and historical thumbnail selections are untouched;
  - a workspace without a selection selects the first active primary provider asset;
  - a workspace currently selecting the previous provider-primary switches to the new provider-primary;
  - if the current selection is provider-owned and no provider image remains, the workspace clears its current pointer while retaining the historical selection row;
  - a workspace selecting manual/generated media keeps that selection;
  - a tenant cannot attach listings or workspaces owned by another organization;
  - throwing after AI writes rolls them back with the caller's transaction.

- [ ] Run and confirm failure:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/ai/application/service/__tests__/coupang-catalog-content.service.spec.ts src/ai/adapter/out/repository/coupang-catalog-content.repository.adapter.spec.ts src/ai/__tests__/ai.module.wiring.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/ai/__tests__/coupang-catalog-content.pg.integration.spec.ts
```

- [ ] Implement the application service with validation/normalization only; all Prisma work stays in the focused repository adapter. Do not add this behavior to the existing 904-line `registration-content-workspace.repository.adapter.ts`.

- [ ] In the repository adapter, validate the opaque transaction as a Prisma transaction client at the adapter boundary. Use bounded batched reads/writes and organization-safe predicates. Store media diagnostics in `metadata`, but keep retry/query fields in normalized columns.

- [ ] Bind and export `COUPANG_CATALOG_CONTENT_PORT` from `AiModule`. Update wiring tests, then run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/ai/application/service/__tests__/coupang-catalog-content.service.spec.ts src/ai/adapter/out/repository/coupang-catalog-content.repository.adapter.spec.ts src/ai/__tests__/ai.module.wiring.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/ai/__tests__/coupang-catalog-content.pg.integration.spec.ts
```

Expected: all tests pass, including cross-transaction rollback.

- [ ] Commit:

```bash
rtk git add apps/server/src/ai/application/port/in/workspace/coupang-catalog-content.port.ts apps/server/src/ai/application/port/in/workspace/index.ts apps/server/src/ai/application/port/out/repository/coupang-catalog-content.repository.port.ts apps/server/src/ai/application/port/out/repository/index.ts apps/server/src/ai/application/service/coupang-catalog-content.service.ts apps/server/src/ai/application/service/__tests__/coupang-catalog-content.service.spec.ts apps/server/src/ai/adapter/out/repository/coupang-catalog-content.repository.adapter.ts apps/server/src/ai/adapter/out/repository/coupang-catalog-content.repository.adapter.spec.ts apps/server/src/ai/__tests__/coupang-catalog-content.pg.integration.spec.ts apps/server/src/ai/ai.module.ts apps/server/src/ai/__tests__/ai.module.wiring.spec.ts
rtk git commit -m "feat: attach Coupang catalog media to workspaces"
```

## Task 4: Refactor and harden the existing atomic catalog publisher

**Files:**

- Create: `apps/server/src/channels/application/port/out/cross-domain/coupang-catalog-content.port.ts`
- Modify: `apps/server/src/channels/application/port/out/cross-domain/index.ts`
- Create: `apps/server/src/channels/adapter/out/ai/coupang-catalog-content.adapter.ts`
- Create: `apps/server/src/channels/adapter/out/repository/channel-catalog-publication.persistence.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-catalog-import.repository.adapter.ts`
- Modify: `apps/server/src/channels/application/service/channel-catalog-import.service.ts`
- Modify: `apps/server/src/channels/application/service/__tests__/channel-catalog-import.service.spec.ts`
- Modify: `apps/server/src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/channels/channels.module.ts`
- Modify: `apps/server/src/channels/__tests__/channels.module.wiring.spec.ts`

- [ ] Add a passing PostgreSQL characterization test for the current parent insert, then add failing tests for the new lock/content behavior:

  - the current raw parent insert maps `category`, `manufacturer`, `brand`, status, and raw JSON exactly once and successfully executes;
  - advisory lock keys differ across accounts and match for the same account;
  - publication preserves listing/option UUIDs, mapping status, `ChannelSkuComponent`, `sourceCandidateId`, and KidItem-authored fields;
  - complete absence inactivates products/options; incomplete workbook coverage does not inactivate unknown identities;
  - existing SKU parent conflicts reject the whole transaction;
  - AI attachment receives the same transaction object and every persisted listing ID/media set;
  - an AI attachment error rolls back listing/option changes and leaves `SourceImportRun` reclaimable;
  - a completed retry returns zero changes;
  - organization/source publication sequence remains monotonic;
  - two different accounts can finalize without sharing the advisory lock.

- [ ] Run the characterization test to establish the green refactor baseline, then confirm the new account-lock/content-callback cases fail against the current implementation:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/channel-catalog-import.service.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts
```

- [ ] Extract batched listing/option reads, writes, absence updates, and change counts into `channel-catalog-publication.persistence.ts`. Keep claim/reclaim, advisory lock, row fence, transaction orchestration, publication sequence, and run completion in `channel-catalog-import.repository.adapter.ts`.

- [ ] Add a callback to the repository publication input:

```ts
attachContent: (
  transaction: object,
  listings: PublishedCoupangCatalogListing[],
) => Promise<CoupangCatalogContentChanges>;
```

The application service passes a callback backed by the Channels-local `COUPANG_CATALOG_CONTENT_PORT`. The Channels adapter delegates to AI's exported incoming capability. No Channels repository imports AI code or writes AI tables.

- [ ] Change the lock key to include `channelAccountId`, preserve the current one-to-one parent INSERT/SELECT column mapping during extraction, and update completion response counts. Keep `publicationSequence` allocation organization/source scoped.

- [ ] Import `AiModule` into `ChannelsModule`, bind the local cross-domain adapter, and update module wiring tests. There is no module cycle because `AiModule` does not import `ChannelsModule`.

- [ ] Verify:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/channel-catalog-import.service.spec.ts src/channels/__tests__/channels.module.wiring.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts src/ai/__tests__/coupang-catalog-content.pg.integration.spec.ts
rtk npm run check:idor
rtk npm run check:tenant-scope
```

Expected: publisher and AI attachment tests pass; cross-account lock and rollback invariants are proven.

- [ ] Commit:

```bash
rtk git add apps/server/src/channels/application/port/out/cross-domain/coupang-catalog-content.port.ts apps/server/src/channels/application/port/out/cross-domain/index.ts apps/server/src/channels/adapter/out/ai/coupang-catalog-content.adapter.ts apps/server/src/channels/adapter/out/repository/channel-catalog-publication.persistence.ts apps/server/src/channels/adapter/out/repository/channel-catalog-import.repository.adapter.ts apps/server/src/channels/application/service/channel-catalog-import.service.ts apps/server/src/channels/application/service/__tests__/channel-catalog-import.service.spec.ts apps/server/src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts apps/server/src/channels/channels.module.ts apps/server/src/channels/__tests__/channels.module.wiring.spec.ts
rtk git commit -m "refactor: publish Coupang catalog with workspace media"
```

## Task 5: Finalize staged browser snapshots through the publisher

**Files:**

- Modify: `apps/server/src/channels/application/port/in/channel-catalog-collection.port.ts`
- Modify: `apps/server/src/channels/application/service/channel-catalog-collection.service.ts`
- Modify: `apps/server/src/channels/application/service/__tests__/channel-catalog-collection.service.spec.ts`
- Modify: `apps/server/src/channels/application/port/out/repository/channel-catalog-collection.repository.port.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-catalog-collection.repository.adapter.ts`
- Modify: `apps/server/src/channels/adapter/in/http/channel-catalog-collection.controller.ts`
- Modify: `apps/server/src/channels/adapter/in/http/__tests__/channel-catalog-collection.controller.spec.ts`
- Modify: `apps/server/src/channels/__tests__/channel-catalog-collection.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts`

- [ ] Write failing tests proving finalize:

  - rejects missing discovery pages, missing detail products, duplicate identity, unstable first-page confirmation, and client/server hash mismatch before claiming a `SourceImportRun`;
  - computes `fileName='browser-extension:coupang-wing:v1'` and never opens/writes a filesystem path;
  - creates a `SourceImportRun` using the canonical hash and the authenticated user ID;
  - links `ChannelScrapeRun.sourceImportRunId`, status, counts, phase, and publication response inside the publication transaction;
  - returns the prior completed response for a duplicate canonical hash and links the current collection run;
  - leaves a transient publication failure resumable at `ready_to_finalize` with structured diagnostics;
  - fences concurrent finalize calls and never publishes a partial snapshot.

- [ ] Run and confirm failure:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/channel-catalog-collection.service.spec.ts src/channels/adapter/in/http/__tests__/channel-catalog-collection.controller.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-catalog-collection.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts
```

- [ ] Add `finalize` to the incoming collection port and `POST .../runs/:runId/finalize` to the controller. The service loads owned chunks, rebuilds and validates the canonical snapshot, computes the hash, compares it with `snapshotHash`, and calls `ChannelCatalogImportPort.importCoupangWing` using the fixed browser label.

- [ ] Extend the publication repository input with nullable `collectionRunId`. When present, lock the organization/account-owned `ChannelScrapeRun` and update it to:

```json
{
  "status": "completed",
  "phase": "finished",
  "sourceImportRunId": "<completed SourceImportRun id>",
  "rowCount": "<option count>",
  "finishedAt": "<transaction time>",
  "publication": "<additive change summary>"
}
```

For duplicate completed source hashes, perform only the collection-link update in a short transaction; do not reattach or inactivate catalog/media rows.

- [ ] Verify:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/channel-catalog-collection.service.spec.ts src/channels/adapter/in/http/__tests__/channel-catalog-collection.controller.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-catalog-collection.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts
```

Expected: all finalize, rollback, duplicate, and provenance-label tests pass.

- [ ] Commit:

```bash
rtk git add apps/server/src/channels/application/port/in/channel-catalog-collection.port.ts apps/server/src/channels/application/service/channel-catalog-collection.service.ts apps/server/src/channels/application/service/__tests__/channel-catalog-collection.service.spec.ts apps/server/src/channels/application/port/out/repository/channel-catalog-collection.repository.port.ts apps/server/src/channels/adapter/out/repository/channel-catalog-collection.repository.adapter.ts apps/server/src/channels/adapter/in/http/channel-catalog-collection.controller.ts apps/server/src/channels/adapter/in/http/__tests__/channel-catalog-collection.controller.spec.ts apps/server/src/channels/__tests__/channel-catalog-collection.repository.pg.integration.spec.ts apps/server/src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts
rtk git commit -m "feat: finalize browser catalog snapshots"
```

## Task 6: Implement durable provider-image materialization leases

**Files:**

- Create: `apps/server/src/ai/application/port/out/repository/content-asset-materialization.repository.port.ts`
- Modify: `apps/server/src/ai/application/port/out/repository/index.ts`
- Create: `apps/server/src/ai/application/service/content-asset-materialization.service.ts`
- Create: `apps/server/src/ai/application/service/content-asset-materialization.worker.ts`
- Create: `apps/server/src/ai/application/service/__tests__/content-asset-materialization.service.spec.ts`
- Create: `apps/server/src/ai/application/service/__tests__/content-asset-materialization.worker.spec.ts`
- Create: `apps/server/src/ai/adapter/out/repository/content-asset-materialization.repository.adapter.ts`
- Create: `apps/server/src/ai/adapter/out/repository/content-asset-materialization.repository.adapter.spec.ts`
- Create: `apps/server/src/ai/__tests__/content-asset-materialization.pg.integration.spec.ts`
- Modify: `apps/server/src/ai/ai.module.ts`
- Modify: `apps/server/src/ai/__tests__/ai.module.wiring.spec.ts`
- Modify: `apps/server/.env.example`
- Modify: `docs/runbooks/environment-variables.md`

- [ ] Define repository methods `claimNextBatch`, `markReady`, and `markFailed`. A claim selects at most `10` active `sourceType='coupang_catalog'` assets where:

  - status is `pending`, or status is `failed` and `materializationNextAttemptAt <= now`;
  - lease is null or expired;
  - source URL is present.

Use a tagged raw-SQL transaction with `FOR UPDATE SKIP LOCKED`, assign a unique lease token per asset, set a two-minute lease, and increment `materializationAttempts` exactly once per claim.

- [ ] Write failing unit/integration tests proving:

  - two workers cannot claim the same asset;
  - expired leases are reclaimable and live leases are not;
  - unrelated/manual assets are never claimed;
  - success calls `IMAGE_FETCH_PORT.fetchImage(sourceUrl)`, validates MIME, derives extension, and calls `IMAGE_STORAGE_PORT.save` with `content-assets/<org>/coupang-catalog/<assetId>.<ext>`;
  - success changes the same asset's `url`, `storageKey`, `mimeType`, status, and timestamp while preserving `sourceUrl` and asset ID;
  - stale lease-token completion is rejected;
  - failure keeps `url` on the external source, clears the lease, records a bounded error and backoff time, and does not mutate `SourceImportRun`;
  - a successful re-claim after failure becomes ready;
  - worker `tick()` is non-reentrant and isolates failures per asset.

- [ ] Run and confirm failure:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/ai/application/service/__tests__/content-asset-materialization.service.spec.ts src/ai/application/service/__tests__/content-asset-materialization.worker.spec.ts src/ai/adapter/out/repository/content-asset-materialization.repository.adapter.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/ai/__tests__/content-asset-materialization.pg.integration.spec.ts
```

- [ ] Implement the service using only repository, `IMAGE_FETCH_PORT`, and `IMAGE_STORAGE_PORT`. Implement the worker with `OnModuleInit`/`OnModuleDestroy`, an unref'd interval, and a public `tick()` for tests. Do not create an Agent OS run or generic queue.

- [ ] Add environment contracts:

```text
COUPANG_CATALOG_MEDIA_WORKER_ENABLED=1
COUPANG_CATALOG_MEDIA_WORKER_INTERVAL_MS=15000
```

Default enabled unless explicitly `0|false`; default interval `15000`; interval `0` disables timers for tests. Document that external URLs remain usable when the worker is disabled or a copy fails.

- [ ] Bind the repository, service, and worker in `AiModule`, update wiring tests, then verify:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/ai/application/service/__tests__/content-asset-materialization.service.spec.ts src/ai/application/service/__tests__/content-asset-materialization.worker.spec.ts src/ai/adapter/out/repository/content-asset-materialization.repository.adapter.spec.ts src/ai/__tests__/ai.module.wiring.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/ai/__tests__/content-asset-materialization.pg.integration.spec.ts
```

Expected: all lease, retry, fetch/storage, and worker lifecycle cases pass.

- [ ] Commit:

```bash
rtk git add apps/server/src/ai/application/port/out/repository/content-asset-materialization.repository.port.ts apps/server/src/ai/application/port/out/repository/index.ts apps/server/src/ai/application/service/content-asset-materialization.service.ts apps/server/src/ai/application/service/content-asset-materialization.worker.ts apps/server/src/ai/application/service/__tests__/content-asset-materialization.service.spec.ts apps/server/src/ai/application/service/__tests__/content-asset-materialization.worker.spec.ts apps/server/src/ai/adapter/out/repository/content-asset-materialization.repository.adapter.ts apps/server/src/ai/adapter/out/repository/content-asset-materialization.repository.adapter.spec.ts apps/server/src/ai/__tests__/content-asset-materialization.pg.integration.spec.ts apps/server/src/ai/ai.module.ts apps/server/src/ai/__tests__/ai.module.wiring.spec.ts apps/server/.env.example docs/runbooks/environment-variables.md
rtk git commit -m "feat: materialize Coupang catalog images"
```

## Task 7: Publication and schema checkpoint verification

- [ ] Verify no unexpected 0.1.9 release or data-migration artifact was introduced:

```bash
rtk rg -n '^0\.1\.8$' VERSION
rtk git diff --name-only origin/develop...HEAD --diff-filter=A -- scripts/data-migrations
```

Expected: `VERSION` reports `0.1.8`; the second command has no feature-added data-migration file. Preserve any unrelated pre-existing worktree changes under `scripts/data-migrations/`.

- [ ] Run the publication/media gate:

```bash
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm exec --workspace=apps/server vitest -- run src/channels src/ai
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-catalog-collection.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts src/ai/__tests__/coupang-catalog-content.pg.integration.spec.ts src/ai/__tests__/content-asset-materialization.pg.integration.spec.ts
rtk npm run build --workspace=apps/server
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run check:conventions
rtk npm run db:erd
rtk npm run graphify:schema
rtk npm run check:schema-artifact-sync
rtk git diff --check
```

Expected: every command exits `0` and schema artifacts reflect the new chunk/provenance/materialization fields.

- [ ] Commit the generated schema navigation artifacts:

```bash
rtk git add docs/ERD.md docs/erd/channels.md docs/erd/ai.md docs/erd/core.md graphify-out/schema/graph.json graphify-out/schema/GRAPH_REPORT.md graphify-out/schema/README.md graphify-out/schema/graph.html
rtk git commit -m "docs: refresh catalog schema artifacts"
```

- [ ] Start the server with the materializer disabled and confirm boot before proceeding to the UI plan:

```bash
rtk env COUPANG_CATALOG_MEDIA_WORKER_ENABLED=0 npm run dev:server
```

Expected: NestJS initializes Channels and AI modules without circular-dependency or missing-provider errors. Stop the process after boot is confirmed.
