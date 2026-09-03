# Thumbnail ContentWorkspace Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every thumbnail-domain `productId`/`masterId` alias that carries a `ContentWorkspace.id` with the canonical `contentWorkspaceId`, including server, shared API contracts, web clients, Wing registration, and tracking.

**Architecture:** `ContentWorkspace` is the sole content owner for thumbnail analysis and generation. `SourceCandidate` remains an entry/provenance identifier, `ChannelListing` is the registration/tracking target, and `MasterProduct` terminology is removed from the AI thumbnail bounded context. Prisma already persists required `contentWorkspaceId`, so the change is an application-contract reconstruction without schema migration or compatibility aliases.

**Tech Stack:** NestJS, Prisma 7, Zod, class-validator, Next.js, React Query, Vitest, TypeScript.

## Global Constraints

- `VERSION` remains unchanged.
- No Prisma schema migration or data backfill.
- Removed `productId`, `productIds`, and `masterId` thumbnail request keys fail with `400 Bad Request`; they are never silently treated as direct uploads.
- Do not rename `masterId` outside the AI thumbnail domain when it genuinely references `MasterProduct.id`.
- Every DB lookup remains scoped by `organizationId`.
- Existing UI layout and user workflow remain unchanged.
- Do not add compatibility aliases to shared schemas or response mappers.

---

### Task 1: Canonical shared contract and thumbnail subject

**Files:**
- Create: `packages/shared/src/schemas/thumbnails.contract.spec.ts`
- Modify: `packages/shared/src/schemas/thumbnails.ts`
- Modify: `apps/server/src/ai/domain/thumbnail-generation-subject.ts`
- Modify: `apps/server/src/ai/domain/__tests__/thumbnail-generation-subject.spec.ts`
- Modify: `apps/server/src/ai/adapter/in/http/dto/thumbnail-analyze.dto.ts`
- Modify: `apps/server/src/ai/adapter/in/http/dto/thumbnail-edit.dto.ts`
- Modify: `apps/server/src/ai/adapter/in/http/dto/thumbnail-editor.dto.ts`
- Modify: `apps/server/src/ai/adapter/in/http/thumbnail-editor.controller.ts`
- Modify: `apps/server/src/ai/__tests__/thumbnail-editor.controller.spec.ts`

**Interfaces:**
- Produces: `ThumbnailGenerationSubjectInput` with only `contentWorkspaceId` and `sourceCandidateId`.
- Produces: `ThumbnailGenerationSubject.kind` values `content-workspace`, `collected-product`, and `direct-upload`.
- Produces: shared response fields `contentWorkspaceId`, `contentWorkspace`, and `channelListingId`.
- Consumes: existing Prisma-backed workspace creation/resolution behavior; no DB changes.

- [ ] **Step 1: Add failing shared-contract tests**

```ts
it('uses canonical workspace and listing identifiers', () => {
  expect(ThumbnailGenerationItemSchema.parse(generationFixture)).toMatchObject({
    contentWorkspaceId: WORKSPACE_ID,
    contentWorkspace: { id: WORKSPACE_ID },
  });
  expect(ThumbnailTrackingRecordSchema.parse(trackingFixture)).toMatchObject({
    channelListingId: LISTING_ID,
  });
});

it('does not expose retired thumbnail identity aliases', () => {
  const parsed = ThumbnailGenerationItemSchema.parse(generationFixture);
  expect(parsed).not.toHaveProperty('productId');
  expect(parsed).not.toHaveProperty('masterId');
  expect(parsed).not.toHaveProperty('product');
});
```

- [ ] **Step 2: Add failing subject tests**

```ts
expect(classifyThumbnailGenerationSubject({ contentWorkspaceId: WORKSPACE_ID })).toEqual({
  kind: 'content-workspace',
  contentWorkspaceId: WORKSPACE_ID,
  sourceCandidateId: null,
});
expect(() => classifyThumbnailGenerationSubject({
  contentWorkspaceId: WORKSPACE_ID,
  sourceCandidateId: CANDIDATE_ID,
})).toThrow('동시에 사용할 수 없습니다');
```

Run:

```bash
npm exec --workspace=packages/shared vitest -- run src/schemas/thumbnails.contract.spec.ts
npm exec --workspace=apps/server vitest -- run src/ai/domain/__tests__/thumbnail-generation-subject.spec.ts
```

Expected: FAIL because current schemas and subject types still expose `productId`/`masterId` terminology.

- [ ] **Step 3: Replace shared identity fields**

Change the shared schemas to the following canonical shapes:

```ts
export const ThumbnailAnalysisResultSchema = z.object({
  id: z.string(),
  contentWorkspaceId: z.string().nullable(),
  productName: z.string(),
  // existing analysis fields unchanged
});

export const ThumbnailGenerationItemSchema = z.object({
  id: z.string(),
  contentWorkspaceId: z.string(),
  sourceCandidateId: z.string().nullable().optional(),
  // existing generation fields unchanged
  contentWorkspace: z.object({
    id: z.string(),
    name: z.string(),
    imageUrl: z.string().nullable(),
    coupangProductId: z.string().nullable(),
    category: z.string().nullable(),
    hasBoxImage: z.boolean().optional(),
    hasColorVariantImages: z.boolean().optional(),
  }),
});

export const ThumbnailTrackingRecordSchema = z.object({
  id: z.string(),
  channelListingId: z.string(),
  // existing tracking fields unchanged
});
```

- [ ] **Step 4: Replace the domain subject and reject retired request keys**

Implement the subject as:

```ts
export interface ThumbnailGenerationSubjectInput {
  contentWorkspaceId?: string | null;
  sourceCandidateId?: string | null;
}

export interface ThumbnailGenerationSubject {
  kind: 'content-workspace' | 'collected-product' | 'direct-upload';
  contentWorkspaceId: string | null;
  sourceCandidateId: string | null;
}
```

Use class-validator rejection-only fields on HTTP DTOs so the global whitelist cannot silently erase retired keys:

```ts
@IsEmpty({ message: 'productId는 제거되었습니다. contentWorkspaceId를 사용하세요' })
productId?: never;
```

Use the equivalent `productIds` rejection on batch DTOs. These properties are never read by application services and do not appear in shared request/response contracts.

- [ ] **Step 5: Update editor controller tests and implementation**

The controller resolves only `subject.contentWorkspaceId` through:

```ts
findWorkspaceForThumbnailEditor(contentWorkspaceId, organizationId)
```

and passes `contentWorkspaceId` into the enqueue service. A missing workspace throws `NotFoundException`; mutually exclusive subject IDs and missing images remain `BadRequestException`.

Run:

```bash
npm exec --workspace=packages/shared vitest -- run src/schemas/thumbnails.contract.spec.ts
npm exec --workspace=apps/server vitest -- run src/ai/domain/__tests__/thumbnail-generation-subject.spec.ts src/ai/__tests__/thumbnail-editor.controller.spec.ts
cd packages/shared && npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit the canonical contract**

```bash
git add packages/shared/src/schemas/thumbnails.ts packages/shared/src/schemas/thumbnails.contract.spec.ts apps/server/src/ai/domain/thumbnail-generation-subject.ts apps/server/src/ai/domain/__tests__/thumbnail-generation-subject.spec.ts apps/server/src/ai/adapter/in/http/dto/thumbnail-analyze.dto.ts apps/server/src/ai/adapter/in/http/dto/thumbnail-edit.dto.ts apps/server/src/ai/adapter/in/http/dto/thumbnail-editor.dto.ts apps/server/src/ai/adapter/in/http/thumbnail-editor.controller.ts apps/server/src/ai/__tests__/thumbnail-editor.controller.spec.ts
git commit -m "refactor: canonicalize thumbnail workspace contract"
```

### Task 2: Reconstruct thumbnail generation around ContentWorkspace

**Files:**
- Delete: `apps/server/src/ai/domain/thumbnail-master-image.ts`
- Create: `apps/server/src/ai/domain/thumbnail-workspace-source.ts`
- Create: `apps/server/src/ai/domain/__tests__/thumbnail-workspace-source.spec.ts`
- Modify: `apps/server/src/ai/application/port/out/repository/thumbnail-generation-ledger.repository.port.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/thumbnail-generation-ledger.query.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/thumbnail-generation-ledger.persistence.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/thumbnail-generation-ledger.repository.adapter.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/__tests__/thumbnail-generation-ledger.repository.adapter.spec.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/__tests__/thumbnail-generation-ledger.persistence.spec.ts`
- Modify: `apps/server/src/ai/application/service/thumbnail-generation.service.ts`
- Modify: `apps/server/src/ai/application/service/thumbnail-generation-job.service.ts`
- Modify: `apps/server/src/ai/application/service/__tests__/thumbnail-generation.service.spec.ts`
- Modify: `apps/server/src/ai/mapper/thumbnail-generation.mapper.ts`
- Modify: `apps/server/src/ai/adapter/in/http/thumbnail-analysis-generation-review.controller.ts`

**Interfaces:**
- Consumes: Task 1 canonical shared response fields and subject model.
- Produces: `ThumbnailGenerationLedgerRow.contentWorkspaceId: string` and `contentWorkspace: ThumbnailGenerationWorkspaceSummary`.
- Produces: `findWorkspaceForThumbnailEditor`, `findGenerationWorkspace(s)`, `findWorkspaceForThumbnailJob`, and `findWorkspacesForThumbnailJobs`.

- [ ] **Step 1: Add failing repository and service expectations**

Assert that query adapters return `contentWorkspaceId` directly and never synthesize `masterId`:

```ts
expect(result).toMatchObject({
  contentWorkspaceId: WORKSPACE_ID,
  contentWorkspace: { id: WORKSPACE_ID },
});
expect(result).not.toHaveProperty('masterId');
expect(result).not.toHaveProperty('master');
```

Assert generation list filters use `{ contentWorkspaceId }`, and passing retired `productId` to the HTTP endpoint returns `400`.

Run:

```bash
npm exec --workspace=apps/server vitest -- run src/ai/adapter/out/repository/__tests__/thumbnail-generation-ledger.repository.adapter.spec.ts src/ai/adapter/out/repository/__tests__/thumbnail-generation-ledger.persistence.spec.ts src/ai/application/service/__tests__/thumbnail-generation.service.spec.ts
```

Expected: FAIL on current master aliases.

- [ ] **Step 2: Rename the pure source-image resolver**

Move the pure URL fallback policy to `thumbnail-workspace-source.ts`:

```ts
export interface ThumbnailWorkspaceSourceImage {
  url: string;
  role: string;
  sortOrder: number;
  isPrimary: boolean;
}

export function resolveWorkspaceThumbnailSource(workspace: {
  imageUrl: string | null;
  thumbnailUrl: string | null;
  images: ThumbnailWorkspaceSourceImage[];
}): string | null;
```

Keep the existing URL precedence and displayability rules unchanged. Update all imports and add focused precedence tests.

- [ ] **Step 3: Remove ledger projections and rename ports**

Delete `toGenerationRow()` and map Prisma rows without aliases. Replace port fields and methods with:

```ts
interface ThumbnailGenerationLedgerRow {
  contentWorkspaceId: string;
  contentWorkspace: ThumbnailGenerationWorkspaceSummary;
  sourceCandidateId?: string | null;
}

findGenerationWorkspaces(
  rows: Array<{ contentWorkspaceId: string }>,
  organizationId: string,
): Promise<Map<string, ThumbnailGenerationWorkspaceSummary>>;

