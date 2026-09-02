# AI Media Generation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make thumbnail generation, detail-page image generation, and image editing secure against hostile media URLs, atomic at the detail-page projection boundary, durable across server restarts, cancellable through provider calls, and consistent with the web request/response contracts.

**Architecture:** Keep direct media generation inside the AI owner domain; do not create Agent OS runs. Introduce an AI-owned PostgreSQL job ledger that reuses the repository's established `FOR UPDATE SKIP LOCKED` claim pattern, stores provider output before projection, and resumes projection without repeating a completed model call. Harden both sides of the provider boundary: guarded streaming input fetches and decoded/normalized generated-image output before object storage.

**Tech Stack:** NestJS 11, Prisma 7/PostgreSQL, `@google/genai`, Undici, Sharp, Next.js, React Query, Vitest, TypeScript.

## Global Constraints

- Classification: AI-domain reconstruction across backend, Prisma, and product-pipeline web; the durable job boundary and media trust boundary are the explicit cross-layer controls.
- Direct thumbnail/detail/image-edit jobs remain AI domain jobs and must not create `AgentRunRequest` or `AgentRun` rows.
- Reuse the existing PostgreSQL claim pattern; do not add Redis, BullMQ, pg-boss, or another queue dependency.
- `organizationId` is present in every mutation, claim, status lookup, cancellation, and projection predicate.
- Model IDs are captured explicitly when the job is enqueued. Missing `AI_IMAGE_MODEL`, `AI_TEXT_MODEL`, or `AI_IMAGE_ANALYSIS_MODEL` is a request-time configuration error; no adapter fallback is allowed.
- Queue payloads never store base64 image bodies. Persist input images to object storage and keep only managed URLs, keys, MIME, size, and labels in PostgreSQL.
- Generated-image limits are `20 MiB`, `40,000,000` pixels, and `8,192 px` on either dimension. Accepted output formats remain JPEG, PNG, and WebP.
- Public input fetch limits remain `10 MiB`, four redirects, and 15 seconds per hop.
- Provider HTTP timeout is 120 seconds for text/vision/image-edit/thumbnail calls. Detail-page generated-image orchestration keeps its existing 15-minute overall budget but aborts all in-flight children when that budget expires.
- Cancellation is best-effort at the external provider after request submission, but cancelled results must never be projected as current content.
- `VERSION` remains `0.1.24`; the planning baseline is `origin/main=0.1.7` and `origin/develop=0.1.24`. Release decision: `keep VERSION 0.1.24; add compatible AI job ledger schema and registered v0.1.24 artifact-deduplication migration`.
- No user-visible route, response status vocabulary, editor layout, or polling interval changes except the corrected image-edit cancellation race.

---

### Task 1: Repair web thumbnail and image-edit contracts

**Files:**
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/lib/slots.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/lib/build-generate-thumbnail-dto.spec.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/detail-editor/lib/image-edit-task.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/detail-editor/lib/image-edit-task.test.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/detail-editor/AIImageEditPanel.tsx`
- Create: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/detail-editor/AIImageEditPanel.test.tsx`

**Interfaces:**
- Produces: `GenerateDto.colorCount?: number`, equal to `colorImages.length` only for `editCase === 'color-variants'`.
- Produces: `sceneType` omitted when the UI selection is `custom-reference`.
- Produces: `ImageEditCancelResult` with `status`, `jobId`, `operationKey`, and `preserved`.
- Consumes: existing `/api/thumbnail-editor/generate` and `/api/image-ai/tasks/:taskId/cancel` routes.

- [ ] **Step 1: Add failing thumbnail payload tests**

Add fixtures that exercise the two route contracts:

```ts
function slot(kind: Slot['kind'], value: string): Slot {
  return {
    id: `${kind}-${value}`,
    kind,
    label: kind === 'color_variant' ? 'Color variant' : 'Main product',
    role: kind === 'color_variant' ? 'color_variant' : 'product',
    value,
    source: 'upload',
  };
}

it('sends the color count with color variant images', () => {
  const dto = buildGenerateThumbnailDto({
    mode: 'edit',
    slots: [
      slot('color_variant', 'https://cdn.example.com/red.jpg'),
      slot('color_variant', 'https://cdn.example.com/blue.jpg'),
    ],
    contentWorkspaceId: 'workspace-1',
    sourceCandidateId: null,
    supplementaryLabel: '',
    pieceCount: null,
    imageOnly: true,
    userPrompt: '',
    sceneType: 'white-studio',
    styleType: 'minimal',
    productDescription: '',
    productName: '컬러 완구',
    effectiveProductImage: null,
    layout: 'auto',
  });

  expect(dto).toMatchObject({
    colorImages: [
      'https://cdn.example.com/red.jpg',
      'https://cdn.example.com/blue.jpg',
    ],
    colorCount: 2,
  });
});

it('strips the UI-only custom-reference scene type', () => {
  const dto = slotsToDto(
    [slot('product', 'https://cdn.example.com/product.jpg')],
    'single',
    {
      mode: 'creative',
      purpose: 'quality',
      sceneType: 'custom-reference',
      styleType: 'minimal',
    },
  );

  expect(dto.sceneType).toBeUndefined();
});
```

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/lib/build-generate-thumbnail-dto.spec.ts'
```

Expected: FAIL because `GenerateDto` has no `colorCount` and `sceneType` is forwarded unchanged.

- [ ] **Step 2: Implement the exact payload normalization**

Add `colorCount?: number` to `GenerateDto`, then return:

```ts
colorImages: editCase === 'color-variants' ? colorValues : undefined,
colorCount:
  editCase === 'color-variants' && colorValues.length > 0
    ? colorValues.length
    : undefined,
sceneType:
  mode === 'creative' && sceneType !== 'custom-reference'
    ? sceneType
    : undefined,
```

Do not change `backgroundReference`; it remains the actual reference image sent for the UI-only scene selection.

- [ ] **Step 3: Type the cancellation response and add the completion-won-race test**

Define and return the backend contract:

```ts
export interface ImageEditCancelResult {
  status: 'cancelled' | 'already_terminal' | 'not_found';
  jobId: string;
  operationKey: string | null;
  preserved: boolean;
}

export async function cancelImageEditTask(
  taskId: string,
  reason = '사용자 요청',
): Promise<ImageEditCancelResult> {
  return apiClient.post<ImageEditCancelResult>(
    `/api/image-ai/tasks/${encodeURIComponent(taskId)}/cancel`,
    { reason },
  );
}
```

In `AIImageEditPanel.test.tsx`, mock cancellation as:

```ts
cancelImageEditTask.mockResolvedValue({
  status: 'already_terminal',
  jobId: 'image-job-1',
  operationKey: 'image-edit:image-job-1',
  preserved: true,
});
pollImageEditTaskResult.mockResolvedValue({
  image_url: 'https://cdn.example.com/completed.png',
});
```

Assert that clicking `중단` calls `onEditComplete('https://cdn.example.com/completed.png')` once.

- [ ] **Step 4: Preserve a result that completed before cancellation**

Replace the unconditional cancellation handling with:

```ts
const cancelled = await cancelImageEditTask(taskId, '사용자 요청');
if (cancelled.status === 'already_terminal' && cancelled.preserved) {
  const completed = await pollImageEditTaskResult(taskId, {
    maxAttempts: 1,
    sleep: async () => undefined,
  });
  onEditComplete(completed.image_url);
}
setError(null);
```

Keep polling aborted before the cancellation request so the original polling loop cannot apply the same result twice.

- [ ] **Step 5: Run focused web verification**

```bash
rtk npm exec --workspace=apps/web vitest -- run \
  'src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/lib/build-generate-thumbnail-dto.spec.ts' \
  'src/app/(product-pipeline)/product-pipeline/_shared/components/detail-editor/lib/image-edit-task.test.ts' \
  'src/app/(product-pipeline)/product-pipeline/_shared/components/detail-editor/AIImageEditPanel.test.tsx'
