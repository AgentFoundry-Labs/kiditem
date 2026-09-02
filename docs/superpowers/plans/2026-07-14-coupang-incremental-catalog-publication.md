# Coupang Incremental Catalog Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish each validated Coupang Wing detail chunk into registered products immediately while reserving absence deactivation for the completed full snapshot.

**Architecture:** `ChannelScrapeChunk` becomes the durable stored-versus-published fence with `publishedAt` and `publicationJson`. The existing catalog publisher gains an idempotent additive chunk path that shares listing, option, workspace, and URL-only media upserts with final reconciliation but never deactivates rows. Provider image bytes are fetched through existing guarded thumbnail/detail operations only when needed; catalog sync has no background materialization worker. Server status exposes stored and DB-published progress; the web invalidates listing queries whenever published product count increases and displays throughput and ETA.

**Tech Stack:** NestJS, Prisma v7/PostgreSQL, Zod, Vitest, Next.js 16, React Query, Chrome Manifest V3.

## Global Constraints

- Root `VERSION` remains exactly `0.1.8`.
- Discovery chunks never change canonical listings.
- A detail chunk may only upsert or reactivate identities contained in that chunk.
- Only a complete, hash-validated snapshot may deactivate unseen listings, options, or provider assets.
- Frontend reads and writes only through NestJS APIs.
- Persisted statuses remain `String` values validated by Zod/domain contracts.
- Catalog publication stores provider URLs only; it never pre-downloads image
  bytes or queues catalog-wide materialization.
- Preserve unrelated dirty work in advertising, agents, data-migration scripts, and reference files.

---

### Task 1: Add the stored-versus-published persistence and response contract

**Files:**
- Modify: `prisma/models/channels.prisma`
- Modify: `packages/shared/src/schemas/coupang-catalog-snapshot.ts`
- Test: `packages/shared/src/schemas/coupang-catalog-snapshot.spec.ts`

**Interfaces:**
- Produces: `ChannelScrapeChunk.publishedAt: Date | null` and `publicationJson: Json | null`.
- Produces: collection progress fields `publishedProducts`, `publishedOptionCount`, `publishedMediaCount`, `publishedChunks`, `firstPublishedAt`, and `lastPublishedAt`.

- [ ] **Step 1: Write the failing shared-contract test**

Add a run fixture assertion that parses this progress payload and rejects negative published counts:

```ts
progress: {
  discoveryPagesStored: 25,
  discoveredProducts: 1228,
  hydratedProducts: 80,
  optionCount: 92,
  mediaCount: 160,
  storedChunks: 30,
  publishedProducts: 60,
  publishedOptionCount: 68,
  publishedMediaCount: 120,
  publishedChunks: 3,
  firstPublishedAt: '2026-07-14T00:18:40.000Z',
  lastPublishedAt: '2026-07-14T00:20:53.000Z',
}
```

- [ ] **Step 2: Run the shared test and verify RED**

Run:

```bash
cd packages/shared && rtk npx vitest run src/schemas/coupang-catalog-snapshot.spec.ts
```

Expected: FAIL because the strict progress schema does not accept the published fields.

- [ ] **Step 3: Add the Prisma and Zod fields**

Add to `ChannelScrapeChunk`:

```prisma
publishedAt    DateTime? @map("published_at") @db.Timestamptz
publicationJson Json?    @map("publication_json") @db.JsonB
```

Extend the strict progress object with nonnegative integer counters and nullable ISO timestamps:

```ts
publishedProducts: z.number().int().nonnegative(),
publishedOptionCount: z.number().int().nonnegative(),
publishedMediaCount: z.number().int().nonnegative(),
publishedChunks: z.number().int().nonnegative(),
firstPublishedAt: z.string().datetime().nullable(),
lastPublishedAt: z.string().datetime().nullable(),
```

- [ ] **Step 4: Verify schema generation and shared GREEN**

Run:

```bash
rtk npm run db:push
rtk npx prisma generate
cd packages/shared && rtk npx vitest run src/schemas/coupang-catalog-snapshot.spec.ts && rtk npm run build
```

Expected: local schema sync succeeds, Prisma generation succeeds, and the focused shared tests pass.

- [ ] **Step 5: Commit the contract**

```bash
rtk git add prisma/models/channels.prisma packages/shared/src/schemas/coupang-catalog-snapshot.ts packages/shared/src/schemas/coupang-catalog-snapshot.spec.ts
rtk git commit -m "feat: track Coupang chunk publication progress"
```

---

### Task 2: Add idempotent additive chunk publication

**Files:**
- Modify: `apps/server/src/channels/application/port/out/repository/channel-catalog-publication.port.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-catalog-publication.repository.adapter.ts`
- Modify: `apps/server/src/channels/application/port/out/cross-domain/catalog-media-publication.port.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/ai-catalog-media-publication.repository.adapter.ts`
- Test: `apps/server/src/channels/__tests__/channel-catalog-publication.repository.pg.integration.spec.ts`

**Interfaces:**
- Produces: `publishChunk(input): Promise<ChannelCatalogChunkPublicationResult>` on `ChannelCatalogPublicationPort`.
- Produces: `publicationReference: { type: 'channel_scrape_run' | 'source_import_run'; id: string }` for media provenance.
- Consumes: the Task 1 chunk publication fields.

- [ ] **Step 1: Write failing PostgreSQL tests for incremental visibility and safety**

Add tests that seed two existing listings, store one detail chunk, call the wished-for `publishChunk`, and assert:

```ts
expect(await prisma.channelListing.count({
  where: { channelAccountId, externalId: newProductId, isActive: true },
})).toBe(1);
expect(await prisma.channelListing.count({
  where: { channelAccountId, externalId: untouchedExistingId, isActive: true },
})).toBe(1);
expect(chunkAfter?.publishedAt).not.toBeNull();
expect(chunkAfter?.publicationJson).toMatchObject({ publishedProducts: 1 });
```

Replay the same chunk and assert stable listing/option IDs and unchanged counts. Force media publication to throw and assert the listing, option, and `publishedAt` all roll back.

- [ ] **Step 2: Run the PostgreSQL test and verify RED**

Run:

```bash
cd apps/server && rtk npx vitest run --config vitest.config.integration.ts src/channels/__tests__/channel-catalog-publication.repository.pg.integration.spec.ts
```

Expected: FAIL because `publishChunk` and the chunk publication fields are not wired.

- [ ] **Step 3: Define the additive publication port**

Add:

```ts
export interface ChannelCatalogChunkPublicationResult {
  duplicate: boolean;
  changes: Record<string, number>;
}

publishChunk(input: {
  organizationId: string;
  userId: string;
  channelAccountId: string;
  collectionRunId: string;
  chunkId: string;
  products: Array<{ ordinal: number; product: CoupangCatalogProductV1 }>;
}): Promise<ChannelCatalogChunkPublicationResult>;
```

Change the media port input from `sourceImportRunId` to:

```ts
publicationReference: {
  type: 'channel_scrape_run' | 'source_import_run';
  id: string;
};
```

Store it in asset metadata as `publicationReference`; populate legacy `lastImportRunId` only for `source_import_run` references.

Provider assets retain `url = sourceUrl` and null `storageKey`, MIME, size, and
dimension fields. Do not add pending/ready/failed materialization state. The
existing thumbnail/detail image services fetch external bytes lazily when an
operation requires them and persist only selected or derived managed output.

- [ ] **Step 4: Extract one shared upsert path and implement `publishChunk`**

Refactor listing, option, workspace, and media upserts into a private transaction helper accepting:

```ts
type CatalogUpsertInput = {
  organizationId: string;
  userId: string;
  channelAccountId: string;
  products: Array<{ ordinal: number; product: CoupangCatalogProductV1 }>;
  lastImportRunId: string | null;
  publicationReference: {
    type: 'channel_scrape_run' | 'source_import_run';
    id: string;
  };
};
```