findWorkspaceForThumbnailJob(
  contentWorkspaceId: string,
  organizationId: string,
): Promise<ThumbnailGenerationWorkspaceContext | null>;
```

Update persistence arguments such as `SaveEditorResultInput.productId` to `contentWorkspaceId` and write `contentWorkspaceId` directly.

- [ ] **Step 4: Update generation services and controller query contract**

Use `contentWorkspaceId` for ownership checks, generation lookups, alert targets, auto-job deduplication, analysis lookup, and response mapping. The list controller accepts only `contentWorkspaceId`, `sourceCandidateId`, `scope`, and `limit`; a rejection-only `productId` query field returns `400`.

Map response objects with `satisfies ThumbnailGenerationItem` so the shared contract catches drift.

- [ ] **Step 5: Run the generation suite**

```bash
npm exec --workspace=apps/server vitest -- run src/ai/domain/__tests__/thumbnail-workspace-source.spec.ts src/ai/adapter/out/repository/__tests__/thumbnail-generation-ledger.repository.adapter.spec.ts src/ai/adapter/out/repository/__tests__/thumbnail-generation-ledger.persistence.spec.ts src/ai/application/service/__tests__/thumbnail-generation.service.spec.ts src/ai/__tests__/thumbnail-editor.controller.spec.ts
npm run build --workspace=apps/server
```

Expected: PASS with no `masterId` projection in generation responses.

- [ ] **Step 6: Commit generation reconstruction**

```bash
git add apps/server/src/ai
git commit -m "refactor: anchor thumbnail generation to workspaces"
```

### Task 3: Align analysis, Wing registration, and tracking identities

**Files:**
- Modify: `apps/server/src/ai/application/service/thumbnail-vision-ai.service.ts`
- Modify: `apps/server/src/ai/application/service/thumbnail-analysis.service.ts`
- Modify: `apps/server/src/ai/application/service/thumbnail-analysis-analyzer.service.ts`
- Modify: `apps/server/src/ai/application/service/thumbnail-analysis-batch.service.ts`
- Modify: `apps/server/src/ai/application/service/thumbnail-analysis-query.service.ts`
- Modify: `apps/server/src/ai/application/service/__tests__/thumbnail-analysis-batch.service.spec.ts`
- Modify: `apps/server/src/ai/mapper/thumbnail-analysis.mapper.ts`
- Modify: `apps/server/src/ai/adapter/in/http/thumbnail-analysis.controller.ts`
- Modify: `apps/server/src/ai/adapter/in/http/thumbnail-analysis-edit-jobs.controller.ts`
- Modify: `apps/server/src/ai/application/port/out/repository/thumbnail-wing.repository.port.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/thumbnail-wing.repository.adapter.ts`
- Modify: `apps/server/src/ai/application/service/thumbnail-wing.service.ts`
- Modify: `apps/server/src/ai/__tests__/thumbnail-wing.service.spec.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/__tests__/thumbnail-wing.repository.adapter.spec.ts`
- Modify: `apps/server/src/ai/application/port/out/repository/thumbnail-tracking.repository.port.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/thumbnail-tracking.repository.adapter.ts`
- Modify: `apps/server/src/ai/application/service/thumbnail-tracking.service.ts`
- Modify: `apps/server/src/ai/application/service/__tests__/thumbnail-tracking.service.spec.ts`
- Modify: `apps/server/src/ai/adapter/out/repository/__tests__/thumbnail-tracking.repository.adapter.spec.ts`

**Interfaces:**
- Consumes: Task 1 shared `contentWorkspaceId` and `channelListingId` fields.
- Produces: analysis methods named `analyzeWorkspace`, batch inputs named `contentWorkspaceIds`, Wing workspace registration lookup, and tracking output keyed by `channelListingId`.

- [ ] **Step 1: Add failing analysis identity tests**

Update tests to expect:

```ts
expect(result.contentWorkspaceId).toBe(WORKSPACE_ID);
expect(result).not.toHaveProperty('productId');
expect(vision.analyze).toHaveBeenCalledWith(
  expect.arrayContaining([expect.objectContaining({ contentWorkspaceId: WORKSPACE_ID })]),
  expect.anything(),
);
```

Batch and pre-inspection controller tests send `contentWorkspaceIds`. Retired `productIds` requests fail validation with `400`.

- [ ] **Step 2: Rename analysis service vocabulary**

Replace `ThumbnailAiItem.productId` with `contentWorkspaceId`. Rename service methods and locals from product to workspace when they carry workspace rows:

```ts
analyzeWorkspace(contentWorkspaceId, organizationId, scope, signal?)
analyzeBatch(contentWorkspaceIds, organizationId, scope)
preInspect(contentWorkspaceIds, organizationId)
```

Direct image analysis returns `contentWorkspaceId: null` rather than an empty product ID.

- [ ] **Step 3: Reconstruct Wing registration lookup**

Change generation registration data to expose `contentWorkspaceId`. Replace `findRegistrableMaster` with:

```ts
findRegistrableWorkspace(
  contentWorkspaceId: string,
  organizationId: string,
): Promise<ThumbnailWingRegistrableWorkspace | null>;
```

The repository queries `ContentWorkspace` with `{ id, organizationId, status: 'active', isDeleted: false }` and includes its `channelListing`. Errors name `ContentWorkspace` or `ChannelListing`, never `MasterProduct`.

- [ ] **Step 4: Correct tracking identity**

Rename `findFirstListingForMaster(masterId, organizationId)` to
`findChannelListingForWorkspace(contentWorkspaceId, organizationId)`. Change create inputs to `contentWorkspaceId`, and map the public record as:

```ts
return {
  id: row.id,
  channelListingId: row.listing.id,
  productName: listingDisplayName(row.listing),
  // existing metrics unchanged
} satisfies ThumbnailTrackingRecord;
```

Make `ThumbnailTrackingRow.listing` non-null in the repository port because
tracking rows are created with a required `listingId` relation and are always
loaded with `TRACKING_LISTING_INCLUDE`.

- [ ] **Step 5: Run analysis, Wing, and tracking tests**

```bash
npm exec --workspace=apps/server vitest -- run src/ai/application/service/__tests__/thumbnail-analysis-batch.service.spec.ts src/ai/__tests__/thumbnail-wing.service.spec.ts src/ai/adapter/out/repository/__tests__/thumbnail-wing.repository.adapter.spec.ts src/ai/application/service/__tests__/thumbnail-tracking.service.spec.ts src/ai/adapter/out/repository/__tests__/thumbnail-tracking.repository.adapter.spec.ts
npm run build --workspace=apps/server
```

Expected: PASS.

- [ ] **Step 6: Commit analysis and channel-target alignment**

```bash
git add apps/server/src/ai
git commit -m "refactor: align thumbnail analysis and channel identities"
```

### Task 4: Migrate the product-pipeline web client

**Files:**
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/lib/thumbnail-subject.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/lib/thumbnail-subject.spec.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/lib/product-pipeline-routes.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/lib/product-pipeline-routes.spec.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/hooks/useThumbnailGenerations.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/hooks/useThumbnailGenerations.spec.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/hooks/useGenerateSourcingThumbnail.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/page.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/lib/build-edit-href.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/lib/build-edit-href.spec.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/lib/build-generate-thumbnail-dto.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/lib/build-generate-thumbnail-dto.spec.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/hooks/useEditorHistory.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/hooks/useGenerationAwaitingState.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/hooks/useGenerationAwaitingState.spec.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/components/ThumbnailEditorWorkspace.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/hooks/useThumbnailAnalysis.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/hooks/useBatchAnalysis.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/hooks/useThumbnailActions.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/hooks/useThumbnailPageModel.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/hooks/useThumbnailTracking.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/components/AiEditTab.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/components/ScanResultsTab.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/components/UnclassifiedTab.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/components/TrackingTab.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/components/ReadyGenerationSection.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/components/workspace/ThumbnailDetailModalHost.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/__tests__/page.spec.tsx`

