# Thumbnail AI Current-Schema Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completely replace the current legacy/stub thumbnail AI analysis paths with current-convention implementations, selectively adapting AI analysis, image-spec probing, reference-image prompt enrichment, and image-management UI fixes from `origin/feat/auth-login-integrated` while preserving the current normalized DB schema.

**Architecture:** Keep thumbnail endpoints in the current `apps/server/src/ai` module. Do not move the target branch's `apps/server/src/products` thumbnail module wholesale. Add focused AI vision/reference services, wire them into the existing analysis/editor/generation services, and keep current `ThumbnailGenerationCandidate`, `ThumbnailGenerationInputImage`, and `MasterProductImage` relations as the persistence boundary.

**Tech Stack:** NestJS 11, Prisma 7, `@google/genai`, `sharp`, Zod shared schemas, Next.js 16, TanStack Query.

---

## Requirements Summary

- Current branch stays based on `origin/main`; no broad merge from `origin/feat/auth-login-integrated`.
- Preserve current DB model:
  - `ThumbnailGeneration.candidates` is a relation via `ThumbnailGenerationCandidate`, not JSON.
  - `ThumbnailGeneration.inputImages` is a relation via `ThumbnailGenerationInputImage`.
  - product image management uses `MasterProductImage`.
- Import only thumbnail AI/image/editor logic relevant to:
  - quality analysis,
  - compliance analysis,
  - image-spec probing,
  - recompose classification,
  - reference image prompt injection,
  - creative style reference hints,
  - image hub/editor navigation and image grid correctness.
- Keep auth/login, old product image hooks, old generation JSON candidate persistence, Wing registration, and agent/panel automation out of this import.
- Treat this as a replacement project, not an overlay:
  - remove the rule-only `ThumbnailAnalysisService` path as the normal execution path;
  - replace truthful-but-unimplemented `image_spec_probe_not_connected`;
  - replace `cancelBatch({ cancelled:false })` with real per-company cancellation;
  - replace direct-image rule baseline with real AI analysis;
  - keep Wing unavailable because Wing registration is outside this scope, not because it is part of the thumbnail AI legacy replacement.
- Do not claim completion without the project verification commands listed below.

## Current-State Evidence

- Current AI schema is normalized in `prisma/models/ai.prisma`; target branch generation code that writes JSON `candidates` is incompatible.
- Current master image source is `MasterProductImage` in `prisma/models/core.prisma`.
- Current editor generation already saves generated candidates to storage and relation rows in `apps/server/src/ai/services/thumbnail-generation.service.ts`.
- Current analysis service is still a rule-based baseline in `apps/server/src/ai/services/thumbnail-analysis.service.ts`.
- Current prompt pack exists in `apps/server/src/ai/services/thumbnail-prompts.ts`, but runtime usage is incomplete.
- Target branch's richest AI logic is in `origin/feat/auth-login-integrated:apps/server/src/products/services/thumbnail-ai.service.ts`, especially:
  - `checkCompliance`,
  - `analyzeQuality`,
  - `checkImageSpec`,
  - reference cache warmup,
  - `classifyImageJson`,
  - compliance post-processing helpers.

## Legacy Replacement Map

| Current legacy/stub path | Replacement target |
|---|---|
| `ThumbnailAnalysisService.analyzeProduct` writes deterministic `method='rule'` rows | AI-backed quality/compliance/spec/recompose upsert, scoped by requested analysis mode |
| `ThumbnailAnalysisService.analyzeDirectImage` returns a fake rule result | AI-backed direct image result, no DB write |
| `ThumbnailAnalysisService.checkImageSpec` throws `image_spec_probe_not_connected` | real image fetch + dimension/format/size/spec issue probe |
| `ThumbnailAnalysisService.preInspect` counts image presence only | resolve current `MasterProductImage` fallback and persist `imageSpec` where available |
| `ThumbnailAnalysisService.cancelBatch` always returns `cancelled:false` | company-scoped `AbortController` cancellation |
| `ThumbnailGenerationService.createEditJobs` ignores stored `ThumbnailAnalysis.recompose` | edit jobs read latest analysis recompose + compliance edit suggestions before prompt construction |
| `ThumbnailEditorAiService` silently falls back to a hard-coded image model | explicit Gemini image model env guard |
| target branch JSON `candidates` / JSON `master.images` code | rejected; keep current relation-table persistence and `MasterProductImage` source |

## Current Convention Guardrails

- Tenant reads must use `findFirst({ where: { id, companyId, isDeleted: false } })`.
- Frontend must call NestJS APIs only; no direct DB or server-only imports.
- Shared response shapes must use existing `@kiditem/shared` schemas unless this plan explicitly adds a schema task. For this import, keep `ThumbnailGenerationItem.editAnalysis` on the existing `EditAnalysisResultSchema` surface and store richer internal context in `inputMeta`.
- No silent model fallback. Missing Gemini env should fail at call time with a clear `ServiceUnavailableException`.
- Image URL fetching must preserve current SSRF posture: own storage URLs may be fetched, arbitrary private/local network URLs must be rejected.
- Generated images must be stored through `StorageService`; no `data:` URL persistence in `ThumbnailGeneration`.
- Runtime `sharp` imports in Nest services must use CommonJS-compatible `require('sharp')` because this server tsconfig does not enable `esModuleInterop`.

## File Structure

### Backend Files