For incremental inserts, allow `last_import_run_id = NULL`; on conflict preserve the existing non-null value with `COALESCE(EXCLUDED.last_import_run_id, channel_listings.last_import_run_id)` and the equivalent option expression. Do not execute any `notIn` deactivation query in this helper.

In `publishChunk`, lock the account and chunk, return the saved result when `published_at IS NOT NULL`, run the shared upsert, then update in the same transaction:

```ts
await tx.channelScrapeChunk.update({
  where: { id: input.chunkId },
  data: {
    publishedAt: new Date(),
    publicationJson: {
      publishedProducts: input.products.length,
      ...changes,
    },
  },
});
```

Keep full `publish` responsible for `SourceImportRun`, full idempotent upsert, absence deactivation, publication sequence, and run completion.

- [ ] **Step 5: Run focused backend tests and verify GREEN**

Run:

```bash
cd apps/server && rtk npx vitest run --config vitest.config.integration.ts src/channels/__tests__/channel-catalog-publication.repository.pg.integration.spec.ts
rtk npx vitest run src/ai/__tests__/ai.module.wiring.spec.ts
```

Expected: incremental visibility, replay, rollback, final deactivation, and AI wiring tests pass.

- [ ] **Step 6: Commit the publisher**

```bash
rtk git add apps/server/src/channels/application/port/out/repository/channel-catalog-publication.port.ts apps/server/src/channels/adapter/out/repository/channel-catalog-publication.repository.adapter.ts apps/server/src/channels/__tests__/channel-catalog-publication.repository.pg.integration.spec.ts apps/server/src/channels/application/port/out/cross-domain/catalog-media-publication.port.ts apps/server/src/ai/adapter/out/repository/ai-catalog-media-publication.repository.adapter.ts apps/server/src/ai/__tests__/ai.module.wiring.spec.ts
rtk git commit -m "feat: publish Coupang detail chunks immediately"
```

---

### Task 3: Retry unpublished chunks and expose authoritative publication progress

**Files:**
- Modify: `apps/server/src/channels/application/port/out/repository/channel-catalog-collection.repository.port.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-catalog-collection.repository.adapter.ts`
- Modify: `apps/server/src/channels/application/service/channel-catalog-collection.service.ts`
- Test: `apps/server/src/channels/application/service/__tests__/channel-catalog-collection.service.spec.ts`
- Test: `apps/server/src/channels/__tests__/channel-catalog-collection.repository.pg.integration.spec.ts`

**Interfaces:**
- Consumes: `publishChunk` from Task 2.
- Produces: server status whose `missing.productIds` includes products in stored but unpublished detail chunks.
- Produces: progress counters and publication timestamps from Task 1.

- [ ] **Step 1: Write failing service tests**

Add tests that verify:

```ts
await service.putChunk(detailChunkInput);
expect(publisher.publishChunk).toHaveBeenCalledWith(expect.objectContaining({
  chunkId: 'detail-chunk-id',
  products: detailPayload.products,
}));
```

Build a run with one stored unpublished detail chunk and assert `hydratedProducts === 20`, `publishedProducts === 0`, and its 20 IDs remain in `missing.productIds`. Mark it published and assert `publishedProducts === 20` and those IDs disappear from `missing.productIds`. Assert finalization rejects while any detail chunk is unpublished.

- [ ] **Step 2: Run service tests and verify RED**

Run:

```bash
cd apps/server && rtk npx vitest run src/channels/application/service/__tests__/channel-catalog-collection.service.spec.ts
```

Expected: FAIL because stored and published detail state are not distinguished.

- [ ] **Step 3: Expose publication fields through collection records**

Add to `ChannelCatalogCollectionChunkRecord` and repository selects:

```ts
publishedAt: Date | null;
publicationJson: unknown;
```