```

Expected: PASS.

- [ ] **Step 6: Commit the client contract repairs**

```bash
rtk git add \
  'apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/lib/slots.ts' \
  'apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/lib/build-generate-thumbnail-dto.spec.ts' \
  'apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/detail-editor/lib/image-edit-task.ts' \
  'apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/detail-editor/lib/image-edit-task.test.ts' \
  'apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/detail-editor/AIImageEditPanel.tsx' \
  'apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/detail-editor/AIImageEditPanel.test.tsx'
rtk git commit -m "fix: align ai media client contracts"
```

### Task 2: Harden inbound and generated image boundaries

**Files:**
- Create: `apps/server/src/ai/adapter/out/image-fetch/public-image-lookup.ts`
- Create: `apps/server/src/ai/adapter/out/image-fetch/response-byte-reader.ts`
- Create: `apps/server/src/ai/application/port/out/provider/generated-image-validator.port.ts`
- Modify: `apps/server/src/ai/application/port/out/provider/index.ts`
- Create: `apps/server/src/ai/adapter/out/image-validation/sharp-generated-image-validator.adapter.ts`
- Create: `apps/server/src/ai/adapter/out/image-validation/__tests__/sharp-generated-image-validator.adapter.spec.ts`
- Modify: `apps/server/src/ai/adapter/out/image-fetch/thumbnail-image-fetcher.adapter.ts`
- Modify: `apps/server/src/ai/__tests__/thumbnail-image-fetcher.service.spec.ts`
- Modify: `apps/server/src/ai/application/port/out/provider/image-fetch.port.ts`
- Modify: `apps/server/src/ai/application/service/thumbnail-editor-ai.service.ts`
- Modify: `apps/server/src/ai/application/port/out/provider/image-edit-media.port.ts`
- Modify: `apps/server/src/ai/adapter/out/gemini/image-edit-gemini-media.adapter.ts`
- Modify: `apps/server/src/ai/application/service/image-edit-direct-generation-executor.service.ts`
- Modify: `apps/server/src/ai/adapter/out/gemini/detail-page-gemini-media.adapter.ts`
- Modify: `apps/server/src/ai/application/service/detail-page-hero-image.service.ts`
- Modify: `apps/server/src/ai/ai.module.ts`
- Modify: `apps/server/src/ai/__tests__/ai.module.wiring.spec.ts`
- Modify: `apps/server/src/ai/__tests__/thumbnail-editor-ai.service.spec.ts`
- Modify: `apps/server/src/ai/adapter/out/gemini/__tests__/image-edit-gemini-media.adapter.spec.ts`
- Modify: `apps/server/src/ai/application/service/__tests__/detail-page-hero-image.service.spec.ts`

**Interfaces:**
- Produces: `publicImageDispatcher`, whose Undici `lookup` callback returns only DNS records that pass `assertPublicIpAddress`.
- Produces: `readResponseBytes(response, maxBytes): Promise<Buffer>` that cancels the body reader at `maxBytes + 1`.
- Produces: `GENERATED_IMAGE_VALIDATOR_PORT` with `validate(input): Promise<ValidatedGeneratedImage>` and a Sharp-backed adapter.
- Consumes: `assertPublicHttpUrl`, `assertPublicIpAddress`, and the existing JPEG/PNG/WebP allowlist.

- [ ] **Step 1: Add failing DNS and streaming-limit tests**

Mock `node:dns/promises.lookup` and assert:

```ts
lookupMock.mockResolvedValueOnce([
  { address: '169.254.169.254', family: 4 },
]);

await expect(
  fetcher.fetchImage('https://attacker.example/image.png'),
).rejects.toBeInstanceOf(BadRequestException);
expect(fetchMock).not.toHaveBeenCalled();
```

Add a redirect case where the first hostname resolves publicly and the redirect hostname resolves privately. Add a stream that emits `MAX_FETCH_BYTES` followed by one extra byte and assert its `cancel()` spy is called without buffering the remaining chunks.

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/ai/__tests__/thumbnail-image-fetcher.service.spec.ts
```

Expected: FAIL because hostnames are not resolved and the body is read with `arrayBuffer()`.

- [ ] **Step 2: Implement DNS validation and connection pinning**

Use the already established Undici pattern from `Direct1688ImageSearchAdapter`:

```ts
export const publicImageDispatcher = new Agent({
  connect: { lookup: publicImageLookup },
});

export async function assertSafePublicImageUrl(url: URL): Promise<void> {
  assertPublicHttpUrl(url.toString());
  const host = normalizeLookupHost(url.hostname);
  const records = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await dns.lookup(host, { all: true, verbatim: true });
  if (records.length === 0) throw new PublicUrlError('image host lookup returned no addresses');
  records.forEach((record) => assertPublicIpAddress(record.address));
}
```

The dispatcher lookup repeats the same validation at connect time. Call `assertSafePublicImageUrl()` on every redirect hop, then fetch with:

```ts
await fetch(url, {
  dispatcher: publicImageDispatcher,
  redirect: 'manual',
  signal: combinedSignal,
} as RequestInit & { dispatcher: Agent });
```

Trusted own-storage URLs retain their existing bypass and must not use the public dispatcher.

- [ ] **Step 3: Stream the response with a hard byte ceiling**

Implement the reader as:

```ts
export async function readResponseBytes(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new BadRequestException('image too large');
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('image too large');
        throw new BadRequestException('image too large');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  } finally {
    reader.releaseLock();
  }
}
```

Replace `response.arrayBuffer()` in the AI fetcher.

- [ ] **Step 4: Add failing generated-image validation tests**

Cover declared MIME mismatch, invalid bytes, `20 MiB + 1`, width over 8,192, and pixel count over 40,000,000. Include one valid PNG fixture and assert the detected result:

```ts
expect(await validator.validate({
  buffer: validPng,
  declaredMimeType: 'image/png',
})).toMatchObject({
  mimeType: 'image/png',
  width: 32,
  height: 32,
});
```

Expected invalid cases: reject with `GeneratedImageValidationError` and stable codes `generated_image_too_large`, `generated_image_dimensions_invalid`, or `generated_image_format_invalid`.

- [ ] **Step 5: Decode, bound, and normalize provider output**

Implement:

```ts
export const GENERATED_IMAGE_VALIDATOR_PORT = Symbol(
  'GENERATED_IMAGE_VALIDATOR_PORT',
);

export interface ValidatedGeneratedImage {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
  width: number;
  height: number;
  fileSize: number;
}

export interface GeneratedImageValidatorPort {
  validate(input: {
    buffer: Buffer;
    declaredMimeType?: string | null;
  }): Promise<ValidatedGeneratedImage>;
}

const MAX_GENERATED_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_GENERATED_IMAGE_PIXELS = 40_000_000;
const MAX_GENERATED_IMAGE_DIMENSION = 8_192;

export class GeneratedImageValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GeneratedImageValidationError';
  }
}

@Injectable()
export class SharpGeneratedImageValidatorAdapter
  implements GeneratedImageValidatorPort {
  async validate(input: {
    buffer: Buffer;
    declaredMimeType?: string | null;
  }): Promise<ValidatedGeneratedImage> {
    if (input.buffer.length > MAX_GENERATED_IMAGE_BYTES) {
      throw new GeneratedImageValidationError('generated_image_too_large');
    }
    const image = sharp(input.buffer, {
      failOn: 'error',
      limitInputPixels: MAX_GENERATED_IMAGE_PIXELS,
    });
    const metadata = await image.metadata();
    const detected = mimeForSharpFormat(metadata.format);
    if (!detected || detected !== input.declaredMimeType?.toLowerCase()) {
      throw new GeneratedImageValidationError('generated_image_format_invalid');
    }
    if (!metadata.width || !metadata.height ||
        metadata.width > MAX_GENERATED_IMAGE_DIMENSION ||
        metadata.height > MAX_GENERATED_IMAGE_DIMENSION) {
      throw new GeneratedImageValidationError('generated_image_dimensions_invalid');
    }
    const normalized = await image.rotate().toBuffer();
    return {
      buffer: normalized,
      mimeType: detected,
      extension: extensionForMime(detected),
      width: metadata.width,
      height: metadata.height,
      fileSize: normalized.length,
    };
  }
}

function mimeForSharpFormat(
  format: string | undefined,
): ValidatedGeneratedImage['mimeType'] | null {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'png') return 'image/png';
  if (format === 'webp') return 'image/webp';
  return null;
}

function extensionForMime(
  mimeType: ValidatedGeneratedImage['mimeType'],
): ValidatedGeneratedImage['extension'] {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  return 'webp';
}
```