- Create: `apps/server/src/ai/services/thumbnail-reference-images.service.ts`
  - Loads `apps/server/assets/thumbnail-references/*.{png,jpg,jpeg,webp}` on module init.
  - Exposes Gemini inline-data parts for generation/compliance prompts.

- Create: `apps/server/src/ai/services/thumbnail-vision-ai.service.ts`
  - Owns Gemini text/vision analysis calls.
  - Ports and adapts target branch quality analysis, compliance analysis, image spec, classifier JSON, and post-processing helpers.
  - Does not write DB.

- Create: `apps/server/src/ai/services/thumbnail-recompose.service.ts`
  - Runtime classifier wrapper around `ThumbnailVisionAiService.classifyImageJson`.
  - Reuses existing prompt mapping from `thumbnail-recompose-prompts.ts`.

- Create: `apps/server/src/ai/services/thumbnail-master-image-resolver.ts`
  - Exports the normalized master-image select and fallback resolver.
  - Prevents analysis and recompose classification from re-implementing different image precedence rules.

- Create: `apps/server/src/ai/services/thumbnail-image-fetcher.service.ts`
  - Extracts current SSRF-safe fetch behavior from `ThumbnailEditorAiService`.
  - Used by both editor generation and vision analysis.

- Modify: `apps/server/src/ai/services/thumbnail-analysis.service.ts`
  - Replace rule-only behavior with AI-backed quality/compliance/spec/recompose flow.
  - Preserve current `resolveMasterThumbnailImage` behavior through the shared helper.
  - Preserve tenant scoping.

- Modify: `apps/server/src/ai/services/thumbnail-editor-ai.service.ts`
  - Inject reference image parts into generation/creative calls.
  - Use `CREATIVE_STYLE_REFERENCE_HINT` when a style/background reference is supplied.
  - Remove silent Gemini image model fallback.

- Modify: `apps/server/src/ai/controllers/thumbnail-editor.controller.ts`
  - Pass `hasStyleReference` or equivalent explicit signal into `generateCreative`.

- Modify: `apps/server/src/ai/services/thumbnail-generation.service.ts`
  - Keep normalized persistence.
  - Replace legacy edit-job prompt construction by reading latest `ThumbnailAnalysis.recompose` and compliance edit suggestions.
  - Persist `editAnalysis` metadata without reverting to JSON candidates.

- Modify: `apps/server/src/ai/ai.module.ts`
  - Register new AI services.

- Modify: `apps/server/package.json`, `package-lock.json`
  - Add `sharp`.
  - Do not import target branch auth dependencies.

- Test: `apps/server/src/ai/__tests__/thumbnail-vision-ai.service.spec.ts`
  - Port target branch helper tests to the current service path.

- Test: `apps/server/src/ai/__tests__/thumbnail-analysis.service.spec.ts`
  - Add focused tests for scope-aware analysis persistence and image fallback.

- Test: `apps/server/src/ai/__tests__/thumbnail-generation.service.spec.ts`
  - Add focused tests for normalized candidate/input-image relation persistence and edit-job prompt context.

- Test: `apps/server/src/ai/__tests__/thumbnail-image-fetcher.service.spec.ts`
  - Add SSRF/redirect/MIME/size safety tests.

### Frontend Files

- Modify: `apps/web/src/app/image-hub/page.tsx`
  - Fix editor navigation to `/thumbnail-editor/edit`.

- Modify: `apps/web/src/app/image-hub/components/ImageGrid.tsx`
  - Fix remove/label handlers so role-group rendering cannot mutate the wrong global image.

- Modify as needed: `apps/web/src/app/thumbnail-editor/edit/page.tsx`
  - Only adjust if backend response shape changes are required.

- Modify as needed: `apps/web/src/app/thumbnail-editor/components/*`
  - Only current-schema-compatible UI fixes. Do not replace with target branch stale components.

## Target Code To Avoid

- Do not copy target `apps/server/src/products/services/thumbnail-generation.service.ts`; it assumes JSON `candidates`.
- Do not copy target `apps/server/src/products/controllers/thumbnail-editor.controller.ts` wholesale; it returns data URLs and bypasses current storage persistence.
- Do not move thumbnail services into `apps/server/src/products` during this import.
- Do not copy old `ProductImageItem` or `/api/products/:id` image hook patterns.
- Do not import `cookie-parser`, `jsonwebtoken`, or auth/login code from the target branch.
- Do not implement Wing registration in this pass; current API truthfully returns unavailable.

## Acceptance Criteria

- `POST /api/thumbnail-analysis/analyze` performs real AI quality/compliance analysis according to `scope`.
- No normal thumbnail-analysis path returns fabricated `method='rule'` output when Gemini is configured and fetchable input exists.
- `POST /api/thumbnail-analysis/image-spec` returns actual image dimensions, aspect ratio, file size, format, and spec issues.
- `POST /api/thumbnail-analysis/pre-inspect` runs spec checks against current `MasterProductImage` fallback resolution and stores useful `imageSpec` where appropriate.
- Batch analysis can be cancelled per company and does not leak work across tenants.
- Recompose classification is populated in `ThumbnailAnalysis.recompose` when requested by analysis scope.
- Edit jobs, re-edit jobs, and auto jobs use latest stored `ThumbnailAnalysis.recompose` and compliance edit suggestions when constructing prompts.
- Thumbnail editor generation still stores results in object storage and normalized candidate/input-image rows.
- Reference images are included in generation/compliance prompts without breaking when assets are missing.
- Creative mode uses a supplied background/style reference as a style guide, not as a product to reproduce.
- Image hub navigation opens the actual edit route.
- Image grid remove/label edits target the correct image even when roles are interleaved.
- No thumbnail AI source file relies on `model = env || default` style silent model fallback.
- Analysis and recompose use one shared current-schema image resolver.
- Editor and vision image fetches share one SSRF-safe fetch helper and have regression tests for unsafe URLs.

