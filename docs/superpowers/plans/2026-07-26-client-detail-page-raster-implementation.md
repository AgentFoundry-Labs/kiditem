# Client Detail-Page Raster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the saved-detail-page Puppeteer raster job with a revision-bound Chrome extension capture, direct presigned object upload, durable artifact finalization, and Wing registration reuse.

**Architecture:** NestJS owns immutable revision selection, render intents, storage targets, validation, and durable artifacts. A dedicated Next.js route renders the exact server document in an isolated iframe, while the Coupang extension captures it once through CDP and uploads the JPEG directly. The existing Wing coordinator waits for finalization and passes exactly one verified URL to the existing form-fill flow.

**Tech Stack:** Prisma 7, NestJS 11, AWS SDK S3 presigning, Zod, Next.js, React Query, Chrome Manifest V3, `chrome.debugger`, IndexedDB, Vitest, Node test runner.

## Global Constraints

- Keep `DetailPageRevision`; remove only the `detail_page_rasterize` producer/executor path used for Wing detail images.
- New output variant is exactly `wing-client-jpeg-v1`; output width is exactly 780 pixels; capture layout width is exactly 720 CSS pixels.
- Capture uses exactly one `Page.captureScreenshot` call and no tiling, stitching, canvas cloning, PDF, or server fallback.
- Browser clients never choose organization ID, revision ID, object key, storage origin, image format, or output width.
- New object key is `detail-page-images/{organizationId}/{revisionId}/wing-client-jpeg-v1-780.jpg`.
- Wing receives exactly one finalized object-storage URL and never a blob or data URL.
- Existing `wing-jpeg-v1` artifacts remain readable only when represented by the new durable artifact contract; new writes always use the client variant.
- Schema change is compatible and requires `db:push`; no data backfill is required.
- Increment the Coupang extension manifest version and add only `debugger` plus exact local/staging storage upload origins.
- Do not auto-submit a Wing product as part of implementation or verification.

---

### Task 1: Shared client-render contract

**Files:**
- Modify: `packages/shared/src/schemas/ai.ts`
- Test: `packages/shared/src/schemas/ai.spec.ts`

**Interfaces:**
- Produces: `DetailPageClientRenderPrepareResponseSchema`, `DetailPageClientRenderClaimResponseSchema`, `DetailPageClientRenderDocumentResponseSchema`, `DetailPageClientRenderStatusResponseSchema`, `DetailPageClientRenderFinalizeBodySchema`, and `DetailPageClientRenderFailBodySchema` from `@kiditem/shared/ai`.

- [ ] **Step 1: Write failing schema tests** that parse `ready`, `render_required`, and `missing`, reject arbitrary widths and URLs in request bodies, and bound failure messages to 300 characters.
- [ ] **Step 2: Run** `npm exec --workspace=packages/shared vitest -- run src/schemas/ai.spec.ts`; expect failures for missing schemas.
- [ ] **Step 3: Add Zod schemas** with fixed literals `wing-client-jpeg-v1`, `image/jpeg`, layout width `720`, and output width `780`.
- [ ] **Step 4: Re-run the focused shared test** and expect all cases to pass.

### Task 2: Durable artifact and render-intent persistence

**Files:**
- Modify: `prisma/models/ai.prisma`
- Modify: `prisma/models/core.prisma`
- Modify: `prisma/models/sourcing.prisma`
- Create: `apps/server/src/ai/application/port/out/repository/detail-page-image.repository.port.ts`
- Modify: `apps/server/src/ai/application/port/out/repository/index.ts`
- Create: `apps/server/src/ai/adapter/out/repository/detail-page-image.repository.adapter.ts`
- Test: `apps/server/src/ai/adapter/out/repository/__tests__/detail-page-image.repository.adapter.spec.ts`

**Interfaces:**
- Produces: organization-scoped artifact lookup, active-intent lookup/creation, claim, terminal failure, and transactional finalize operations.
- Consumes: exact candidate/artifact/revision identity from `DetailPageQueryRepositoryPort`.