Do not swallow Sharp failures. The current `remove_background` fallback that stores undecodable original bytes must be removed.

- [ ] **Step 6: Apply validation immediately before every generated-image save**

Bind `GENERATED_IMAGE_VALIDATOR_PORT` to
`SharpGeneratedImageValidatorAdapter` in `AiModule`. Inject the port into
`ThumbnailEditorAiService`, `ImageEditDirectGenerationExecutorService`, and
`DetailPageHeroImageService`, then validate in these exact paths:

```ts
// thumbnail-editor-ai.service.ts
const validated = await this.generatedImageValidator.validate({
  buffer: Buffer.from(inlineData.data, 'base64'),
  declaredMimeType: inlineData.mimeType ?? 'image/png',
});

// image-edit-direct-generation-executor.service.ts
const generated = await this.imageEditMedia.editImage(mediaCommand);
const validated = await this.generatedImageValidator.validate({
  buffer: generated.buffer,
  declaredMimeType: generated.mimeType,
});
const storageKey = `tmp/image-edits/${command.organizationId}/${command.jobId}.${validated.extension}`;
const imageUrl = await this.imageStorage.save(
  storageKey,
  validated.buffer,
  validated.mimeType,
);

// detail-page-hero-image.service.ts
const validated = await this.generatedImageValidator.validate({
  buffer: generated.buffer,
  declaredMimeType: generated.mimeType,
});
```

Storage keys, candidate metadata, and response MIME use the detected values from `validated`, never the provider-declared value.
Change `ImageEditMediaResult` to `{ buffer: Buffer; mimeType: string }`; the
Gemini adapter must not call storage for generated output. The executor returns
the existing `{ image_url }` output only after validation and storage succeed.
Change `ImageEditDirectGenerationCommand.logId?` to required `jobId: string` so
retries overwrite the same managed output key instead of creating orphaned
objects.

- [ ] **Step 7: Run media-boundary verification**

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/ai/__tests__/thumbnail-image-fetcher.service.spec.ts \
  src/ai/adapter/out/image-validation/__tests__/sharp-generated-image-validator.adapter.spec.ts \
  src/ai/__tests__/thumbnail-editor-ai.service.spec.ts \
  src/ai/adapter/out/gemini/__tests__/image-edit-gemini-media.adapter.spec.ts \
  src/ai/application/service/__tests__/detail-page-hero-image.service.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the media trust boundary**

```bash
rtk git add apps/server/src/ai
rtk git commit -m "fix: harden ai image trust boundaries"
```

### Task 3: Make detail-page success projection atomic and unique

**Files:**
- Create: `scripts/data-migrations/v0.1.24/001_dedupe_detail_page_artifacts.ts`
- Create: `scripts/data-migrations/v0.1.24/001_dedupe_detail_page_artifacts.spec.ts`
- Modify: `scripts/data-migrations/index.ts`
- Modify: `prisma/models/ai.prisma`
- Modify: `apps/server/src/ai/application/port/out/repository/content-asset-library.repository.port.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/content-asset-library.repository.adapter.ts`
- Modify: `apps/server/src/ai/application/service/content-asset.service.ts`
- Modify: `apps/server/src/ai/adapter/out/direct-output/detail-page-content-generation-sink.adapter.ts`
- Modify: `apps/server/src/ai/adapter/out/direct-output/__tests__/detail-page-content-generation-sink.adapter.spec.ts`
- Create: `apps/server/src/ai/adapter/out/direct-output/__tests__/detail-page-content-generation-sink.adapter.pg.integration.spec.ts`

**Interfaces:**
- Produces: one `DetailPageArtifact` for each non-null `sourceContentGenerationId`.
- Produces: `recordDetailPageInputAssetsInScope(scope, input)` and `recordDetailPageGeneratedAssetsInScope(scope, input)` so asset writes can join their owner transaction.
- Produces: a success transaction that changes `PROCESSING -> APPLYING -> READY` and rolls back all artifact/asset/workspace changes on failure.
- Consumes: the existing `ContentAssetLibraryWriteScope` abstraction.

- [ ] **Step 1: Add failing race and rollback tests**

Unit assertions:

```ts
it('does not create artifacts when the generation claim loses to cancellation', async () => {
  prisma.$transaction.mockImplementation(async (callback) => callback({
    ...tx,
    contentGeneration: {
      ...tx.contentGeneration,
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  }));

  await sink.applySuccess(successInput);

  expect(tx.detailPageArtifact.create).not.toHaveBeenCalled();
  expect(tx.contentWorkspace.updateMany).not.toHaveBeenCalled();
  expect(operationAlerts.succeed).not.toHaveBeenCalled();
});
```

The PostgreSQL integration spec runs two transactions concurrently: cancellation and `applySuccess`. Assert exactly one terminal outcome, no current artifact on cancellation, and exactly one source artifact on success.

- [ ] **Step 2: Add an idempotent artifact deduplication migration**

Register:

```ts
export const dedupeDetailPageArtifacts: DataMigration = {
  id: 'v0.1.24:001_dedupe_detail_page_artifacts',
  releaseVersion: '0.1.24',
  name: 'Deduplicate source detail page artifacts before uniqueness enforcement',
  phase: 'pre-schema',
  async run(tx) {
    const [{ count: duplicateGroups }] = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT organization_id, source_content_generation_id
        FROM detail_page_artifacts
        WHERE source_content_generation_id IS NOT NULL
        GROUP BY organization_id, source_content_generation_id
        HAVING COUNT(*) > 1
      ) duplicate_groups
    `;

    await tx.$executeRaw`
      CREATE TEMP TABLE ai_detail_artifact_dedupe ON COMMIT DROP AS
      WITH ranked AS (
        SELECT
          dpa.id,
          dpa.organization_id,
          dpa.source_content_generation_id,
          FIRST_VALUE(dpa.id) OVER (
            PARTITION BY dpa.organization_id, dpa.source_content_generation_id
            ORDER BY
              EXISTS (
                SELECT 1 FROM content_workspaces cw
                WHERE cw.organization_id = dpa.organization_id
                  AND cw.current_detail_page_artifact_id = dpa.id
              ) DESC,
              EXISTS (
                SELECT 1 FROM content_generations cg
                WHERE cg.organization_id = dpa.organization_id
                  AND cg.id = dpa.source_content_generation_id
                  AND cg.detail_page_artifact_id = dpa.id
              ) DESC,
              (dpa.current_revision_id IS NOT NULL) DESC,
              dpa.is_deleted ASC,
              dpa.updated_at DESC,
              dpa.id DESC
          ) AS canonical_id,
          COUNT(*) OVER (
            PARTITION BY dpa.organization_id, dpa.source_content_generation_id
          ) AS duplicate_count
        FROM detail_page_artifacts dpa
        WHERE dpa.source_content_generation_id IS NOT NULL
      )
      SELECT organization_id, source_content_generation_id, id AS loser_id, canonical_id
      FROM ranked
      WHERE duplicate_count > 1 AND id <> canonical_id
    `;

    const revisionsMoved = await tx.$executeRaw`
      UPDATE detail_page_revisions revision
      SET artifact_id = mapping.canonical_id
      FROM ai_detail_artifact_dedupe mapping
      WHERE revision.organization_id = mapping.organization_id
        AND revision.artifact_id = mapping.loser_id
    `;
    const generationsRepointed = await tx.$executeRaw`
      UPDATE content_generations generation
      SET detail_page_artifact_id = mapping.canonical_id,
          updated_at = now()
      FROM ai_detail_artifact_dedupe mapping
      WHERE generation.organization_id = mapping.organization_id
        AND generation.detail_page_artifact_id = mapping.loser_id
    `;
    const workspacesRepointed = await tx.$executeRaw`
      UPDATE content_workspaces workspace
      SET current_detail_page_artifact_id = mapping.canonical_id,
          updated_at = now()
      FROM ai_detail_artifact_dedupe mapping
      WHERE workspace.organization_id = mapping.organization_id
        AND workspace.current_detail_page_artifact_id = mapping.loser_id
    `;
    const preparationsRepointed = await tx.$executeRaw`
      UPDATE product_preparations preparation
      SET selected_detail_page_artifact_id = mapping.canonical_id,
          updated_at = now()
      FROM ai_detail_artifact_dedupe mapping
      WHERE preparation.organization_id = mapping.organization_id
        AND preparation.selected_detail_page_artifact_id = mapping.loser_id
    `;
    await tx.$executeRaw`
      UPDATE detail_page_artifacts artifact
      SET current_revision_id = (
            SELECT revision.id
            FROM detail_page_revisions revision
            WHERE revision.organization_id = artifact.organization_id
              AND revision.artifact_id = artifact.id
            ORDER BY revision.created_at DESC, revision.id DESC
            LIMIT 1
          ),
          updated_at = now()
      WHERE artifact.current_revision_id IS NULL
        AND EXISTS (
          SELECT 1 FROM ai_detail_artifact_dedupe mapping
          WHERE mapping.organization_id = artifact.organization_id
            AND mapping.canonical_id = artifact.id
        )
    `;
    const artifactsRetired = await tx.$executeRaw`
      UPDATE detail_page_artifacts artifact
      SET source_content_generation_id = NULL,
          current_revision_id = NULL,
          status = 'archived',
          is_deleted = true,
          deleted_at = COALESCE(artifact.deleted_at, now()),
          metadata = artifact.metadata || jsonb_build_object(
            'deduplicatedIntoArtifactId', mapping.canonical_id,
            'deduplicatedBy', 'v0.1.24:001_dedupe_detail_page_artifacts'
          ),
          updated_at = now()
      FROM ai_detail_artifact_dedupe mapping
      WHERE artifact.organization_id = mapping.organization_id
        AND artifact.id = mapping.loser_id
    `;

    const referencesRepointed =
      generationsRepointed + workspacesRepointed + preparationsRepointed;
    return {
      affectedRows: revisionsMoved + referencesRepointed + artifactsRetired,
      details: {
        duplicateGroups: Number(duplicateGroups),
        artifactsRetired,
        revisionsMoved,
        referencesRepointed,
      },
    };
  },
};
```

The SQL must be one transaction and must return counts for `duplicateGroups`, `artifactsRetired`, `revisionsMoved`, and `referencesRepointed`. The second run returns all zeros.

- [ ] **Step 3: Add the schema uniqueness constraint**

Change the field to:

```prisma
sourceContentGenerationId String? @unique(map: "detail_page_artifacts_source_generation_key") @map("source_content_generation_id") @db.Uuid
```

Retain the existing ordinary index only if Prisma emits it separately and query plans still require it; otherwise remove the now-redundant index.

- [ ] **Step 4: Add generated-asset writes to the transaction scope**

Extend the port and service:

```ts
recordDetailPageInputAssetsInScope(
  scope: ContentAssetLibraryWriteScope,
  input: RecordDetailPageInputAssetsInput,
): Promise<PersistedContentAssetRef[]>;