---

## Task 1: Add Backend AI Tests First

**Files:**
- Create: `apps/server/src/ai/__tests__/thumbnail-vision-ai.service.spec.ts`
- Create: `apps/server/src/ai/__tests__/thumbnail-image-fetcher.service.spec.ts`
- Create: `apps/server/src/ai/__tests__/thumbnail-analysis.service.spec.ts`
- Create: `apps/server/src/ai/__tests__/thumbnail-generation.service.spec.ts`

- [ ] **Step 1: Port compliance helper tests to the current service name**

Use the target branch test as source material:

```bash
rtk git show origin/feat/auth-login-integrated:apps/server/src/products/__tests__/thumbnail-ai.service.spec.ts
```

Create tests against `ThumbnailVisionAiService` extracted compliance helpers through `as any`, matching current imports. Do not port target branch's stale `applyWhiteBackgroundOverride` expectations; in the target branch that method is intentionally a no-op and the real live path uses background verification inside `checkCompliance`.

```ts
import { describe, expect, it } from 'vitest';
import { ThumbnailVisionAiService } from '../services/thumbnail-vision-ai.service';
import type { ComplianceScores } from '@kiditem/shared';

// Runtime Nest services must use require('sharp'); tests may import helper-made buffers
// through the same service helpers instead of default-importing sharp directly.

type RawCompliance = {
  violations?: Partial<ComplianceScores['violations']>;
  confidence?: Record<string, number | string>;
  reasons?: Record<string, string>;
  quality?: Record<string, unknown>;
};
```

Expected covered behaviors:

- extracted white-background verification marks pure/near-white backgrounds as compliant;
- extracted white-background verification keeps confirmed colored backgrounds non-compliant;
- physical package text is not treated as digital overlay;
- explicit digital overlay evidence remains a violation;
- string booleans and confidence values are normalized/clamped;
- omitted violation keys do not fail compliance.

- [ ] **Step 2: Add SSRF-safe fetch tests**

Test the shared image fetcher, not duplicated private methods:

```ts
it('rejects localhost and private IPv4 image URLs', async () => {});
it('rejects private IPv6 and IPv4-mapped IPv6 URLs', async () => {});
it('stops after bounded redirects', async () => {});
it('rejects unsupported content-type values', async () => {});
it('rejects payloads larger than MAX_FETCH_BYTES', async () => {});
it('allows own storage URLs through StorageService.extractKey', async () => {});
```

- [ ] **Step 3: Add analysis persistence tests**

Mock `ThumbnailVisionAiService` and `ThumbnailRecomposeService` so no Gemini call is made. Test these cases:

```ts
it('uses MasterProductImage fallback when imageUrl is empty', async () => {});
it('quality scope updates quality fields without clearing existing compliance fields', async () => {});
it('compliance scope updates compliance fields without clearing existing quality fields', async () => {});
it('throws NotFoundException for another company product id', async () => {});
```

- [ ] **Step 4: Add normalized generation persistence tests**

Mock `ThumbnailEditorAiService.generateEdit` and `resolveInputImage`. Test:

```ts
it('saveEditorResult writes candidates and inputImages as relation rows', async () => {});
it('createEditJobs uses stored recompose kind and compliance edit suggestions', async () => {});
it('reEditJob preserves normalized candidate rows after regeneration', async () => {});
it('createAutoBatch routes through createEditJobs and keeps method auto', async () => {});
```

- [ ] **Step 5: Run the failing test slice**

```bash
rtk npm exec --workspace=apps/server -- vitest run src/ai/__tests__/thumbnail-vision-ai.service.spec.ts src/ai/__tests__/thumbnail-image-fetcher.service.spec.ts src/ai/__tests__/thumbnail-analysis.service.spec.ts src/ai/__tests__/thumbnail-generation.service.spec.ts --config vitest.config.ts
```

Expected before implementation: compile failures because new services do not exist.

## Task 2: Add `sharp` And Gemini Model Config Guard

**Files:**
- Modify: `apps/server/package.json`
- Modify: `package-lock.json`
- Create: `apps/server/src/ai/services/thumbnail-gemini-config.ts`

- [ ] **Step 1: Add only the needed dependency**

Add:

```json
"sharp": "^0.34.5"
```

Do not add target branch auth dependencies.

- [ ] **Step 2: Install/update lockfile**

```bash
rtk npm install --workspace=apps/server
```

- [ ] **Step 3: Lock the runtime `sharp` import convention**

In Nest service code, use:

```ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp') = require('sharp');
```

Do not use `import sharp from 'sharp'` in runtime server services.

- [ ] **Step 4: Add explicit model helpers**