Return the result of `repository.putChunk`, and for `product_details` always call `publisher.publishChunk`, including checksum-identical replays. This ensures a stored-but-unpublished chunk can be repaired.

- [ ] **Step 4: Build authoritative progress and missing IDs**

In chunk inspection, maintain stored products and published products separately. Derive:

```ts
publishedProducts: publishedDetails.length,
publishedOptionCount: sumOptions(publishedDetails),
publishedMediaCount: sumMedia(publishedDetails),
publishedChunks: publishedDetailChunks.length,
firstPublishedAt: minPublishedAt?.toISOString() ?? null,
lastPublishedAt: maxPublishedAt?.toISOString() ?? null,
```

Calculate `missing.productIds` as discovered IDs without a published detail, not merely without a stored detail. Require every detail chunk to be published before `ready_to_finalize` and final reconciliation.

- [ ] **Step 5: Verify unit and real-DB GREEN**

Run:

```bash
cd apps/server && rtk npx vitest run src/channels/application/service/__tests__/channel-catalog-collection.service.spec.ts src/channels/adapter/in/http/__tests__/channel-catalog-collection.controller.spec.ts
rtk npx vitest run --config vitest.config.integration.ts src/channels/__tests__/channel-catalog-collection.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-publication.repository.pg.integration.spec.ts
```

Expected: all collection, HTTP, and publication tests pass.

- [ ] **Step 6: Commit collection orchestration**

```bash
rtk git add apps/server/src/channels/application/port/out/repository/channel-catalog-collection.repository.port.ts apps/server/src/channels/adapter/out/repository/channel-catalog-collection.repository.adapter.ts apps/server/src/channels/application/service/channel-catalog-collection.service.ts apps/server/src/channels/application/service/__tests__/channel-catalog-collection.service.spec.ts apps/server/src/channels/__tests__/channel-catalog-collection.repository.pg.integration.spec.ts
rtk git commit -m "feat: retry unpublished Coupang catalog chunks"
```

---

### Task 4: Show stored and DB-published progress and refresh cards per chunk

**Files:**
- Create: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-progress.ts`
- Test: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-progress.spec.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/components/CoupangCatalogImportPanel.tsx`

**Interfaces:**
- Consumes: Task 3 server progress.
- Produces: `buildCoupangCatalogProgress(run, nowMs)` and `shouldInvalidatePublishedListings(previous, next)`.

- [ ] **Step 1: Write failing progress-model tests**

Test these exact behaviors:

```ts
expect(shouldInvalidatePublishedListings(40, 60)).toBe(true);
expect(shouldInvalidatePublishedListings(60, 60)).toBe(false);

expect(buildCoupangCatalogProgress(run, nowMs)).toMatchObject({
  discoveredLabel: '목록 발견 1,228 / 1,228',
  hydratedLabel: '상세 수집 80 / 1,228',
  publishedLabel: 'DB 반영 60 / 1,228',
  rateLabel: expect.stringContaining('개/분'),
  etaLabel: expect.stringContaining('예상'),
});
```

Also test zero progress and completed runs without division-by-zero or negative ETA.

- [ ] **Step 2: Run the web test and verify RED**

Run:

```bash
cd apps/web && rtk npx vitest run 'src/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-progress.spec.ts'
```

Expected: FAIL because the progress module does not exist.

- [ ] **Step 3: Implement the pure progress model**

Calculate percentage from DB-published products during hydration. Compute rate from `publishedProducts / max(1, nowMs - Date.parse(run.startedAt))`, display one decimal product per minute, and calculate ETA from remaining products divided by that rate. Return `null` ETA until at least one product is published.

Implement invalidation as:

```ts
export function shouldInvalidatePublishedListings(
  previous: number | null,
  next: number,
): boolean {
  return previous !== null && next > previous;
}
```

- [ ] **Step 4: Invalidate registered-product queries on every increase**