recordDetailPageGeneratedAssetsInScope(
  scope: ContentAssetLibraryWriteScope,
  input: RecordDetailPageGeneratedAssetsInput,
): Promise<void>;
```

The adapter reuses its existing idempotent URL-hash/upsert logic with `scope` instead of opening a nested transaction.
`ContentAssetService.recordDetailPageInputAssetsTx()` and
`ContentAssetService.recordDetailPageGeneratedAssetsTx()` are thin delegates to
the two `InScope` repository methods; sinks and repository adapters never
import one another's concrete class.

- [ ] **Step 5: Claim and project within one Prisma transaction**

Replace `ensureDetailPageArtifact()` plus the later conditional update with:

```ts
const applied = await this.prisma.$transaction(async (tx) => {
  const claimed = await tx.contentGeneration.updateMany({
    where: {
      id: row.id,
      organizationId: input.organizationId,
      status: 'PROCESSING',
    },
    data: { status: 'APPLYING' },
  });
  if (claimed.count === 0) return null;

  const artifact = row.detailPageArtifactId
    ? await tx.detailPageArtifact.findFirstOrThrow({
        where: { id: row.detailPageArtifactId, organizationId: input.organizationId },
        select: { id: true },
      })
    : await tx.detailPageArtifact.create({
        data: {
          organizationId: input.organizationId,
          contentWorkspaceId: row.contentWorkspaceId,
          sourceContentGenerationId: row.id,
          title: productName,
          status: 'generated',
          createdByUserId: row.triggeredByUserId,
          metadata: {
            source: 'detail_page_generation_success',
            ...projectionMetadata(input.requestId, input.runId),
          },
        },
        select: { id: true },
      });

  if (Object.keys(processedImages).length > 0) {
    await this.contentAssets.recordDetailPageGeneratedAssetsTx(tx, {
      organizationId: input.organizationId,
      generationGroupId: row.generationGroupId,
      contentGenerationId: row.id,
      processedImages,
    });
  }
  await tx.contentWorkspace.updateMany({
    where: {
      id: row.contentWorkspaceId,
      organizationId: input.organizationId,
      isDeleted: false,
    },
    data: {
      currentDetailPageArtifactId: artifact.id,
      status: 'active',
    },
  });
  await tx.contentGeneration.updateMany({
    where: {
      id: row.id,
      organizationId: input.organizationId,
      status: 'APPLYING',
    },
    data: {
      detailPageArtifactId: artifact.id,
      generatedTitle: productName,
      generationResult: {
        templateId: input.output.templateId,
        result: input.output.result,
        imageUrls: input.output.imageUrls,
        processedImages,
      } as Prisma.InputJsonValue,
      status: 'READY',
      errorMessage: null,
    },
  });
  return { artifactId: artifact.id };
});
if (!applied) return;
```

Alert completion remains after commit. Alert failure must be logged and retriable without rolling the content projection back.

- [ ] **Step 6: Verify migration, schema, and transaction behavior**

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/ai/adapter/out/direct-output/__tests__/detail-page-content-generation-sink.adapter.spec.ts
rtk npm run test:integration --workspace=apps/server -- \
  src/ai/adapter/out/direct-output/__tests__/detail-page-content-generation-sink.adapter.pg.integration.spec.ts
rtk npm exec vitest -- run scripts/data-migrations/v0.1.24/001_dedupe_detail_page_artifacts.spec.ts
rtk npm run data:migrate -- up --phase pre-schema --target local --confirm APPLY_DATA_MIGRATIONS
rtk npm run data:migrate -- up --phase pre-schema --target local --confirm APPLY_DATA_MIGRATIONS
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run db:erd
rtk npm run graphify:schema
```

Expected: tests PASS; the second migration execution is a ledger skip or zero-row no-op; Prisma generation succeeds.

- [ ] **Step 7: Commit the atomic projection**

```bash
rtk git add \
  prisma/models/ai.prisma \
  scripts/data-migrations \
  apps/server/src/ai/application/port/out/repository/content-asset-library.repository.port.ts \
  apps/server/src/ai/adapter/out/repository/content-asset-library.repository.adapter.ts \
  apps/server/src/ai/application/service/content-asset.service.ts \
  apps/server/src/ai/adapter/out/direct-output/detail-page-content-generation-sink.adapter.ts \
  apps/server/src/ai/adapter/out/direct-output/__tests__
rtk git commit -m "fix: make detail page projection atomic"
```

### Task 4: Add the durable AI direct-job ledger and claim repository

**Files:**
- Create: `apps/server/src/ai/domain/direct-job/ai-direct-job.schema.ts`
- Create: `apps/server/src/ai/domain/direct-job/__tests__/ai-direct-job.schema.spec.ts`
- Create: `apps/server/src/ai/application/port/out/repository/ai-direct-job.repository.port.ts`
- Modify: `apps/server/src/ai/application/port/out/repository/index.ts`
- Create: `apps/server/src/ai/adapter/out/repository/ai-direct-job.repository.adapter.ts`
- Create: `apps/server/src/ai/adapter/out/repository/__tests__/ai-direct-job.repository.adapter.spec.ts`
- Create: `apps/server/src/ai/adapter/out/repository/__tests__/ai-direct-job.repository.adapter.pg.integration.spec.ts`
- Modify: `prisma/models/ai.prisma`
- Modify: `prisma/models/core.prisma`