```ts
import { ServiceUnavailableException } from '@nestjs/common';

export function requireGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ServiceUnavailableException('thumbnail_ai_not_configured');
  return apiKey;
}

export function requireGeminiImageModel(): string {
  const model = process.env.AI_IMAGE_MODEL;
  if (!model) throw new ServiceUnavailableException('thumbnail_ai_image_model_not_configured');
  return model;
}

export function requireGeminiVisionModel(): string {
  const model = process.env.AI_IMAGE_ANALYSIS_MODEL;
  if (!model) throw new ServiceUnavailableException('thumbnail_ai_vision_model_not_configured');
  return model;
}

export function requireGeminiVerifyModel(): string {
  const model = process.env.AI_IMAGE_ANALYSIS_VERIFY_MODEL;
  if (!model) throw new ServiceUnavailableException('thumbnail_ai_verify_model_not_configured');
  return model;
}
```

- [ ] **Step 5: Run package sanity check**

```bash
rtk npm ls sharp --workspace=apps/server
```

Expected: `sharp@0.34.5` or compatible installed version.

## Task 3: Extract Current-Schema Master Image Resolver

**Files:**
- Create: `apps/server/src/ai/services/thumbnail-master-image-resolver.ts`
- Modify: `apps/server/src/ai/services/thumbnail-analysis.service.ts`

- [ ] **Step 1: Move the existing resolver into a reusable helper**

Move the existing `MASTER_IMAGE_SELECT`, `isDisplayable`, and `resolveMasterImage` logic out of `thumbnail-analysis.service.ts` into:

```ts
import { Prisma } from '@prisma/client';

export const THUMBNAIL_MASTER_IMAGE_SELECT: Prisma.MasterProduct$imagesArgs = {
  where: { isDeleted: false },
  select: { url: true, role: true, sortOrder: true, isPrimary: true },
  orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
};

export function isDisplayableThumbnailUrl(url: string | null | undefined): url is string {
  return !!url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/generated-thumbnails/'));
}

export function resolveMasterThumbnailImage(master: {
  imageUrl: string | null;
  thumbnailUrl: string | null;
  images: Array<{ url: string; role: string; sortOrder: number; isPrimary: boolean }>;
}): string | null {
  if (isDisplayableThumbnailUrl(master.imageUrl)) return master.imageUrl;
  const primary = master.images.find((img) => img.isPrimary && isDisplayableThumbnailUrl(img.url));
  if (primary) return primary.url;
  const first = master.images.find((img) => isDisplayableThumbnailUrl(img.url));
  if (first) return first.url;
  if (isDisplayableThumbnailUrl(master.thumbnailUrl)) return master.thumbnailUrl;
  return null;
}
```

- [ ] **Step 2: Update current analysis service imports without behavior change**

Replace local references in `thumbnail-analysis.service.ts` with the helper names. Run the existing tests/build before changing behavior.

```bash
rtk npm run build --workspace=apps/server
```

Expected: build still succeeds.

## Task 4: Implement Reference Image Service

**Files:**
- Create: `apps/server/src/ai/services/thumbnail-reference-images.service.ts`
- Modify: `apps/server/src/ai/ai.module.ts`

- [ ] **Step 1: Create service skeleton**

```ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

type InlinePart = { inlineData: { data: string; mimeType: string } };
type TextPart = { text: string };

@Injectable()
export class ThumbnailReferenceImagesService implements OnModuleInit {
  private readonly logger = new Logger(ThumbnailReferenceImagesService.name);
  private readonly parts: InlinePart[] = [];

  onModuleInit(): void {
    this.warm();
  }

  generationParts(header: string): Array<TextPart | InlinePart> {
    return this.parts.length ? [{ text: header }, ...this.parts] : [];
  }

  complianceParts(header: string): Array<TextPart | InlinePart> {
    return this.parts.length ? [{ text: header }, ...this.parts] : [];
  }

  private warm(): void {
    const dir = [
      join(process.cwd(), 'assets/thumbnail-references'),
      join(process.cwd(), 'apps/server/assets/thumbnail-references'),
    ].find((candidate) => existsSync(candidate));
    if (!dir) return;
    for (const name of readdirSync(dir)) {
      const ext = extname(name).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) continue;
      const data = readFileSync(join(dir, name)).toString('base64');
      this.parts.push({ inlineData: { data, mimeType } });
    }
    this.logger.log(`thumbnail reference images warmed: ${this.parts.length}`);
  }
}
```

- [ ] **Step 2: Register provider**

Add `ThumbnailReferenceImagesService` to `AiModule.providers`.

- [ ] **Step 3: Run DI build check**

```bash
rtk npm run build --workspace=apps/server
```

Expected: TypeScript build succeeds or only exposes next-task missing imports.

## Task 5: Extract Shared SSRF-Safe Image Fetcher

**Files:**
- Create: `apps/server/src/ai/services/thumbnail-image-fetcher.service.ts`
- Modify: `apps/server/src/ai/services/thumbnail-editor-ai.service.ts`
- Modify: `apps/server/src/ai/ai.module.ts`
- Test: `apps/server/src/ai/__tests__/thumbnail-image-fetcher.service.spec.ts`

- [ ] **Step 1: Extract current editor fetch guardrails**

Move the current private fetch/assert logic from `ThumbnailEditorAiService` into an injectable service:

```ts
export interface FetchedThumbnailImage {
  buffer: Buffer;
  mimeType: string;
  storageKey: string | null;
}

@Injectable()
export class ThumbnailImageFetcherService {
  constructor(private readonly storage: StorageService) {}

  async fetchImage(rawUrl: string, opts: { allowOwnStorage?: boolean } = {}): Promise<FetchedThumbnailImage> {
    // Preserve current bounded redirects, public URL checks, MIME allowlist,
    // and max-size enforcement from ThumbnailEditorAiService.
  }

  async fetchTrustedStorageImage(rawUrl: string): Promise<FetchedThumbnailImage> {
    return this.fetchImage(rawUrl, { allowOwnStorage: true });
  }

  assertSupportedMime(mimeType: string): void {}
  extForMime(mimeType: string): string {}
}
```