**Interfaces:**
- Consumes: canonical shared contracts from Task 1 and canonical server endpoints from Tasks 2-3.
- Produces: URLs, query keys, request payloads, and UI selection maps keyed by `contentWorkspaceId`; tracking rows keyed by `channelListingId`.

- [ ] **Step 1: Update failing route and payload tests first**

Canonical subject conversion is:

```ts
type ThumbnailSubject =
  | { kind: 'content-workspace'; contentWorkspaceId: string }
  | { kind: 'collected-product'; sourceCandidateId: string }
  | { kind: 'direct-upload' };
```

Tests assert generated URLs and DTOs contain `contentWorkspaceId=workspace-1`, never `productId=`, and use `sourceCandidateId` only for collected-product entry.

Run:

```bash
npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/_shared/lib/thumbnail-subject.spec.ts' 'src/app/(product-pipeline)/product-pipeline/_shared/lib/product-pipeline-routes.spec.ts' 'src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/lib/build-generate-thumbnail-dto.spec.ts'
```

Expected: FAIL until web contracts are migrated.

- [ ] **Step 2: Migrate shared hooks and editor state**

Remove `productId` from `ThumbnailSubjectParams`, generation filters, edit href builders, editor history, polling recovery, and request payload builders. Prefer `generation.contentWorkspaceId` as the map key and `generation.contentWorkspace` for display data.