**Interfaces:**
- Produces: `AiDirectJobType = 'thumbnail_generate' | 'thumbnail_reedit' | 'detail_page_generate' | 'image_edit'`.
- Produces: statuses `held | pending | running | projecting | succeeded | failed | cancelled`.
- Produces: discriminated input/result Zod schemas and `AI_DIRECT_JOB_REPOSITORY_PORT`.
- Produces: a 30-second held-job recovery deadline; normal producers release immediately, while an unreleased held job becomes claimable only after preflight.
- Consumes: an optional Prisma transaction scope for atomic producer enqueue.

- [ ] **Step 1: Add failing domain envelope tests**

Assert that model IDs are required and thumbnail payloads cannot contain base64:

```ts
expect(() => AiDirectJobEnvelopeSchema.parse({
  jobType: 'thumbnail_generate',
  models: {},
  input: thumbnailQueuedInput,
})).toThrow();

expect(() => AiDirectJobEnvelopeSchema.parse({
  jobType: 'thumbnail_generate',
  models: { image: 'gemini-image-model' },
  input: {
    ...thumbnailQueuedInput,
    inputs: [{ ...thumbnailQueuedInput.inputs[0], data: 'base64-is-forbidden' }],
  },
})).toThrow();
```

Define queued image objects with `.strict()` so Zod rejects a `data` property instead of silently stripping it.

- [ ] **Step 2: Add the Prisma job model**

```prisma
/// @namespace AI
/// @describe Durable queue and projection checkpoint for direct thumbnail, detail-page, and image-edit model work.
model AiDirectJob {
  id               String    @id @default(uuid()) @db.Uuid
  organizationId   String    @map("organization_id") @db.Uuid
  jobType          String    @map("job_type")
  sourceResourceId String    @map("source_resource_id") @db.Uuid
  status           String    @default("held")
  payload          Json
  result           Json?
  attempts         Int       @default(0)
  maxAttempts      Int       @default(3) @map("max_attempts")
  scheduledFor     DateTime  @default(now()) @map("scheduled_for") @db.Timestamptz
  claimedAt        DateTime? @map("claimed_at") @db.Timestamptz
  claimedBy        String?   @map("claimed_by")
  leaseExpiresAt   DateTime? @map("lease_expires_at") @db.Timestamptz
  finishedAt       DateTime? @map("finished_at") @db.Timestamptz
  lastErrorCode    String?   @map("last_error_code")
  lastErrorMessage String?   @map("last_error_message")
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt        DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, jobType, sourceResourceId], map: "ai_direct_jobs_source_key")
  @@index([status, scheduledFor])
  @@index([status, leaseExpiresAt])
  @@index([organizationId, status])
  @@index([organizationId, sourceResourceId])
  @@map("ai_direct_jobs")
}
```

Add `aiDirectJobs AiDirectJob[]` to `Organization`.

- [ ] **Step 3: Define the narrow repository port**

```ts
export interface CreateAiDirectJobInput {
  id?: string;
  organizationId: string;
  jobType: AiDirectJobType;
  sourceResourceId: string;
  payload: AiDirectJobEnvelope;
  status: 'held';
  scheduledFor: Date;
  maxAttempts?: number;
}

export interface AiDirectJobRepositoryPort {
  create(input: CreateAiDirectJobInput): Promise<AiDirectJobRecord>;
  createInScope(
    scope: AiDirectJobWriteScope,
    input: CreateAiDirectJobInput,
  ): Promise<AiDirectJobRecord>;
  release(input: { organizationId: string; jobId: string }): Promise<boolean>;
  claimNext(input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<(AiDirectJobRecord & { claimedFromStatus: AiDirectJobStatus }) | null>;
  checkpointResult(input: {
    organizationId: string;
    jobId: string;
    result: unknown;
  }): Promise<boolean>;
  extendLease(input: {
    organizationId: string;
    jobId: string;
    workerId: string;
    leaseExpiresAt: Date;
  }): Promise<'running' | 'projecting' | 'cancelled' | 'lost'>;
  markSucceeded(input: { organizationId: string; jobId: string }): Promise<boolean>;
  failOrReschedule(input: FailOrRescheduleAiDirectJobInput): Promise<void>;
  cancel(input: { organizationId: string; jobId: string; reason: string }): Promise<AiDirectJobRecord | null>;
  findById(input: { organizationId: string; jobId: string }): Promise<AiDirectJobRecord | null>;
}
```

- [ ] **Step 4: Implement claim, lease recovery, and projection checkpointing**

The claim query must select due pending jobs, held jobs whose 30-second recovery deadline elapsed, or expired running/projecting jobs. Select `status AS previous_status` in the CTE and return it as the non-persisted `claimedFromStatus` field:

```sql
WITH next_job AS (
  SELECT id, status AS previous_status
  FROM ai_direct_jobs
  WHERE attempts < max_attempts
    AND (
      (status = 'pending' AND scheduled_for <= $now)
      OR (status = 'held' AND scheduled_for <= $now)
      OR (status IN ('running', 'projecting') AND lease_expires_at <= $now)
    )
  ORDER BY scheduled_for ASC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE ai_direct_jobs job
SET status = CASE WHEN job.result IS NULL THEN 'running' ELSE 'projecting' END,
    claimed_at = $now,
    claimed_by = $workerId,
    lease_expires_at = $leaseExpiresAt,
    attempts = CASE WHEN job.result IS NULL THEN job.attempts + 1 ELSE job.attempts END,
    updated_at = $now
FROM next_job
WHERE job.id = next_job.id
RETURNING job.*, next_job.previous_status;
```

`checkpointResult()` conditionally writes `result` and changes `running -> projecting`. A reclaimed `projecting` job never increments attempts and never calls the provider again.

- [ ] **Step 5: Verify multi-worker safety**

The integration spec inserts one job, invokes two concurrent `claimNext()` calls, and expects one record plus one `null`. It then expires a running lease and verifies reclaim, checkpoints a result, expires the projecting lease, and verifies the result is preserved.

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/ai/domain/direct-job/__tests__/ai-direct-job.schema.spec.ts \
  src/ai/adapter/out/repository/__tests__/ai-direct-job.repository.adapter.spec.ts
