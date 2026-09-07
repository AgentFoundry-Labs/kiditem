# Coupang WING Detail Image Async Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WING registration preparation return quickly by moving saved-detail-page rasterization out of the HTTP request, pre-rendering the immutable saved revision through the durable worker, and polling only the cached result.

**Architecture:** A saved `DetailPageRevision` remains the source of truth. Its Coupang JPEG rendition is represented by an existing `AiDirectJob` whose deterministic `sourceResourceId` includes revision, width, format, and renderer version. The worker loads the exact revision, renders it with Puppeteer, saves it under a deterministic storage key, and checkpoints the image metadata. The candidate endpoint only reads or schedules that durable job; it never launches Chromium. Editor saves enqueue the default 780px rendition immediately, while old revisions are repaired lazily on the first WING request. The web client uses TanStack Query `refetchInterval` to poll `processing` status before opening the registration confirmation modal.

**Tech Stack:** TypeScript, NestJS, Prisma/PostgreSQL-backed `AiDirectJob`, Puppeteer, Zod, Next.js, TanStack Query, Vitest.

## Global Constraints

- This is a same-domain cross-layer bug fix in detail-page/WING registration, not a reconstruction or top-level ownership change.
- Do not add a second queue or an in-memory worker. Reuse `AiDirectJob` durability, lease, retry, and checkpoint behavior.
- Do not add a Prisma model: the successful `AiDirectJob.result` is the immutable rendition manifest, and the JPEG bytes remain in existing image storage.
- Never call `DetailPageRasterizationService.render` from the candidate HTTP request.
- Keep organization fencing on every revision and job lookup.
- The current `VERSION` remains unchanged and no DB push/backfill is required. Existing saved revisions are lazy-enqueued.
- Do not modify the unrelated user-owned `scripts/__tests__/manage-extension-release.spec.ts` change.
- Do not commit, push, or deploy without explicit user authorization.

## Task 1: Extend the durable job contract for detail-page rasterization

**Files:**

- Modify: `apps/server/src/ai/domain/direct-job/ai-direct-job.schema.ts`
- Create: `apps/server/src/ai/domain/direct-job/detail-page-raster-job.ts`
- Create: `apps/server/src/ai/domain/direct-job/detail-page-raster-job.spec.ts`
- Modify: `apps/server/src/ai/application/port/out/repository/ai-direct-job.repository.port.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/ai-direct-job.repository.adapter.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/__tests__/ai-direct-job.repository.adapter.spec.ts`

- [ ] Write failing tests for a deterministic UUID job key, strict raster payload/output parsing, source lookup, and terminal-job restart.

- [ ] Run and confirm the expected failures:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/ai/domain/direct-job/detail-page-raster-job.spec.ts src/ai/adapter/out/repository/__tests__/ai-direct-job.repository.adapter.spec.ts
```

- [ ] Add the deterministic contract:

```ts
export const DETAIL_PAGE_RASTER_JOB_TYPE = 'detail_page_rasterize' as const;
export const DETAIL_PAGE_RASTER_VARIANT_VERSION = 'wing-jpeg-v1' as const;

export const DetailPageRasterJobInputSchema = z.object({
  revisionId: z.string().uuid(),
  artifactId: z.string().uuid(),
  outputWidth: z.number().int().min(320).max(1600),
}).strict();

export const DetailPageRasterJobOutputSchema = z.object({
  revisionId: z.string().uuid(),
  artifactId: z.string().uuid(),
  imageUrl: z.string().url(),
  outputWidth: z.number().int().min(320).max(1600),
  contentType: z.literal('image/jpeg'),
  byteLength: z.number().int().positive(),
}).strict();
```

`detailPageRasterJobSourceId(revisionId, outputWidth)` must produce the same RFC-4122 UUID for the same revision/variant and a different UUID when the width or renderer version changes.

- [ ] Extend `AiDirectJobEnvelopeSchema`, `AiDirectJobCheckpointSchema`, and `AiDirectJobTypeSchema` with `detail_page_rasterize` and empty strict `models`.

- [ ] Add repository operations:

```ts
findBySource(input: {
  organizationId: string;
  jobType: AiDirectJobType;
  sourceResourceId: string;
}): Promise<AiDirectJobRecord | null>;