`allowOwnStorage` is an internal fetcher option. Callers that need the own-storage bypass must use `fetchTrustedStorageImage()` rather than passing `{ allowOwnStorage: true }` directly.

Keep the current constants:

```ts
const MAX_FETCH_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
```

- [ ] **Step 2: Update `ThumbnailEditorAiService` to use the shared fetcher**

Replace private `fetchImage`, `assertPublicHttpUrl`, `isPrivateIPv4`, `extractEmbeddedIPv4`, `assertSupportedMime`, and `extForMime` with calls to `ThumbnailImageFetcherService`. Use `fetchTrustedStorageImage()` only when `StorageService.extractKey(input)` confirms an own-storage URL; use `fetchImage()` for external URLs.

This must be behavior-preserving before AI vision work begins.

- [ ] **Step 3: Add SSRF regression tests**

Test localhost/private IPv4, IPv6, IPv4-mapped IPv6, redirect loop, unsupported MIME, and oversized body rejection.

- [ ] **Step 4: Register provider and run tests**

```bash
rtk npm exec --workspace=apps/server -- vitest run src/ai/__tests__/thumbnail-image-fetcher.service.spec.ts --config vitest.config.ts
rtk npm run build --workspace=apps/server
```

Expected: fetcher tests pass and editor generation still compiles against the extracted service.

## Task 6: Implement AI Vision Service

**Files:**
- Create: `apps/server/src/ai/services/thumbnail-vision-ai.service.ts`
- Modify: `apps/server/src/ai/ai.module.ts`

- [ ] **Step 1: Define current-schema service API**

```ts
export interface ThumbnailAiItem {
  productId: string;
  productName: string;
  imageUrl: string;
  category?: string | null;
}

export interface AiAnalysisResult {
  overallScore: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'F';
  scores: import('@kiditem/shared').ThumbnailScores | null;
  issues: Array<{ type: string; severity: string; message: string }>;
  suggestions: string[];
  method: 'ai';
```

- [ ] **Step 2: Inject reference service and register provider**

`ThumbnailVisionAiService` should inject `ThumbnailReferenceImagesService` so compliance prompts can include the same reference set used by generation. Register `ThumbnailVisionAiService` in `AiModule.providers`.

- [ ] **Step 3: Port target branch methods**

Adapt from:

```bash
rtk git show origin/feat/auth-login-integrated:apps/server/src/products/services/thumbnail-ai.service.ts
```

Bring these methods into `ThumbnailVisionAiService`:

- `analyzeQuality(items, signal?)`;
- `checkCompliance(items, signal?)`;
- `checkImageSpec(imageUrl)`;
- `classifyImageJson(imageUrl, prompt, signal?)`;
- `parseComplianceResponse`;
- `normalizeTextRelatedViolations`;
- deterministic white-background pixel analysis helpers;
- `verifyWhiteBackground` / physical-vs-digital verification helpers used by the live `checkCompliance` path;
- image fetches through `ThumbnailImageFetcherService.fetchTrustedStorageImage()` for vision/spec/recompose paths, not new local fetch helpers or direct `{ allowOwnStorage: true }` call sites.
- compliance reference-image prompt parts via `ThumbnailReferenceImagesService.complianceParts(COMPLIANCE_REFERENCE_HEADER)`.

- [ ] **Step 4: Adapt persistence assumptions out**

The service must return maps and values only:

```ts
Promise<Map<string, AiAnalysisResult>>
Promise<Map<string, { complianceGrade: ComplianceGrade; complianceScores: ComplianceScores }>>
Promise<ImageSpec>
Promise<string | null>
```

No Prisma writes belong in this service.

- [ ] **Step 5: Use explicit model helpers**

All Gemini calls must use `requireGeminiVisionModel()` or `requireGeminiVerifyModel()`. Do not keep target static model constants.

- [ ] **Step 6: Run unit tests**

```bash
rtk npm exec --workspace=apps/server -- vitest run src/ai/__tests__/thumbnail-vision-ai.service.spec.ts --config vitest.config.ts
```

Expected: helper tests pass without `GEMINI_API_KEY`.

## Task 7: Implement Runtime Recompose Classifier

**Files:**
- Create: `apps/server/src/ai/services/thumbnail-recompose.service.ts`
- Modify: `apps/server/src/ai/ai.module.ts`
- Keep: `apps/server/src/ai/services/thumbnail-recompose-prompts.ts`

- [ ] **Step 1: Create service using current prompt helper**

```ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RECOMPOSE_CLASSIFY_PROMPT } from './thumbnail-prompts';
import { ThumbnailVisionAiService } from './thumbnail-vision-ai.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  resolveMasterThumbnailImage,
  THUMBNAIL_MASTER_IMAGE_SELECT,
} from './thumbnail-master-image-resolver';
import type { RecomposeVariantClassification, RecomposeKind } from '@kiditem/shared';
import { RECOMPOSE_KINDS } from '@kiditem/shared';

@Injectable()
export class ThumbnailRecomposeService {
  private readonly logger = new Logger(ThumbnailRecomposeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vision: ThumbnailVisionAiService,
  ) {}

  async classify(productId: string, companyId: string): Promise<RecomposeVariantClassification> {
    const master = await this.prisma.masterProduct.findFirst({
      where: { id: productId, companyId, isDeleted: false },
      select: { imageUrl: true, thumbnailUrl: true, images: THUMBNAIL_MASTER_IMAGE_SELECT },
    });
    if (!master) throw new NotFoundException('Product not found');
    const imageUrl = resolveMasterThumbnailImage(master);
    if (!imageUrl) return { kind: 'single-product', requiresChoice: false, options: [], recommended: null, reasoning: '원본 이미지가 없습니다' };
    return this.classifyByImage(imageUrl);
  }

  async classifyByImage(imageUrl: string): Promise<RecomposeVariantClassification> {
    const text = await this.vision.classifyImageJson(imageUrl, RECOMPOSE_CLASSIFY_PROMPT);
    return this.parse(text);
  }

  private parse(text: string | null): RecomposeVariantClassification {
    if (!text) return { kind: 'single-product', requiresChoice: false, options: [], recommended: null, reasoning: null };
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const obj = JSON.parse(cleaned) as { kind?: string; requiresChoice?: boolean; reasoning?: string };
    const kind: RecomposeKind = (RECOMPOSE_KINDS as readonly string[]).includes(obj.kind ?? '')
      ? (obj.kind as RecomposeKind)
      : 'single-product';
    if (obj.requiresChoice) {
      return {
        kind,
        requiresChoice: true,
        options: [
          { key: 'with-box', label: '박스 + 상품', description: '박스와 상품을 함께 구성', recommended: true },
          { key: 'no-box', label: '상품만', description: '박스 없이 상품만 구성' },
        ],
        recommended: 'with-box',
        reasoning: obj.reasoning ?? null,
      };
    }
    return { kind, requiresChoice: false, options: [], recommended: null, reasoning: obj.reasoning ?? null };
  }
}
```

- [ ] **Step 2: Register provider**

Add `ThumbnailRecomposeService` to `AiModule.providers`.

- [ ] **Step 3: Keep existing prompt mapping tests**

```bash
rtk npm exec --workspace=apps/server -- vitest run src/ai/__tests__/thumbnail-recompose-prompts.spec.ts --config vitest.config.ts
```

Expected: existing prompt mapping tests remain green.

## Task 8: Wire Real Analysis Flow

**Files:**
- Modify: `apps/server/src/ai/services/thumbnail-analysis.service.ts`
- Modify as needed: `apps/server/src/ai/controllers/thumbnail-analysis.controller.ts`