- [ ] **Step 1: Write failing repository tests** for organization-scoped cache lookup, deterministic active-intent reuse, claimant conflict, and idempotent completion.
- [ ] **Step 2: Run the repository spec** and expect it to fail because the adapter/Prisma delegates do not exist.
- [ ] **Step 3: Add `DetailPageImageArtifact`** with unique `[organizationId, revisionId, variant, outputWidth]` and exact metadata fields from the design.
- [ ] **Step 4: Add `DetailPageImageRenderIntent`** with bound candidate/artifact/revision identity, server-derived key, state, expiry, claim timestamps, requester/claimant, bounded failure fields, and completed-artifact relation.
- [ ] **Step 5: Implement the repository adapter** with every single-resource predicate including `organizationId`; completion uses a Prisma transaction and upserts the unique artifact before marking the intent completed.
- [ ] **Step 6: Generate Prisma types** with `npx prisma generate`, then rerun the focused repository test.

### Task 3: Presigned upload and stored-JPEG verification

**Files:**
- Modify: `apps/server/package.json`
- Modify: `package-lock.json`
- Modify: `apps/server/src/ai/application/port/out/storage/image-storage.port.ts`
- Modify: `apps/server/src/common/storage/storage.service.ts`
- Modify: `apps/server/src/common/storage/__tests__/storage.service.spec.ts`

**Interfaces:**
- Produces:

```ts
createPresignedPut(input: {
  key: string;
  contentType: 'image/jpeg';
  expiresInSeconds: number;
  metadata: Record<string, string>;
}): Promise<{ uploadUrl: string; headers: Record<string, string>; expiresAt: Date; imageUrl: string }>;

inspectJpeg(input: {
  key: string;
  maxByteLength: number;
}): Promise<{
  contentType: string;
  byteLength: number;
  pixelWidth: number;
  pixelHeight: number;
  sha256: string;
  metadata: Record<string, string>;
}>;
```

- [ ] **Step 1: Add failing storage tests** asserting `PutObjectCommand` presigning contains fixed JPEG/cache metadata and that inspection rejects oversized, non-JPEG, and wrong-width objects.
- [ ] **Step 2: Run the storage spec** and confirm the new methods are absent.
- [ ] **Step 3: Add `@aws-sdk/s3-request-presigner`** and implement short-lived PUT signing without exposing credentials.
- [ ] **Step 4: Implement bounded object inspection** using `HeadObjectCommand`, `GetObjectCommand`, SHA-256, JPEG metadata validation, and the existing Sharp dependency; never accept an arbitrary key from an HTTP body.
- [ ] **Step 5: Re-run the storage spec** and expect all cases to pass.

### Task 4: Render-intent application service and HTTP API

**Files:**
- Create: `apps/server/src/ai/application/service/detail-page-client-render.service.ts`
- Create: `apps/server/src/ai/application/service/detail-page-client-render.service.spec.ts`
- Modify: `apps/server/src/ai/adapter/in/http/detail-page-candidate-image.controller.ts`
- Create: `apps/server/src/ai/adapter/in/http/dto/detail-page-client-render.dto.ts`
- Modify: `apps/server/src/ai/adapter/in/http/dto/index.ts`
- Modify: `apps/server/src/ai/ai.module.ts`
- Modify: `apps/server/src/ai/adapter/in/http/__tests__/detail-page-controllers.spec.ts`

**Interfaces:**
- Produces the six fixed HTTP contracts under `/api/ai/detail-page-image`.
- Consumes `DetailPageQueryRepositoryPort`, `DetailPageImageRepositoryPort`, `ImageStoragePort`, and compiled template CSS.

- [ ] **Step 1: Write failing service tests** for missing HTML, ready cache hit, deterministic intent issuance, expiry/claim ownership, exact revision document, idempotent finalize, metadata mismatch, and completed-intent failure protection.
- [ ] **Step 2: Run the service spec** and confirm the service is missing.
- [ ] **Step 3: Implement constants** for 15-minute intent expiry, 5-minute upload URL expiry, 10 MiB maximum JPEG size, layout width 720, and output width 780.
- [ ] **Step 4: Implement prepare/claim/document/status/finalize/fail** with organization and current-user scope. Build the document from the bound revision using `buildRenderDocument`, compiled template CSS, and the public API origin; return `Cache-Control: no-store` on document/status/claim responses.
- [ ] **Step 5: Add controller DTO validation** that accepts only finalize observations (`byteLength`, `sha256`, `pixelWidth`, `pixelHeight`) and bounded failure code/message.
- [ ] **Step 6: Add module wiring and controller route metadata tests**, then run the focused server tests.

### Task 5: Remove the server raster job path