restartHeldRasterization(
  input: CreateAiDirectJobInput & { jobType: 'detail_page_rasterize' },
): Promise<AiDirectJobRecord>;
```

The restart upsert resets only `failed` or `cancelled` jobs. It must preserve `held`, `pending`, `running`, `projecting`, and `succeeded` rows so duplicate requests cannot discard live work or a cached result.

- [ ] Run the focused tests until they pass.

## Task 2: Execute rasterization only in the durable worker

**Files:**

- Create: `apps/server/src/ai/application/service/detail-page-raster-job.service.ts`
- Create: `apps/server/src/ai/application/service/detail-page-raster-job.service.spec.ts`
- Create: `apps/server/src/ai/application/service/detail-page-raster-job-executor.service.ts`
- Create: `apps/server/src/ai/application/service/detail-page-raster-job-executor.service.spec.ts`
- Modify: `apps/server/src/ai/application/service/ai-direct-job-processor.service.ts`
- Modify: `apps/server/src/ai/application/service/__tests__/ai-direct-job-processor.service.spec.ts`
- Modify: `apps/server/src/ai/application/port/out/repository/detail-page-query.repository.port.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/detail-page-query.repository.adapter.ts`
- Modify: `apps/server/src/ai/ai.module.ts`
- Modify: `apps/server/src/ai/__tests__/ai.module.wiring.spec.ts`

- [ ] Write failing executor tests proving it loads the exact organization-scoped revision, produces the 720px-layout-to-780px JPEG, and stores it at:

```text
detail-page-images/<organizationId>/<revisionId>/wing-jpeg-v1-<outputWidth>.jpg
```

- [ ] Add an exact-revision repository query:

```ts
findDetailPageRevisionHtml(input: {
  organizationId: string;
  revisionId: string;
  artifactId: string;
}): Promise<CandidateDetailPageHtmlSnapshot | null>;
```

- [ ] Implement `DetailPageRasterJobExecutorService.execute()` using the existing `buildRenderDocument`, template CSS port, rasterization service, and image storage port. Check the abort signal before loading, before rendering, and before saving.

- [ ] Implement `DetailPageRasterJobService.ensureScheduled()` and `statusForRevision()`:

  - create/restart a held job with `maxAttempts: 3`;
  - release only a held job and wake the worker;
  - parse a succeeded checkpoint before returning it;
  - return `processing` for held/pending/running/projecting;
  - restart failed/cancelled work on an explicit ensure call;
  - never overwrite a succeeded checkpoint.

- [ ] Route `detail_page_rasterize` through all processor phases:

  - preflight validates that the exact revision still exists;
  - execute delegates to the raster executor;
  - project validates `DetailPageRasterJobOutputSchema` and performs no second storage write;
  - terminal failure remains on the direct job for the status endpoint.

- [ ] Wire both services in `AiModule` and add the wiring regression assertion.

- [ ] Run focused tests:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/ai/application/service/detail-page-raster-job.service.spec.ts src/ai/application/service/detail-page-raster-job-executor.service.spec.ts src/ai/application/service/__tests__/ai-direct-job-processor.service.spec.ts src/ai/__tests__/ai.module.wiring.spec.ts
```

## Task 3: Make save and candidate-image APIs schedule/read instead of render

**Files:**

- Modify: `apps/server/src/ai/application/service/detail-page-candidate-image.service.ts`
- Modify: `apps/server/src/ai/application/service/__tests__/detail-page-candidate-image.service.spec.ts`
- Modify: `apps/server/src/ai/application/service/detail-page-query.service.ts`
- Modify: `apps/server/src/ai/application/service/__tests__/detail-page-query.service.spec.ts`
- Modify: `apps/server/src/ai/application/port/out/repository/detail-page-query.repository.port.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/detail-page-query.repository.adapter.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/__tests__/detail-page-query.repository.adapter.spec.ts`
- Modify: `apps/server/src/ai/adapter/in/http/detail-page-candidate-image.controller.ts`

- [ ] Replace the old synchronous service test with failing tests for:

  - cached success returns `rendered` without calling Puppeteer or storage;
  - a legacy revision without a job is enqueued and returns `processing` immediately;
  - a running job returns `processing` without another enqueue;
  - missing and blank saved pages keep their explicit responses;
  - all lookups and schedules include `organizationId`.