- [ ] **Step 1: Inject services**

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly vision: ThumbnailVisionAiService,
  private readonly recomposeService: ThumbnailRecomposeService,
) {}
```

- [ ] **Step 2: Replace rule-only `analyzeProduct`**

Use `resolveMasterThumbnailImage(master)` and tenant-scoped `findFirst`.

Scope behavior:

- `quality`: call `vision.analyzeQuality`, update `overallScore`, `grade`, `scores`, `issues`, `suggestions`, `method`, `qualityAnalyzedAt`.
- `compliance`: call `vision.checkImageSpec`, `vision.checkCompliance`, and `recomposeService.classifyByImage`; update `complianceGrade`, `complianceScores`, `imageSpec`, `recompose`, `complianceAnalyzedAt`.
- `all`: run both branches and update both sets.

Preserve existing values for a branch that is not being re-run.

- [ ] **Step 3: Implement real `analyzeDirectImage`**

Make it async, honor `scope`, and run AI analysis without DB write:

```ts
const quality = await this.vision.analyzeQuality([{ productId: 'direct', productName: productName ?? '', imageUrl }]);
const compliance = await this.vision.checkCompliance([{ productId: 'direct', productName: productName ?? '', imageUrl }]);
```

Update the controller so direct-image analysis passes `body.scope ?? 'all'` into the service instead of ignoring scope.

- [ ] **Step 4: Implement `checkImageSpec`**

```ts
checkImageSpec(imageUrl: string): Promise<ImageSpec> {
  return this.vision.checkImageSpec(imageUrl);
}
```

- [ ] **Step 5: Implement `preInspect` with spec persistence**

For each selected master:

- resolve image through `MasterProduct.imageUrl`, primary `MasterProductImage`, first image, then `thumbnailUrl`;
- call `vision.checkImageSpec`;
- upsert `ThumbnailAnalysis.imageSpec` with `companyId` and `masterId`;
- count failures without throwing the whole batch.

- [ ] **Step 6: Add company-scoped batch cancellation**

Use a private map:

```ts
private readonly batchAborts = new Map<string, AbortController>();
```

`analyzeBatch` creates/replaces one controller per company. `cancelBatch(companyId)` aborts and deletes only that company controller.

- [ ] **Step 7: Add recompose classifier endpoint**

Target branch had `POST /api/thumbnail-analysis/edit/variants`. Add the endpoint so the legacy products-domain endpoint is replaced by an ai-local current-schema endpoint. The implementation must call the ai-local `ThumbnailRecomposeService`, not target products-domain code.

```ts
@Post('edit/variants')
classifyRecomposeVariants(@Body() body: { productId: string }, @CurrentCompany() companyId: string) {
  return this.recomposeService.classify(body.productId, companyId);
}
```

The service method must use `findFirst({ where: { id, companyId, isDeleted: false } })`.

- [ ] **Step 8: Run analysis tests**

```bash
rtk npm exec --workspace=apps/server -- vitest run src/ai/__tests__/thumbnail-analysis.service.spec.ts --config vitest.config.ts
```

Expected: mocked AI tests pass.

## Task 9: Wire Analysis Context Into Edit Jobs

**Files:**
- Modify: `apps/server/src/ai/services/thumbnail-generation.service.ts`
- Test: `apps/server/src/ai/__tests__/thumbnail-generation.service.spec.ts`

- [ ] **Step 1: Load latest analysis for edit jobs using current relation names**

Do not select a nonexistent `ThumbnailAnalysis` field on `MasterProduct`. Use the current relation name `thumbnailAnalyses`, or a separate `thumbnailAnalysis.findMany` keyed by `masterId`.

Recommended query shape inside `createEditJobs`:

```ts
select: {
  id: true,
  name: true,
  imageUrl: true,
  thumbnailUrl: true,
  category: true,
  images: THUMBNAIL_MASTER_IMAGE_SELECT,
  thumbnailAnalyses: {
    orderBy: { updatedAt: 'desc' },
    take: 1,
    select: {
      recompose: true,
      complianceGrade: true,
      complianceScores: true,
      overallScore: true,
      grade: true,
      qualityAnalyzedAt: true,
      complianceAnalyzedAt: true,
    },
  },
}
```

Then extract:

```ts
const analysis = product.thumbnailAnalyses[0] ?? null;
```

Use `resolveMasterThumbnailImage(product)` instead of `product.imageUrl ?? product.thumbnailUrl`.

- [ ] **Step 2: Use recompose kind in prompt override**

Extract `RecomposeKind` from `ThumbnailAnalysis.recompose.kind` and pass it to:

```ts
getRecomposePromptOverride(recomposeKind, variantKey, product.category)
```

This replaces the current `getRecomposePromptOverride(null, variantKey, product.category)` legacy path.

- [ ] **Step 3: Feed compliance edit suggestions into edit prompt**

Extract `complianceScores.editSuggestions` when available and pass it through `generateEdit` as a prompt prefix or dedicated option. Use the existing prompt constants:

```ts
COMPLIANCE_SUGGESTIONS_HEADER
```

The prompt should apply concrete edit suggestions before generic rules, without changing product identity.

- [ ] **Step 4: Keep API `editAnalysis` schema stable and store richer context in `inputMeta`**

`saveEditorResult()` currently does not accept `editAnalysis`, and shared `EditAnalysisResultSchema` expects non-null `complianceGrade`, `overallScore`, and `grade`. Do not broaden the shared API schema in this pass unless frontend code needs it.

Instead, keep public `editAnalysis` compatible and store richer prompt provenance under `inputMeta.analysisContext`:

```ts
inputMeta: {
  mode: 'edit',
  purpose,
  editCase: 'single',
  variantKey: variantKey ?? 'auto',
  recompose: analysis?.recompose ?? null,
  analysisContext: {
    complianceGrade: analysis?.complianceGrade ?? null,
    complianceScores: analysis?.complianceScores ?? null,
    overallScore: analysis?.overallScore ?? null,
    grade: analysis?.grade ?? null,
    editSuggestions,
  },
}
```

If implementation needs `editAnalysis` for existing UI display, extend `saveEditorResult` with an optional `editAnalysis?: EditAnalysisResult | null` but keep it on the current shared contract:

```ts
editAnalysis: analysis
  ? {
      complianceGrade: analysis.complianceGrade ?? 'UNKNOWN',
      complianceScores: (analysis.complianceScores as Record<string, unknown> | null) ?? null,
      overallScore: analysis.overallScore,
      grade: analysis.grade,
    }
  : null