**Files:**
- Modify: `apps/server/src/ai/application/service/detail-page-query.service.ts`
- Modify: `apps/server/src/ai/application/service/ai-direct-job-processor.service.ts`
- Modify: `apps/server/src/ai/application/service/ai-direct-job.config.ts`
- Modify: `apps/server/src/ai/application/port/out/repository/ai-direct-job.repository.port.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/ai-direct-job.repository.adapter.ts`
- Modify: `apps/server/src/ai/domain/direct-job/ai-direct-job.schema.ts`
- Modify: `apps/server/src/ai/ai.module.ts`
- Delete: `apps/server/src/ai/application/service/detail-page-raster-job.service.ts`
- Delete: `apps/server/src/ai/application/service/detail-page-raster-job.service.spec.ts`
- Delete: `apps/server/src/ai/application/service/detail-page-raster-job-executor.service.ts`
- Delete: `apps/server/src/ai/application/service/detail-page-raster-job-executor.service.spec.ts`
- Delete: `apps/server/src/ai/domain/direct-job/detail-page-raster-job.ts`
- Delete: `apps/server/src/ai/domain/direct-job/detail-page-raster-job.spec.ts`
- Modify: affected direct-job and module specs.

**Interfaces:**
- Preserves `DetailPageRevision` editor persistence and the separate manual render-image controller.
- Removes the `detail_page_rasterize` direct-job discriminator and all save-time/prepare-time scheduling.

- [ ] **Step 1: Add a failing regression assertion** that editor save does not create or release a detail raster job and the processor has no raster branch.
- [ ] **Step 2: Run the regression spec** and confirm current scheduling makes it fail.
- [ ] **Step 3: Remove `DetailPageRasterJobService` from editor save and candidate preparation.**
- [ ] **Step 4: Remove raster job schemas, repository method, processor/config branches, executor wiring, and obsolete tests/files.**
- [ ] **Step 5: Keep `DetailPageRasterizationService` only for `RenderImageController`; verify no Wing/client-render code imports it.**
- [ ] **Step 6: Run all focused AI direct-job, editor, candidate-image, controller, and wiring specs.**

### Task 6: Dedicated authenticated render route

**Files:**
- Create: `apps/web/src/app/(product-pipeline)/detail-page-client-render/page.tsx`
- Create: `apps/web/src/app/(product-pipeline)/detail-page-client-render/DetailPageClientRenderSurface.tsx`
- Create: `apps/web/src/app/(product-pipeline)/detail-page-client-render/render-document.ts`
- Test: `apps/web/src/app/(product-pipeline)/detail-page-client-render/render-document.spec.ts`

**Interfaces:**
- Consumes `GET /api/ai/detail-page-image/render-intents/:intentId/document` through `apiClient`.
- Produces top-level dataset markers `kiditemRenderStatus`, `kiditemIntentId`, `kiditemRevisionId`, `kiditemContentWidth`, and `kiditemContentHeight` for the extension.

- [ ] **Step 1: Write failing pure-helper tests** that strip all scripts/event handlers, preserve images/styles, and reject missing intent UUIDs.
- [ ] **Step 2: Run the route-local test** and confirm helpers are missing.
- [ ] **Step 3: Implement a shell-free client route** that loads the protected document, inserts sanitized HTML into a borderless `sandbox="allow-same-origin"` iframe at 720 CSS pixels, forces eager image decode, waits for fonts and two animation frames, sets the iframe height, and exposes `ready` only when every required asset loaded.
- [ ] **Step 4: Re-run the route-local test.**

### Task 7: Chrome extension CDP renderer and retry cache

**Files:**
- Modify: `extensions/coupang-ads-scraper/manifest.json`
- Create: `extensions/coupang-ads-scraper/background/detail-page-client-raster.js`
- Modify: `extensions/coupang-ads-scraper/background/service-worker.js`
- Create: `extensions/tests/coupang-ads-scraper/detail-page-client-raster.test.mjs`
- Modify: `extensions/tests/coupang-ads-scraper/manifest-permissions.test.mjs`

**Interfaces:**
- Consumes verified external port `kiditem-detail-page-raster-v1` and only `{ action: 'renderDetailPageImage', intentId: UUID }`.
- Produces progress `loading|capturing|uploading|finalizing` and exactly one terminal `rendered|failed` message.