- [ ] Expand the response union:

```ts
type CandidateDetailImageResult =
  | { status: 'rendered'; imageUrl: string; outputWidth: number; contentType: string; byteLength: number; revisionId: string; artifactId: string }
  | { status: 'processing'; revisionId: string; artifactId: string; message: string }
  | { status: 'failed'; revisionId: string; artifactId: string; message: string }
  | { status: 'missing'; reason: 'no_saved_detail_page' | 'empty_html'; message: string };
```

- [ ] Return `revisionId` and `artifactId` from `saveEditedHtmlRevision`. After the revision transaction commits, `DetailPageQueryService.saveEditedHtml()` calls `ensureScheduled()` for the default 780px rendition and returns the normal save response without waiting for rendering.

- [ ] Preserve save success if enqueue fails only when the revision itself was committed; log the enqueue error and rely on lazy enqueue from the candidate endpoint. Do not hide validation or revision-save failures.

- [ ] Update controller documentation to state that POST is idempotent prepare/status behavior and never performs synchronous rasterization.

- [ ] Run focused backend tests and assert no candidate-service test has a rasterizer mock.

## Task 4: Poll render readiness before opening the WING confirmation modal

**Files:**

- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/detail-page-image-api.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.spec.ts`
- Create: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/hooks/useWingRegistrationPreparation.ts`
- Create: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/hooks/useWingRegistrationPreparation.spec.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/page.tsx`

- [ ] Add `processing` and `failed` to `CandidateDetailImageResponse` and make `prepareWingRegistration()` return a discriminated preparation result:

```ts
type WingRegistrationPreparationResult =
  | { status: 'ready'; draft: WingRegistrationDraft }
  | { status: 'processing'; candidateId: string; message: string }
  | { status: 'failed'; candidateId: string; message: string };
```

The existing no-saved-page auto-save path remains: save the generated HTML, then receive `processing` while its job runs.

- [ ] Write a hook test proving TanStack Query polls every two seconds only while `processing`, stops on `ready`/`failed`, and invokes the ready/error callback once.

- [ ] Implement the polling in the extracted hook with `refetchInterval`; do not add `setInterval` or render orchestration to the existing 700+ line page.

- [ ] Replace `handleModalWingRegister`'s local async preparation with the hook. Keep the button disabled and show “상세페이지 이미지 준비 중” while polling, then open the existing confirmation dialog only on `ready`.

- [ ] Run focused web tests:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.spec.ts' 'src/app/(product-pipeline)/product-pipeline/collected-products/hooks/useWingRegistrationPreparation.spec.tsx'
```

## Task 5: Verify the complete change

**Files:**

- Verify all changed files above.

- [ ] Run the affected backend suite, type/build gates, and boot gate:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/ai/domain/direct-job/detail-page-raster-job.spec.ts src/ai/application/service/detail-page-raster-job.service.spec.ts src/ai/application/service/detail-page-raster-job-executor.service.spec.ts src/ai/application/service/__tests__/detail-page-candidate-image.service.spec.ts src/ai/application/service/__tests__/detail-page-query.service.spec.ts src/ai/application/service/__tests__/ai-direct-job-processor.service.spec.ts src/ai/adapter/out/repository/__tests__/ai-direct-job.repository.adapter.spec.ts src/ai/adapter/out/repository/__tests__/detail-page-query.repository.adapter.spec.ts src/ai/__tests__/ai.module.wiring.spec.ts
rtk npm run build --workspace=apps/server
rtk npm run dev:server
```

Confirm Nest boots, then stop the development server cleanly.

- [ ] Run the frontend suite and required build:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.spec.ts' 'src/app/(product-pipeline)/product-pipeline/collected-products/hooks/useWingRegistrationPreparation.spec.tsx'
rtk npm run build --workspace=apps/web
```

- [ ] Run the full web test gate required by the scoped guide:

```bash
rtk npx vitest run
```

- [ ] Inspect the final diff and confirm the unrelated release-spec edit is untouched:

```bash
rtk git diff --check
rtk git status --short
rtk git diff -- scripts/__tests__/manage-extension-release.spec.ts
```

- [ ] Report implementation and verification evidence. Do not claim staging is fixed until a later authorized deployment and live verification occur.