```

Do not put `recompose` into public `editAnalysis`; it belongs in `inputMeta.recompose`.

Keep richer context as JSON metadata only; do not reintroduce JSON `candidates`.

- [ ] **Step 5: Apply the same context path to `reEditJob` and `createAutoBatch`**

`reEditJob` should prefer existing `inputMeta.recompose`, then latest `ThumbnailAnalysis.recompose`. `createAutoBatch` already calls `createEditJobs`; verify it inherits the new behavior.

- [ ] **Step 6: Test normalized persistence and prompt routing**

```bash
rtk npm exec --workspace=apps/server -- vitest run src/ai/__tests__/thumbnail-generation.service.spec.ts --config vitest.config.ts
```

Expected:

- candidates are relation rows;
- input images are relation rows;
- `findOne()` returns normalized candidates after save/re-edit;
- stored recompose kind changes prompt override input;
- compliance edit suggestions are passed to editor prompt construction.

## Task 10: Enrich Editor Generation Without Changing Persistence

**Files:**
- Modify: `apps/server/src/ai/services/thumbnail-editor-ai.service.ts`
- Modify: `apps/server/src/ai/controllers/thumbnail-editor.controller.ts`
- Modify: `apps/server/src/ai/ai.module.ts`

- [ ] **Step 1: Inject reference service**

```ts
constructor(
  private readonly storage: StorageService,
  private readonly imageFetcher: ThumbnailImageFetcherService,
  private readonly references: ThumbnailReferenceImagesService,
) {}
```

- [ ] **Step 2: Include reference image parts in Gemini request**

Before input image parts, include:

```ts
...this.references.generationParts(GENERATE_REFERENCE_HEADER)
```

Use this only for edit/generate/creative paths where it improves composition. Missing references must result in an empty array.

- [ ] **Step 3: Add creative style reference hint**

Import `CREATIVE_STYLE_REFERENCE_HINT` and add an option:

```ts
interface GenerateCreativeOptions {
  hasStyleReference?: boolean;
}
```

Append the hint when true:

```ts
options.hasStyleReference ? CREATIVE_STYLE_REFERENCE_HINT : ''
```

Set it in controller when `body.backgroundReference` exists.

- [ ] **Step 4: Remove silent image model fallback**

Replace:

```ts
model: process.env.AI_IMAGE_MODEL ?? 'gemini-3.1-flash-image-preview'
```

with:

```ts
model: requireGeminiImageModel()
```

- [ ] **Step 5: Verify normalized persistence still works**

Do not change `ThumbnailGenerationService.saveEditorResult` relation writes unless a type error requires it.

## Task 11: Small Current-Schema UI Fixes

**Files:**
- Modify: `apps/web/src/app/image-hub/page.tsx`
- Modify: `apps/web/src/app/image-hub/components/ImageGrid.tsx`

- [ ] **Step 1: Fix image hub editor link**

Change links that currently target `/thumbnail-editor?productId=...` to:

```ts
`/thumbnail-editor/edit?productId=${selectedProduct.id}`
```

- [ ] **Step 2: Fix image grid global indexing**

Do not pass `startIndex + i`. Pass a stable image id/url from the role section back to the parent, or pass the actual original index.

Recommended shape:

```ts
type IndexedImage = { image: MasterImageItem; originalIndex: number };
```

Build role sections from:

```ts
const roleImages = images
  .map((image, originalIndex) => ({ image, originalIndex }))
  .filter((item) => item.image.role === config.role);
```

Call:

```tsx
onRemove(item.originalIndex)
onLabelChange(item.originalIndex, e.target.value)
```

- [ ] **Step 3: Run frontend hook/UI tests if available**

```bash
rtk npm exec --workspace=apps/web -- vitest run src/hooks/__tests__/useProductImages.test.ts
```

Expected: current image hook tests remain green.

## Task 12: Verification Gate

**Files:**
- No new code changes in this task.

- [ ] **Step 1: Legacy/stub removal scan**

```bash
rtk rg -n "image_spec_probe_not_connected|method: 'rule'|method = 'rule'|cancelled: false|AI_IMAGE_MODEL \\?\\?|gemini-3\\.1-.*preview" apps/server/src/ai/services/thumbnail* apps/server/src/ai/controllers/thumbnail*
```

Expected: no matches for removed thumbnail AI stubs or hard-coded model fallbacks. Wing `ServiceUnavailableException` paths may remain because Wing registration is explicitly out of scope.

- [ ] **Step 2: Backend unit tests**

```bash
rtk npm exec --workspace=apps/server -- vitest run src/ai/__tests__/thumbnail-image-fetcher.service.spec.ts src/ai/__tests__/thumbnail-vision-ai.service.spec.ts src/ai/__tests__/thumbnail-analysis.service.spec.ts src/ai/__tests__/thumbnail-generation.service.spec.ts src/ai/__tests__/thumbnail-recompose-prompts.spec.ts src/ai/__tests__/thumbnail-prompt-scenarios.spec.ts --config vitest.config.ts
```

- [ ] **Step 3: Shared package build**

Run if shared schema/types changed:

```bash
rtk npm run build --workspace=packages/shared
```

- [ ] **Step 4: Frontend build**

```bash
rtk npm run build --workspace=apps/web
```

- [ ] **Step 5: Backend boot**

```bash
rtk npm run dev:server
```

Expected: Nest boots successfully; stop after boot confirmation.

- [ ] **Step 6: Manual API checks**

With valid Gemini env vars:

```bash
rtk curl -sS -X POST http://localhost:3001/api/thumbnail-analysis/image-spec \
  -H 'Content-Type: application/json' \
  -d '{"imageUrl":"https://example.com/image.jpg"}'
```

Expected: actual `width`, `height`, `aspectRatio`, `fileSizeKB`, `format`, and `issues`.

## Risk Register

- **Risk:** Target AI service is large and carries old module assumptions.  
  **Mitigation:** Port behavior into new current-path services, not file-copy.

- **Risk:** `sharp` install can affect native builds.  
  **Mitigation:** Add only `sharp`, run `npm ls sharp`, unit tests, and backend boot.

- **Risk:** Gemini models are environment-dependent.  
  **Mitigation:** Use explicit env guards; tests for parsing/helpers do not require Gemini.

- **Risk:** Batch AI calls may partially fail.  
  **Mitigation:** Return successful rows, log failed product IDs, keep per-company abort controller.

- **Risk:** Current UI has older visual styling that violates newer design guidance.  
  **Mitigation:** This plan changes only correctness/navigation. A visual cleanup should be a separate approved scope unless touched components require layout changes.

## Execution Notes

- Use `origin/feat/auth-login-integrated` only as a reference source via `git show`/`git grep`.
- Prefer small commits by task:
  - `test: cover thumbnail ai import helpers`
  - `feat: add thumbnail vision analysis service`
  - `feat: wire thumbnail analysis to current schema`
  - `feat: enrich thumbnail editor prompts`
  - `fix: align image hub editor navigation`
- Do not stage or commit until the user approves execution.