Generation query params are:

```ts
const params = contentWorkspaceId
  ? { contentWorkspaceId }
  : sourceCandidateId
    ? { sourceCandidateId }
    : { scope: 'direct-upload' };
```

- [ ] **Step 3: Migrate thumbnail dashboard maps and actions**

Rename local maps and callbacks so analysis/generation matching uses
`contentWorkspaceId`:

```ts
const generationByWorkspaceId = new Map(
  activeGenerations.map((generation) => [generation.contentWorkspaceId, generation]),
);
```

Analysis, batch edit, recompose, selection, modal, and link payloads send canonical workspace IDs. Tracking UI uses `channelListingId` as the record identity while retaining `productName` as display copy.

- [ ] **Step 4: Run focused web tests and build**

```bash
npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/_shared' 'src/app/(product-pipeline)/product-pipeline/thumbnail-generation' 'src/app/(product-pipeline)/product-pipeline/thumbnail-ai'
npm run build --workspace=apps/web
```

Expected: PASS.

- [ ] **Step 5: Commit web migration**

```bash
git add apps/web/src/lib/query-keys.ts 'apps/web/src/app/(product-pipeline)/product-pipeline'
git commit -m "refactor: migrate thumbnail UI to workspace ids"
```

### Task 5: Remove stale vocabulary and run release gates

**Files:**
- Modify: `apps/server/src/ai/AGENTS.md`
- Modify: `apps/web/src/app/(product-pipeline)/AGENTS.md`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/AGENTS.md`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/AGENTS.md`
- Modify: `docs/ARCHITECTURE.md` only if ownership wording still describes thumbnail content as a product/master boundary.

**Interfaces:**
- Consumes: completed canonical server/shared/web implementation.
- Produces: durable guidance and evidence that no false thumbnail master/product identity remains.

- [ ] **Step 1: Add a stale-vocabulary regression check**

Run and inspect every result:

```bash
rg -n "findJobMaster|findGenerationMaster|JobMaster|GenerationMaster|resolveMasterThumbnailImage|findRegistrableMaster|findFirstListingForMaster|masterId|productIds?|master-product" apps/server/src/ai packages/shared/src/schemas/thumbnails.ts 'apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai' 'apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation' 'apps/web/src/app/(product-pipeline)/product-pipeline/_shared/lib/thumbnail-subject.ts'
```

Expected: no false identity aliases. Remaining `productName`, image prompt wording, and genuine non-thumbnail `MasterProduct` references are reviewed individually rather than mechanically renamed.

- [ ] **Step 2: Update scoped architecture guidance**

Document that AI thumbnail content is anchored to `ContentWorkspace`, collected-product entry uses `SourceCandidate`, and Wing/tracking targets `ChannelListing`. State that no thumbnail API accepts or returns a workspace ID under `productId` or `masterId`.

- [ ] **Step 3: Run all required verification**

```bash
cd packages/shared && npm run build
npm exec --workspace=apps/server vitest -- run src/ai
npm run build --workspace=apps/server
npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline'
npm run build --workspace=apps/web
npm run check:conventions
git diff --check
```

Start `npm run dev:server` and confirm NestJS boots successfully. Then smoke-test the thumbnail dashboard, registered-product thumbnail workspace, collected-product thumbnail workspace, generation polling, and editor refresh recovery in the browser.

- [ ] **Step 4: Confirm release/data notes**

Verify `VERSION` is unchanged and the diff contains no Prisma schema or data-migration file. Record in the PR body:

```text
DB migration/backfill: none. ThumbnailGeneration and ThumbnailAnalysis already
persist contentWorkspaceId; this change removes application-level aliases only.
VERSION: unchanged because persisted schema/data behavior is unchanged.
```

- [ ] **Step 5: Commit final guidance and verification adjustments**

```bash
git add apps/server/src/ai/AGENTS.md 'apps/web/src/app/(product-pipeline)/AGENTS.md' 'apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/AGENTS.md' 'apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/AGENTS.md' docs/ARCHITECTURE.md docs/superpowers/plans/2026-07-14-thumbnail-content-workspace-contract.md
git commit -m "docs: document thumbnail workspace ownership"
```