rtk npm run test:integration --workspace=apps/server -- \
  src/ai/adapter/out/repository/__tests__/ai-direct-job.repository.adapter.pg.integration.spec.ts
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
```

Expected: PASS.

- [ ] **Step 6: Commit the durable ledger**

```bash
rtk git add prisma/models apps/server/src/ai/domain/direct-job apps/server/src/ai/application/port/out/repository apps/server/src/ai/adapter/out/repository
rtk git commit -m "feat: add durable ai direct job ledger"
```

### Task 5: Execute and recover direct AI jobs from the durable worker

**Files:**
- Create: `apps/server/src/ai/application/service/ai-direct-job-worker.service.ts`
- Create: `apps/server/src/ai/application/service/ai-direct-job-processor.service.ts`
- Create: `apps/server/src/ai/application/service/ai-direct-job-payload-hydrator.service.ts`
- Create: `apps/server/src/ai/application/service/ai-direct-job-input-assets.service.ts`
- Create: `apps/server/src/ai/application/service/ai-direct-job.config.ts`
- Create: `apps/server/src/ai/application/service/__tests__/ai-direct-job-worker.service.spec.ts`
- Create: `apps/server/src/ai/application/service/__tests__/ai-direct-job-processor.service.spec.ts`
- Create: `apps/server/src/ai/application/service/__tests__/ai-direct-job-input-assets.service.spec.ts`
- Create: `apps/server/src/ai/application/service/__tests__/ai-direct-job.config.spec.ts`
- Create: `apps/server/src/ai/application/service/__tests__/thumbnail-direct-generation-job.service.spec.ts`
- Create: `apps/server/src/ai/application/service/__tests__/detail-page-direct-generation-job.service.spec.ts`
- Create: `apps/server/src/ai/application/service/__tests__/thumbnail-generation-job.service.spec.ts`
- Create: `apps/server/src/ai/application/service/__tests__/detail-page-generation.service.spec.ts`
- Modify: `apps/server/src/ai/application/service/__tests__/image-edit-direct-generation-job.service.spec.ts`
- Modify: `apps/server/src/ai/application/service/thumbnail-direct-generation-job.service.ts`
- Modify: `apps/server/src/ai/application/service/detail-page-direct-generation-job.service.ts`
- Modify: `apps/server/src/ai/application/service/image-edit-direct-generation-job.service.ts`
- Modify: `apps/server/src/ai/application/service/thumbnail-generation-job.service.ts`
- Modify: `apps/server/src/ai/application/service/detail-page-generation.service.ts`
- Modify: `apps/server/src/ai/application/port/out/repository/thumbnail-generation-ledger.repository.port.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/thumbnail-generation-ledger.repository.adapter.ts`
- Modify: `apps/server/src/ai/application/port/out/repository/detail-page-generation.repository.port.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/detail-page-generation.repository.adapter.ts`
- Modify: `apps/server/src/ai/ai.module.ts`
- Modify: `apps/server/src/ai/__tests__/ai.module.wiring.spec.ts`

**Interfaces:**
- Produces: an always-enabled `AiDirectJobWorker` with one local in-flight tick and database-safe multi-replica claims.
- Produces: a processor with separate `execute()` and `project()` phases.
- Produces: atomic ledger/job creation for thumbnail and detail-page producers.
- Consumes: existing executors and sinks; provider work stays outside repository adapters.

- [ ] **Step 1: Add failing worker recovery tests**

Cover these exact cases:

```ts
it('executes provider work, checkpoints output, projects it, and succeeds');
it('reuses checkpointed output without calling the provider again');
it('requeues retryable provider failure with 5s, 30s, then 120s delays');
it('fails non-retryable schema/model errors without another attempt');
it('preflights a recovered held job before provider execution');
it('continues after one tick throws');
it('does not overlap two local ticks');
```

Use fake timers; do not wait for real intervals.

- [ ] **Step 2: Implement execute/project separation**

The processor contract is:

```ts
export interface AiDirectJobProcessor {
  preflight(job: AiDirectJobRecord): Promise<'runnable' | 'cancelled' | 'invalid'>;
  execute(job: AiDirectJobRecord, signal: AbortSignal): Promise<unknown>;
  project(job: AiDirectJobRecord, result: unknown): Promise<void>;
  projectFailure(job: AiDirectJobRecord, error: NormalizedAiDirectJobError): Promise<void>;
}
```

Routing is exhaustive:

```ts
switch (job.jobType) {
  case 'thumbnail_generate':
    return this.executeThumbnail(job, signal);
  case 'thumbnail_reedit':
    return this.executeThumbnailReedit(job, signal);
  case 'detail_page_generate':
    return this.executeDetailPage(job, signal);
  case 'image_edit':
    return this.executeImageEdit(job, signal);
  default:
    return assertNever(job.jobType);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported AI direct job type: ${String(value)}`);
}
```

`thumbnail_generate`, `detail_page_generate`, and `image_edit` parse their checkpointed result with the existing output Zod schema before projection. `thumbnail_reedit` uses `{ completed: true }` and relies on its lifecycle service's conditional transitions for idempotency.

`preflight()` verifies that thumbnail/detail source ledgers are still non-terminal and that parent operations still accept the child. For `image_edit`, a recovered held job requires its operation alert to exist. Return `cancelled` for a terminal/cancelled source and `invalid` for a missing source/alert; neither state calls a provider.

- [ ] **Step 3: Hydrate thumbnail payloads without storing base64**

Persist queued thumbnail inputs as:

```ts
interface QueuedThumbnailInputImage {
  mimeType: string;
  label: string;
  url: string;
  storageKey: string | null;
  role: 'product' | 'box' | 'color_variant' | 'detail';
  sortOrder: number;
  source: string;
  fileSize: number | null;
}
```

At execution, require `storage.extractKey(url)` and fetch through `fetchTrustedStorageImage(url, { signal })`; reject queued public/data URLs as `direct_ai_input_not_durable`. Reconstruct `ThumbnailGenerateDirectInputImage` by adding `data: fetched.buffer.toString('base64')` only in memory.

Before enqueuing image edit, call:

```ts
persistImageEditInputs(input: {
  organizationId: string;
  jobId: string;
  payload: ImageEditDirectGenerationPayload;
}): Promise<ImageEditDirectGenerationPayload>;
```

For each `image_url`/`image_urls` entry, keep an existing managed storage URL;
otherwise decode a bounded `data:image/*` source or fetch a public URL through
`IMAGE_FETCH_PORT`, then save it under
`ai-job-inputs/{organizationId}/{jobId}/{index}.{ext}`. The returned payload
contains managed URLs only. A decode/fetch/storage failure occurs before the
job or operation alert is created.

- [ ] **Step 4: Capture explicit model plans before creating a job**

Implement one configuration function and test every missing variable:

```ts
export function resolveAiDirectJobModels(
  jobType: AiDirectJobType,
): AiDirectJobModels {
  const image = requireEnv('AI_IMAGE_MODEL');
  if (jobType === 'detail_page_generate') {
    return {
      image,
      text: requireEnv('AI_TEXT_MODEL'),
      vision: requireEnv('AI_IMAGE_ANALYSIS_MODEL'),
    };
  }
  return { image };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw Object.assign(
      new ServiceUnavailableException(`${name} is required for direct AI jobs.`),
      { code: 'model_required' },
    );
  }
  return value;
}
```

`requireEnv()` throws `ServiceUnavailableException` with code `model_required` and names the missing variable. Producers call this before opening a domain ledger, so a configuration error leaves no pending generation or job row.

The same file exposes boot-validated worker/provider settings:

```ts
export function resolveAiDirectJobRuntimeConfig(env = process.env) {
  return {
    workerIntervalMs: positiveInt(env.AI_DIRECT_JOB_WORKER_INTERVAL_MS, 1_000),
    leaseMs: positiveInt(env.AI_DIRECT_JOB_LEASE_MS, 60_000),
    providerTimeoutMs: positiveInt(env.AI_PROVIDER_TIMEOUT_MS, 120_000),
    heldRecoveryMs: 30_000,
    retryDelaysMs: [5_000, 30_000, 120_000] as const,
  };
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`AI direct job runtime value must be a positive integer: ${raw}`);
  }
  return parsed;
}
```

Zero, negative, non-integer, and non-numeric overrides throw during provider construction; the worker cannot be disabled by configuration.

- [ ] **Step 5: Implement the worker loop and result checkpoint**

```ts
async tick(): Promise<void> {
  if (this.busy) return;
  this.busy = true;
  try {
    const now = new Date();
    const job = await this.repository.claimNext({
      workerId: this.workerId,
      now,
      leaseExpiresAt: new Date(now.getTime() + this.config.leaseMs),
    });
    if (!job) return;
    const preflight = await this.processor.preflight(job);
    if (preflight !== 'runnable') {
      await this.finishPreflightRejection(job, preflight);
      return;
    }
    const controller = new AbortController();
    const stopLease = this.startLeaseHeartbeat(job, controller);
    try {
      const result = job.result ?? await this.processor.execute(job, controller.signal);
      if (job.result == null) {
        const checkpointed = await this.repository.checkpointResult({
          organizationId: job.organizationId,
          jobId: job.id,
          result,
        });
        if (!checkpointed) return;
      }
      await this.processor.project(job, result);
      await this.repository.markSucceeded({
        organizationId: job.organizationId,
        jobId: job.id,
      });
    } finally {
      stopLease();
    }
  } finally {
    this.busy = false;
  }
}
```

Implement the two worker helpers with these exact contracts:

```ts
private startLeaseHeartbeat(
  job: AiDirectJobRecord,
  controller: AbortController,
): () => void;

private finishPreflightRejection(
  job: AiDirectJobRecord,
  reason: 'cancelled' | 'invalid',
): Promise<void>;
```

The heartbeat runs every `leaseMs / 3`, calls `extendLease()`, and aborts the
controller when the result is `cancelled` or `lost`. The preflight rejection
marks the job cancelled for `cancelled`; for `invalid`, it writes
`direct_ai_source_invalid` through `failOrReschedule()` with no retry and calls
`processor.projectFailure()` so domain ledgers/alerts do not remain pending.

The interval defaults to 1,000 ms, is `unref()`'d, starts during `onModuleInit`, and stops during `onModuleDestroy`. A producer may call `worker.wake()` after commit, but that wake-up is only a latency optimization; recovery never depends on it. New held jobs set `scheduledFor` to `now + 30 seconds`; `release()` changes them to `pending` with `scheduledFor = now`.

- [ ] **Step 6: Atomically enqueue thumbnail and detail jobs**

Replace the separate `open row -> persist inputs -> schedule` chain with repository operations that run one Prisma transaction:

```ts
openPendingDirectGeneration(input: {
  organizationId: string;
  subject:
    | { kind: 'editor'; contentWorkspaceId: string }
    | { kind: 'candidate'; sourceCandidateId: string; contentWorkspaceId: string | null }
    | { kind: 'standalone'; contentWorkspaceId: string | null };
  originalUrl: string;
  method: 'generate' | 'creative';
  inputMeta: unknown;
  editAnalysis: EditAnalysisResult | null;
  triggeredByUserId: string | null;
  inputImages: ThumbnailEditorInputImage[];
  directJob: Omit<CreateAiDirectJobInput, 'organizationId' | 'sourceResourceId'>;
}): Promise<{ generationId: string; directJobId: string }>;
```

and:

```ts
export interface OpenDetailPageDirectGenerationInput {
  organizationId: string;
  generationGroupId?: string | null;
  contentWorkspaceId: string;
  sourceCandidateId: string | null;
  triggeredByUserId: string | null;
  templateId: DetailPageTemplateId;
  rawInput: DetailPageRawInput;
  imageUrls: string[];
  rawTitle: string;
  sourceReferences: DetailPageSourceReference[];
  directJob: Omit<CreateAiDirectJobInput, 'organizationId' | 'sourceResourceId'>;
}

openProcessingGenerationLedger(input: OpenDetailPageDirectGenerationInput): Promise<{
  status: 'created';
  row: DetailPageGenerationSnapshot;
  directJobId: string;
}>;
```

Inside each transaction: create the domain row, persist input/source rows through the Task 3 transaction-scoped content-asset methods, create the `held` direct job with `sourceResourceId` equal to the new generation ID and a 30-second recovery deadline, then commit. After operation-alert/parent-child setup succeeds, call `release()` and `worker.wake()`. Parent cancellation cancels both the domain generation and held job.

- [ ] **Step 7: Move image-edit status authority to the job ledger**

`ImageEditDirectGenerationJobService.schedule()` creates a held `image_edit` job using a caller-generated UUID, opens the operation alert, releases the job, and returns that UUID. `getStatus()` reads the job record and maps:

```ts
return {
  taskId: job.id,
  status: job.status === 'projecting' ? 'succeeded' : job.status,
  output: job.result,
  errorCode: job.lastErrorCode,
  errorMessage: job.lastErrorMessage,
};
```

If alert creation fails, mark the held job failed and rethrow; never release it.

- [ ] **Step 8: Replace legacy thumbnail re-edit scheduling**

Change `scheduleEditJob()` to enqueue a `thumbnail_reedit` job containing `generationId`, `purpose`, and `variantKey`. Remove its `setImmediate`; retain `processEditJob()` as the idempotent processor implementation until it can be decomposed without expanding this scope.

- [ ] **Step 9: Remove all process-local execution ownership**

Repository-wide assertion:

```bash
rtk rg -n "setImmediate\(" apps/server/src/ai
```

Expected: no AI model generation/edit scheduling match. A `setImmediate` inside `worker.wake()` is allowed only if its callback calls `tick()` after the job is durably committed.

- [ ] **Step 10: Verify worker wiring and restart recovery**

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/ai/application/service/__tests__/ai-direct-job-worker.service.spec.ts \
  src/ai/application/service/__tests__/ai-direct-job-processor.service.spec.ts \
  src/ai/application/service/__tests__/ai-direct-job-input-assets.service.spec.ts \
  src/ai/application/service/__tests__/ai-direct-job.config.spec.ts \
  src/ai/application/service/__tests__/thumbnail-direct-generation-job.service.spec.ts \
  src/ai/application/service/__tests__/detail-page-direct-generation-job.service.spec.ts \
  src/ai/application/service/__tests__/thumbnail-generation-job.service.spec.ts \
  src/ai/application/service/__tests__/detail-page-generation.service.spec.ts \
  src/ai/application/service/__tests__/image-edit-direct-generation-job.service.spec.ts \
  src/ai/__tests__/ai.module.wiring.spec.ts
```

Add one integration scenario: checkpoint a result, destroy the Nest context before projection, create a new context, call one worker tick, and assert the sink applies the checkpoint without invoking the provider.

Expected: PASS.

- [ ] **Step 11: Commit durable execution**

```bash
rtk git add apps/server/src/ai
rtk git commit -m "refactor: execute direct ai jobs durably"
```

### Task 6: Propagate cancellation and timeout to every provider call

**Files:**
- Modify: `apps/server/src/ai/application/port/out/provider/text-completion.port.ts`
- Modify: `apps/server/src/ai/application/port/out/provider/thumbnail-image-generation.port.ts`
- Modify: `apps/server/src/ai/application/port/out/provider/image-edit-media.port.ts`
- Modify: `apps/server/src/ai/application/port/out/provider/detail-page-media.port.ts`
- Modify: `apps/server/src/ai/application/port/out/provider/image-fetch.port.ts`
- Modify: `apps/server/src/ai/adapter/out/gemini/gemini-text-completion.adapter.ts`
- Modify: `apps/server/src/ai/adapter/out/gemini/thumbnail-image-generation.adapter.ts`
- Modify: `apps/server/src/ai/adapter/out/gemini/image-edit-gemini-media.adapter.ts`
- Modify: `apps/server/src/ai/adapter/out/gemini/detail-page-gemini-media.adapter.ts`
- Modify: `apps/server/src/ai/application/service/thumbnail-direct-generation-executor.service.ts`
- Modify: `apps/server/src/ai/application/service/thumbnail-editor-ai.service.ts`
- Modify: `apps/server/src/ai/application/service/image-edit-direct-generation-executor.service.ts`
- Modify: `apps/server/src/ai/application/service/detail-page-direct-generation-executor.service.ts`
- Modify: `apps/server/src/ai/application/service/detail-page-generated-images.service.ts`
- Modify: `apps/server/src/ai/application/service/detail-page-hero-image.service.ts`
- Create: `apps/server/src/ai/adapter/out/gemini/__tests__/gemini-text-completion.adapter.spec.ts`
- Create: `apps/server/src/ai/adapter/out/gemini/__tests__/detail-page-gemini-media.adapter.spec.ts`
- Modify: `apps/server/src/ai/adapter/out/gemini/__tests__/thumbnail-image-generation.adapter.spec.ts`
- Modify: `apps/server/src/ai/adapter/out/gemini/__tests__/image-edit-gemini-media.adapter.spec.ts`
- Create: `apps/server/src/ai/application/service/__tests__/thumbnail-direct-generation-executor.service.spec.ts`
- Create: `apps/server/src/ai/application/service/__tests__/image-edit-direct-generation-executor.service.spec.ts`
- Create: `apps/server/src/ai/application/service/__tests__/detail-page-direct-generation-executor.service.spec.ts`
- Modify: `apps/server/src/ai/application/service/__tests__/detail-page-generated-images.service.spec.ts`
- Modify: `apps/server/src/ai/application/service/__tests__/detail-page-hero-image.service.spec.ts`

**Interfaces:**
- Produces: optional `signal?: AbortSignal` on every provider request and media fetch command.
- Produces: required `model: string` on thumbnail image, detail image, and detail vision provider commands; adapters never read model environment variables.
- Produces: explicit `httpOptions.timeout: 120_000` and `abortSignal` on `@google/genai` calls.
- Produces: queue cancellation that changes the job state before alert/domain projection and aborts the claiming worker through its lease heartbeat.

- [ ] **Step 1: Add failing abort propagation tests**

For each adapter, invoke with an already-aborted signal and assert the provider/fetch does not persist output. For the worker, cancel a running job, make `extendLease()` return `cancelled`, advance fake timers one heartbeat, and assert the executor receives an aborted signal.

- [ ] **Step 2: Extend every provider port**

Add `signal?: AbortSignal` to:

```ts
TextCompletionRequest
ThumbnailImageGenerationCommand
ImageEditMediaCommand
GenerateDetailPageImageInput
CompleteDetailPageVisionJsonInput
ImageFetchOptions
```

Change `ThumbnailImageGenerationCommand.model`, `GenerateDetailPageImageInput.model`, and `CompleteDetailPageVisionJsonInput.model` from optional to required. Thread the captured Task 5 model plan and the same job signal through executors, thumbnail re-edit, generated-image orchestration, hero-image generation, source fetch, and provider calls. Do not create unrelated child controllers that hide cancellation from the caller.

- [ ] **Step 3: Use provider-native timeout and abort controls**

For `@google/genai`:

```ts
config: {
  ...existingConfig,
  abortSignal: input.signal,
  httpOptions: { timeout: PROVIDER_TIMEOUT_MS },
}
```

Remove `ThumbnailImageGenerationAdapter.raceWithAbort()`. For the raw Gemini text fetch:

```ts
signal: request.signal
  ? AbortSignal.any([request.signal, AbortSignal.timeout(PROVIDER_TIMEOUT_MS)])
  : AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
```

For the 15-minute detail generated-image budget, create one `AbortController`, pass its signal to all child calls, and call `abort()` when the timer fires instead of returning from `Promise.race` while children continue.

- [ ] **Step 4: Make cancellation queue-first and projection-safe**

For thumbnail/detail cancellation, cancel the matching `AiDirectJob` in the same application service call before marking the domain generation cancelled. For image edit:

```ts
const job = await this.directJobs.cancel({
  organizationId: input.organizationId,
  jobId: input.taskId,
  reason: input.reason,
});
```

Map `projecting`/`succeeded` to `already_terminal` with `preserved: true`; map `held`/`pending`/`running` cancellation to `cancelled`. The processor checks current job status before applying any sink, so a late provider response cannot publish after cancellation.

- [ ] **Step 5: Verify cancellation and timeout behavior**

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/ai/adapter/out/gemini/__tests__/gemini-text-completion.adapter.spec.ts \
  src/ai/adapter/out/gemini/__tests__/detail-page-gemini-media.adapter.spec.ts \
  src/ai/adapter/out/gemini/__tests__/thumbnail-image-generation.adapter.spec.ts \
  src/ai/adapter/out/gemini/__tests__/image-edit-gemini-media.adapter.spec.ts \
  src/ai/application/service/__tests__/thumbnail-direct-generation-executor.service.spec.ts \
  src/ai/application/service/__tests__/image-edit-direct-generation-executor.service.spec.ts \
  src/ai/application/service/__tests__/detail-page-direct-generation-executor.service.spec.ts \
  src/ai/application/service/__tests__/image-edit-direct-generation-job.service.spec.ts \
  src/ai/application/service/__tests__/detail-page-generated-images.service.spec.ts \
  src/ai/application/service/__tests__/ai-direct-job-worker.service.spec.ts
```

Expected: PASS; no storage `save()` or success sink runs after cancellation.

- [ ] **Step 6: Commit cancellation propagation**

```bash
rtk git add apps/server/src/ai
rtk git commit -m "fix: propagate ai generation cancellation"
```

### Task 7: Document the durable flow and run all release gates

**Files:**
- Modify: `apps/server/src/ai/AGENTS.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/runbooks/environment-variables.md`

**Interfaces:**
- Produces: durable owner documentation for enqueue, claim, execute, checkpoint, project, cancel, and recovery.
- Produces: explicit operational defaults for worker interval, lease, retry delays, and provider timeout.
- Consumes: Tasks 1–6 completed behavior; documentation must describe the implemented names and defaults exactly.

- [ ] **Step 1: Update the AI owner contract**

Replace the direct flow with:

```text
HTTP/service request
  -> create domain ledger + held AiDirectJob atomically
  -> create operation alert / parent-child link
  -> release AiDirectJob
  -> worker claims with FOR UPDATE SKIP LOCKED + lease
  -> executor performs provider/media work with AbortSignal
  -> worker checkpoints validated output
  -> sink atomically projects output
  -> worker marks job succeeded and closes alert
```

Document that `projecting` jobs resume without another model call and that direct jobs never become Agent OS runs.

- [ ] **Step 2: Update architecture and environment guidance**

Document these defaults:

```text
AI_DIRECT_JOB_WORKER_INTERVAL_MS=1000
AI_DIRECT_JOB_LEASE_MS=60000
AI_PROVIDER_TIMEOUT_MS=120000
```

The worker is core functionality and cannot be disabled by setting the interval to zero. Invalid or non-positive overrides fail boot configuration validation.

- [ ] **Step 3: Run narrow and full verification**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/ai
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline'
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run check:scripts-inventory
rtk npm run test:scripts
rtk npm run check:agents-hygiene
rtk npm run check:conventions
rtk npm run data:migrate -- up --phase pre-schema --target local --confirm APPLY_DATA_MIGRATIONS
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run db:erd
rtk npm run graphify:schema
rtk npm run data:migrate -- up --phase post-schema --target local --confirm APPLY_DATA_MIGRATIONS
rtk npm run dev:server
```

Expected: all finite commands PASS; `dev:server` boots successfully with the AI worker started, then stop it cleanly after confirming startup.

- [ ] **Step 4: Verify no process-local scheduler or silent model fallback remains**

```bash
rtk rg -n "setImmediate\(" apps/server/src/ai
rtk rg -n "model\?\.trim\(\) \|\||AI_(IMAGE|TEXT|IMAGE_ANALYSIS)_MODEL.*\|\|" apps/server/src/ai
rtk rg -n "arrayBuffer\(\)" apps/server/src/ai/adapter/out/image-fetch
```

Expected:

- `setImmediate` appears only in the durable worker's optional wake-up implementation.
- No Gemini adapter silently selects an environment fallback.
- No AI public image fetch buffers an unbounded response with `arrayBuffer()`.

- [ ] **Step 5: Run PR contract guards and record release evidence**

```bash
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
rtk git diff --check
rtk git status --short
```

PR body release fields:

```text
Release decision: keep VERSION 0.1.24; add compatible AI direct-job ledger schema and registered v0.1.24:001_dedupe_detail_page_artifacts migration
DB: npm run db:push; additive ai_direct_jobs table and detail_page_artifacts source-generation uniqueness
Backfill: v0.1.24:001_dedupe_detail_page_artifacts; idempotent, second run no-op/ledger skip
Dev data: no bundle change
```

- [ ] **Step 6: Commit documentation and final gates**

```bash
rtk git add apps/server/src/ai/AGENTS.md docs/ARCHITECTURE.md docs/runbooks/environment-variables.md
rtk git commit -m "docs: document durable ai media generation"
```

Because this commit changes `AGENTS.md`, share the PR with the team before merge.

## Acceptance Checklist

- [ ] A hostname resolving to loopback, private, link-local, CGNAT, ULA, or metadata IP is rejected on the initial URL and every redirect.
- [ ] Public response bodies stop reading at 10 MiB and generated images fail above the output byte/pixel/dimension limits.
- [ ] Provider-declared MIME must match Sharp-detected JPEG, PNG, or WebP before storage.
- [ ] Cancelling a detail generation cannot create or select a current artifact.
- [ ] One source content generation has at most one detail-page artifact after migration and schema enforcement.
- [ ] A server restart after enqueue does not leave thumbnail/detail/image-edit tasks permanently pending.
- [ ] A restart after provider output is checkpointed but before projection reuses that output and does not call the model again.
- [ ] Queue cancellation aborts in-flight provider/fetch calls and prevents late sink projection.
- [ ] `colorCount` and `custom-reference` web contracts match the route guide.
- [ ] Image-edit cancellation preserves and applies a result that already won the completion race.
- [ ] Selected server tests, selected web tests, both builds, schema gates, server boot, tenant/IDOR checks, script checks, and PR guards all pass.