Track `{ runId, publishedProducts }` in a ref. When the same run's count increases, call:

```ts
void queryClient.invalidateQueries({ queryKey: queryKeys.channelListings.all });
```

Initialize a newly observed run without invalidating, retain the existing completion invalidation, and reset the ref when the active run resets.

- [ ] **Step 5: Render unambiguous live status**

Replace the single ambiguous `상품 N개` line with:

```text
목록 발견 1,228 / 1,228
상세 수집 80 / 1,228
DB 반영 60 / 1,228
옵션 68개 · 이미지 120개 반영
처리 18.4개/분 · 완료 예상 47분
```

Use `aria-live="polite"`; label the active phase `상품 상세 수집 · 카드 반영 중`. Keep the existing progress bar and make its hydration percentage follow DB-published count so visible progress matches visible cards.

- [ ] **Step 6: Verify web GREEN**

Run:

```bash
cd apps/web && rtk npx vitest run 'src/app/(product-pipeline)/product-pipeline/registered-products'
rtk npm run build
```

Expected: all route tests and the Next.js production build pass.

- [ ] **Step 7: Commit the web behavior**

```bash
rtk git add 'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-progress.ts' 'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-progress.spec.ts' 'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.ts' 'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/components/CoupangCatalogImportPanel.tsx'
rtk git commit -m "feat: show live Coupang catalog publication"
```

---

### Task 5: Verify the live resumable cutover

**Files:**
- Modify only if a regression is found: files from Tasks 1–4.

**Interfaces:**
- Consumes: the complete incremental publication path.
- Produces: runtime evidence that an existing stored-but-unpublished run repairs itself and shows cards before final reconciliation.

- [ ] **Step 1: Run the complete focused regression suite**

```bash
cd packages/shared && rtk npx vitest run src/schemas/coupang-catalog-snapshot.spec.ts && rtk npm run build
cd ../../apps/server && rtk npx vitest run src/channels/application/service/__tests__/channel-catalog-collection.service.spec.ts src/channels/adapter/in/http/__tests__/channel-catalog-collection.controller.spec.ts src/ai/__tests__/ai.module.wiring.spec.ts src/ai/application/service/content-workspace-thumbnail-selection.service.spec.ts src/ai/application/service/__tests__/image-asset-operation.service.spec.ts src/ai/application/service/__tests__/detail-page-hero-image.service.spec.ts
rtk npx vitest run --config vitest.config.integration.ts src/channels/__tests__/channel-catalog-collection.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-publication.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts
cd ../web && rtk npx vitest run 'src/app/(product-pipeline)/product-pipeline/registered-products' && rtk npm run build
cd ../server && rtk npm run build
```

Expected: every test and build exits zero.

- [ ] **Step 2: Confirm NestJS boot**

Run `rtk npm run dev:server` from the repository root, wait for port 4000, and verify an unauthenticated `GET /api/channels/accounts` returns the expected `401 auth_required`; keep the user's development server running afterward.

- [ ] **Step 3: Verify the existing Chrome run through the normal UI**

Reload the local registered-products page after hot reload. Confirm all of these authoritative signals:

1. `상세 수집` can exceed `DB 반영` only while a stored chunk is being retried.
2. `DB 반영` rises in 20-product increments.
3. the registered-product query count/card data changes before run completion.
4. no untouched existing listing becomes inactive during the running phase.
5. external image URLs render without a catalog-time managed copy, and an
   explicit thumbnail/detail operation fetches the selected URL on demand.

- [ ] **Step 4: Inspect local DB without exposing credentials**

Use `PrismaService` from a `tsx -e` read-only diagnostic to verify the active run has published detail chunks, matching canonical listings, and no `SourceImportRun` link until final reconciliation.

- [ ] **Step 5: Run final diff checks and commit any verification-only test correction**

```bash
rtk git diff --check
rtk git status --short
```

Expected: only pre-existing unrelated user changes remain outside the feature commits.