- [ ] **Step 1: Write failing extension tests** for sender-origin rejection, exact owned tab, CDP command order, one capture call, JPEG validation, upload/finalize, cache retry without recapture, debugger detach, and renderer-tab close.
- [ ] **Step 2: Run the new Node test** and confirm the module is missing.
- [ ] **Step 3: Implement the renderer module** with injected Chrome/fetch/environment dependencies, dimension/JPEG parsers, 15-second readiness polling, bounded errors, and `finally` cleanup.
- [ ] **Step 4: Implement IndexedDB cache** keyed by intent ID with revision/variant/width/expiry validation, 3-entry/20-MiB bounds, upload retry reuse, and deletion after finalize.
- [ ] **Step 5: Register `onConnectExternal`**, advertise `detailPageClientRasterV1`, add `debugger`, increment manifest version, and add exact local MinIO plus staging Supabase storage host permissions.
- [ ] **Step 6: Run extension tests and syntax/manifest checks.**

### Task 8: Web Wing coordinator cutover

**Files:**
- Modify: `apps/web/src/lib/extension-bridge.ts`
- Test: `apps/web/src/lib/extension-bridge.spec.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/detail-page-image-api.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.spec.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/hooks/useWingRegistrationPreparation.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/hooks/useWingRegistrationPreparation.spec.tsx`

**Interfaces:**
- Consumes the shared prepare/status contracts and the external extension port.
- Produces the existing `WingRegistrationDraft.detailImageUrl`, sourced only from a finalized `ready` artifact.

- [ ] **Step 1: Write failing web tests** for ready reuse, render-required port progress, outdated extension blocking, terminal capture failure, disconnect status recovery, exact one-image Wing payload, and no Wing form open before finalize.
- [ ] **Step 2: Run the focused web tests** and confirm current processing/polling behavior fails them.
- [ ] **Step 3: Add external-port support** to `extension-bridge.ts` with bounded timeout, disconnect cleanup, progress callback, and one terminal result.
- [ ] **Step 4: Replace the old render API wrapper** with prepare/status calls using shared schemas.
- [ ] **Step 5: Update `prepareWingRegistration`** to save missing generated HTML when necessary, execute client rendering for `render_required`, recover final status, require a finalized `ready` URL, and then build the existing one-image product.
- [ ] **Step 6: Update the preparation hook** to show the current render phase without polling a server worker.
- [ ] **Step 7: Run the focused lib/hook tests.**

### Task 9: Architecture, release notes, and full verification

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/runbooks/coupang-wing-catalog-collection.md`
- Modify: `apps/server/src/ai/AGENTS.md`

**Interfaces:**
- Documents extension ownership of rasterization, server artifact authority, new permission/operator warning, exact host allowlist, reload/version check, no server fallback, and staging acceptance.

- [ ] **Step 1: Update durable documentation** and remove text that claims saved Wing detail images are produced by a server direct job.
- [ ] **Step 2: Run `npm run check:agents-hygiene`.**
- [ ] **Step 3: Run schema gates:** `npm run db:push`, `npx prisma generate`, `npm run build --workspace=packages/shared`, `npm run db:erd`, and `npm run graphify:schema`.
- [ ] **Step 4: Run backend gates:** focused Vitest suites, `npm run build --workspace=apps/server`, `npm run check:idor`, `npm run check:tenant-scope`, then `npm run dev:server` and confirm boot.
- [ ] **Step 5: Run frontend gates:** focused product-pipeline/lib tests and `npm run build --workspace=apps/web`.
- [ ] **Step 6: Run extension gates:** `node --test extensions/tests/*.test.mjs`, `node --check extensions/coupang-ads-scraper/background/service-worker.js`, manifest JSON parse, and `git diff --check -- extensions`.
- [ ] **Step 7: Repeat the company-Chrome staging fixture test** without Wing submit: one capture, 780-pixel JPEG, direct object upload, finalized artifact under 30 seconds, second prepare cache hit, and no server raster job/Chromium.
- [ ] **Step 8: Run `git diff --check`, inspect the full diff, and record `db:push` with no backfill in the PR body.**

## Self-review

- Spec coverage: every fixed server route, extension port phase, durable model, storage boundary, one-image invariant, no-fallback rule, and staging acceptance criterion maps to a task.
- Reconstruction order: contracts and regression gates precede removal of the server raster path.
- Type consistency: shared response status names are `ready`, `render_required`, and `missing`; intent terminal state is `completed`; extension terminal message is `rendered` or `failed`.
- Security: every server mutation receives organization scope from auth, the server derives the object key and origins, and the extension derives environment from the verified sender.
- Resource constraint: the server may inspect the completed bounded object but never receives the browser upload body and never launches Chromium for Wing preparation.
- Placeholder scan: the plan contains no deferred implementation steps or unspecified error-handling instructions.
