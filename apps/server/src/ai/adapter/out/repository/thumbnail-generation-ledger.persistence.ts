import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { EditAnalysisResult } from '@kiditem/shared/ai';
import type {
  ThumbnailEditorCandidate,
  ThumbnailEditorInputImage,
} from '../../../domain/model/thumbnail-editor';
import { generationInclude } from './thumbnail-generation-ledger.query';
import type { GenerationRow } from '../../../mapper/thumbnail-generation.mapper';

/**
 * Tenant-scoped writers for `ThumbnailGeneration` and its candidate / input-
 * image / master-product relations. Each function takes the organization scope as
 * an explicit argument and binds it on every write — there is no fallback or
 * default-organization recovery path.
 *
 * Writes that span multiple rows ( `applyGeneration`, `replaceGenerationResult`,
 * `removeCandidate`, `reEditJob`) take ownership of `$transaction` here so the
 * service layer keeps a single application-level call path.
 */

export interface SaveEditorResultInput {
  productId: string;
  organizationId: string;
  originalUrl: string | null;
  candidates: ThumbnailEditorCandidate[];
  inputImages?: ThumbnailEditorInputImage[];
  method: string;
  inputMeta?: Prisma.InputJsonValue | null;
  editAnalysis?: EditAnalysisResult | null;
  triggeredByUserId?: string | null;
}

function normalizeInputSource(source: string | null | undefined): string {
  if (source === 'other-product') return 'other_product';
  if (source === 'prev-gen' || source === 're-edit') return 'prev_gen';
  if (source === 'master_image') return 'hub';
  return source ?? 'upload';
}

export async function saveEditorResult(
  prisma: PrismaService,
  input: SaveEditorResultInput,
): Promise<string> {
  const generation = await prisma.thumbnailGeneration.create({
    data: {
      organizationId: input.organizationId,
      masterId: input.productId,
      originalUrl: input.originalUrl,
      method: input.method,
      status: 'succeeded',
      phase: 'ready',
      inputMeta: input.inputMeta ?? undefined,
      editAnalysis: input.editAnalysis
        ? (input.editAnalysis as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      triggeredByUserId: input.triggeredByUserId ?? null,
      candidates: {
        create: input.candidates.map((c, index) => ({
          organizationId: input.organizationId,
          url: c.url,
          storageKey: c.storageKey ?? null,
          filename: c.filename ?? c.storageKey?.split('/').pop() ?? null,
          sortOrder: index,
          mimeType: c.mimeType ?? null,
          width: null,
          height: null,
          fileSize: c.fileSize ?? null,
        })),
      },
      inputImages: input.inputImages?.length
        ? {
            create: input.inputImages.map((img) => ({
              organizationId: input.organizationId,
              url: img.url,
              storageKey: img.storageKey,
              role: img.role,
              label: img.label,
              sortOrder: img.sortOrder,
              source: normalizeInputSource(img.source),
              masterImageId: img.masterImageId ?? null,
              candidateImageId: img.candidateImageId ?? null,
              sourceThumbnailCandidateId: img.sourceThumbnailCandidateId ?? null,
              mimeType: img.mimeType,
              width: null,
              height: null,
              fileSize: img.fileSize,
            })),
          }
        : undefined,
    },
    select: { id: true },
  });
  return generation.id;
}

/**
 * Build the create-data for a brand-new pending edit job. Returns the inserted
 * row already hydrated with the standard `generationInclude` shape so the
 * service can mapper-render it back to the API without a second query.
 */
export async function createPendingEditJob(
  prisma: PrismaService,
  args: {
    organizationId: string;
    masterId: string;
    originalUrl: string;
    method: string;
    inputMeta: Prisma.InputJsonValue;
    editAnalysis: EditAnalysisResult | null;
    contentWorkspaceId?: string | null;
    triggeredByUserId?: string | null;
  },
): Promise<GenerationRow> {
  const generation = await prisma.thumbnailGeneration.create({
    data: {
      organizationId: args.organizationId,
      masterId: args.masterId,
      originalUrl: args.originalUrl,
      method: args.method,
      contentWorkspaceId: args.contentWorkspaceId ?? null,
      status: 'pending',
      phase: null,
      inputMeta: args.inputMeta,
      editAnalysis: args.editAnalysis
        ? (args.editAnalysis as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      triggeredByUserId: args.triggeredByUserId ?? null,
    },
    include: generationInclude(args.organizationId),
  });
  return generation as unknown as GenerationRow;
}

/**
 * Build a pending thumbnail generation for a sourcing candidate workspace.
 * Candidate-bound rows intentionally have no `masterId`; they become product
 * gallery images only if promotion copies a selected candidate into
 * `MasterProductImage`.
 */
export async function createPendingCandidateJob(
  prisma: PrismaService,
  args: {
    organizationId: string;
    sourceCandidateId: string;
    originalUrl: string;
    method: string;
    inputMeta: Prisma.InputJsonValue;
    contentWorkspaceId?: string | null;
    triggeredByUserId?: string | null;
  },
): Promise<{ id: string }> {
  return prisma.thumbnailGeneration.create({
    data: {
      organizationId: args.organizationId,
      masterId: null,
      sourceCandidateId: args.sourceCandidateId,
      contentWorkspaceId: args.contentWorkspaceId ?? null,
      originalUrl: args.originalUrl,
      method: args.method,
      status: 'pending',
      phase: null,
      inputMeta: args.inputMeta,
      editAnalysis: Prisma.JsonNull,
      triggeredByUserId: args.triggeredByUserId ?? null,
    },
    select: { id: true },
  });
}

/**
 * Build a pending thumbnail generation for the standalone thumbnail editor.
 * These rows intentionally have neither `masterId` nor `sourceCandidateId`:
 * they are user-visible only by generation id and must not create sourcing
 * inbox cards.
 */
export async function createPendingStandaloneJob(
  prisma: PrismaService,
  args: {
    organizationId: string;
    originalUrl: string;
    method: string;
    inputMeta: Prisma.InputJsonValue;
    contentWorkspaceId?: string | null;
    triggeredByUserId?: string | null;
  },
): Promise<{ id: string }> {
  return prisma.thumbnailGeneration.create({
    data: {
      organizationId: args.organizationId,
      masterId: null,
      sourceCandidateId: null,
      contentWorkspaceId: args.contentWorkspaceId ?? null,
      originalUrl: args.originalUrl,
      method: args.method,
      status: 'pending',
      phase: null,
      inputMeta: args.inputMeta,
      editAnalysis: Prisma.JsonNull,
      triggeredByUserId: args.triggeredByUserId ?? null,
    },
    select: { id: true },
  });
}

/**
 * Update `selectedUrl` (or clear it on de-select), gating the change to the
 * caller's organization. When selecting a real URL also flips status/phase to
 * succeeded/ready to mirror the legacy behavior.
 */
export async function setSelectedCandidate(
  prisma: PrismaService,
  id: string,
  organizationId: string,
  selectedUrl: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.thumbnailGeneration.updateMany({
      where: { id, organizationId, isDeleted: false },
      data: {
        selectedUrl: selectedUrl,
        ...(selectedUrl ? { status: 'succeeded', phase: 'ready' } : {}),
      },
    });
  });
}

/**
 * 선택 대기 (`phase: 'ready'`) 상태의 generation 들의 `selectedUrl` 을 일괄 해제.
 *
 * 사용처: `/thumbnails` AI 편집 탭의 "선택 대기" 진입 시 — 사용자가 새로
 * 들어올 때마다 깨끗한 선택 상태에서 시작하도록 한다. 이미 적용된
 * (`phase: 'applied'`) generation 의 `selectedUrl` 은 유지 (실 적용 결과니까).
 *
 * Tenant scope: organizationId WHERE 절로 강제.
 */
export async function clearReadySelections(
  prisma: PrismaService,
  organizationId: string,
): Promise<{ count: number }> {
  const result = await prisma.thumbnailGeneration.updateMany({
    where: {
      organizationId,
      phase: 'ready',
      selectedUrl: { not: null },
    },
    data: { selectedUrl: null },
  });
  return { count: result.count };
}

export interface ApplyGenerationSelected {
  url: string;
  storageKey: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
}

/**
 * Apply the chosen candidate as the master product's primary image. Single
 * transaction owns: write `MasterProduct.imageUrl`, demote any existing
 * primary `MasterProductImage`, insert the new primary image, and flip the
 * generation row to phase=`applied`. All writes bind `organizationId`.
 */
export async function applyGenerationToMaster(
  prisma: PrismaService,
  args: {
    id: string;
    organizationId: string;
    masterId: string;
    selected: ApplyGenerationSelected | null;
  },
): Promise<void> {
  const { id, organizationId, masterId, selected } = args;
  await prisma.$transaction(async (tx) => {
    if (selected) {
      await tx.masterProduct.updateMany({
        where: { id: masterId, organizationId, isDeleted: false },
        data: { imageUrl: selected.url },
      });
      await tx.masterProductImage.updateMany({
        where: { organizationId, masterId, isDeleted: false },
        data: { isPrimary: false },
      });
      await tx.masterProductImage.create({
        data: {
          organizationId,
          masterId,
          url: selected.url,
          storageKey: selected.storageKey,
          role: 'product',
          label: 'AI thumbnail',
          sortOrder: 0,
          source: 'thumbnail_generation',
          mimeType: selected.mimeType ?? null,
          width: selected.width ?? null,
          height: selected.height ?? null,
          fileSize: selected.fileSize ?? null,
          isPrimary: true,
        },
      });
    }
    await tx.thumbnailGeneration.updateMany({
      where: { id, organizationId, isDeleted: false },
      data: { status: 'succeeded', phase: 'applied', selectedUrl: selected?.url ?? null },
    });
  });
}

export async function markGenerationCancelled(
  prisma: PrismaService,
  id: string,
  organizationId: string,
): Promise<{ fromStatus: string; fromPhase: string | null } | null> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.thumbnailGeneration.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: { status: true, phase: true },
    });
    if (!current) return null;
    const updated = await tx.thumbnailGeneration.updateMany({
      where: {
        id,
        organizationId,
        isDeleted: false,
        status: { in: ['pending', 'running'] },
      },
      data: { status: 'cancelled', phase: null },
    });
    if (updated.count === 0) return null;
    return { fromStatus: current.status, fromPhase: current.phase };
  });
}

export async function deleteGeneration(
  prisma: PrismaService,
  id: string,
  organizationId: string,
): Promise<void> {
  await prisma.thumbnailGeneration.updateMany({
    where: { id, organizationId, isDeleted: false },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

/**
 * Drop a single candidate; if it was the last remaining candidate, drop the
 * generation row too. If it was the selected URL, clear the selection. Single
 * transaction so a partial state cannot leak.
 */
export async function removeCandidate(
  prisma: PrismaService,
  args: {
    id: string;
    organizationId: string;
    candidateId: string;
    candidateUrl: string;
    selectedUrl: string | null;
    remainingAfterDelete: number;
  },
): Promise<void> {
  const { id, organizationId, candidateId, candidateUrl, selectedUrl, remainingAfterDelete } = args;
  await prisma.$transaction(async (tx) => {
    await tx.thumbnailGenerationCandidate.deleteMany({ where: { id: candidateId, organizationId } });
    if (remainingAfterDelete === 0) {
      await tx.thumbnailGeneration.updateMany({
        where: { id, organizationId, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      return;
    }
    if (selectedUrl === candidateUrl) {
      await tx.thumbnailGeneration.updateMany({
        where: { id, organizationId, isDeleted: false },
        data: { selectedUrl: null },
      });
    }
  });
}

/**
 * Reset a finished generation back to pending and clear its candidates so the
 * background scheduler can reprocess. `inputMeta` is replaced with a minimal
 * re-edit pointer; the prior context is no longer needed because the next
 * `processEditJob` rebuilds it from fresh master analysis.
 */
export async function resetGenerationForReEdit(
  prisma: PrismaService,
  args: {
    id: string;
    organizationId: string;
    purpose: 'compliance' | 'quality';
    variantKey: 'auto' | 'with-box' | 'no-box' | null;
  },
): Promise<{ fromStatus: string; fromPhase: string | null } | null> {
  const { id, organizationId, purpose, variantKey } = args;
  return prisma.$transaction(async (tx) => {
    const current = await tx.thumbnailGeneration.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: { status: true, phase: true },
    });
    if (!current) return null;
    await tx.thumbnailGenerationCandidate.deleteMany({
      where: { generationId: id, organizationId },
    });
    await tx.thumbnailGeneration.updateMany({
      where: { id, organizationId, isDeleted: false },
      data: {
        status: 'pending',
        phase: null,
        selectedUrl: null,
        errorMessage: null,
        inputMeta: {
          sourceGenerationId: id,
          purpose,
          variantKey: variantKey ?? 'auto',
        },
      },
    });
    return { fromStatus: current.status, fromPhase: current.phase };
  });
}

/**
 * Atomically lock a pending/running generation into `running` and increment
 * its attempt counter. Returns true when the lock was taken so the caller
 * knows whether to proceed; returns false if the row was already locked or no
 * longer exists in the caller's organization.
 */
export async function lockGenerationForProcessing(
  prisma: PrismaService,
  id: string,
  organizationId: string,
): Promise<{
  fromStatus: string;
  fromPhase: string | null;
  attemptNumber: number;
} | null> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.thumbnailGeneration.findFirst({
      where: { id, organizationId, isDeleted: false, status: { in: ['pending', 'running'] } },
      select: { status: true, phase: true, attemptCount: true },
    });
    if (!current) return null;
    const locked = await tx.thumbnailGeneration.updateMany({
      where: { id, organizationId, isDeleted: false, status: current.status },
      data: {
        status: 'running',
        phase: null,
        errorMessage: null,
        attemptCount: { increment: 1 },
      },
    });
    if (locked.count === 0) return null;
    return {
      fromStatus: current.status,
      fromPhase: current.phase,
      attemptNumber: current.attemptCount + 1,
    };
  });
}

/**
 * Replace a `running` generation's candidate / input-image rows with the new
 * Gemini results and flip status back to `succeeded` / `ready`. The inner
 * `findFirst` re-checks status so a parallel cancel cannot be overridden.
 */
export async function replaceGenerationResult(
  prisma: PrismaService,
  args: {
    generationId: string;
    organizationId: string;
    candidates: ThumbnailEditorCandidate[];
    inputImages: ThumbnailEditorInputImage[];
    inputMeta: Prisma.InputJsonValue;
    editAnalysis: EditAnalysisResult | null;
  },
): Promise<{
  fromStatus: string;
  fromPhase: string | null;
  attemptNumber: number;
} | null> {
  const { generationId, organizationId, candidates, inputImages, inputMeta, editAnalysis } = args;
  return prisma.$transaction(async (tx) => {
    const current = await tx.thumbnailGeneration.findFirst({
      where: { id: generationId, organizationId, isDeleted: false, status: 'running' },
      select: { id: true, status: true, phase: true, attemptCount: true },
    });
    if (!current) return null;
    await tx.thumbnailGenerationCandidate.deleteMany({ where: { generationId, organizationId } });
    await tx.thumbnailGenerationInputImage.deleteMany({ where: { generationId, organizationId } });
    if (candidates.length > 0) {
      await tx.thumbnailGenerationCandidate.createMany({
        data: candidates.map((candidate, index) => ({
          organizationId,
          generationId,
          url: candidate.url,
          storageKey: candidate.storageKey ?? null,
          filename: candidate.filename ?? candidate.storageKey?.split('/').pop() ?? null,
          sortOrder: index,
          mimeType: candidate.mimeType ?? null,
          width: null,
          height: null,
          fileSize: candidate.fileSize ?? null,
        })),
      });
    }
    if (inputImages.length > 0) {
      await tx.thumbnailGenerationInputImage.createMany({
        data: inputImages.map((img) => ({
          organizationId,
          generationId,
          url: img.url,
          storageKey: img.storageKey,
          role: img.role,
          label: img.label,
          sortOrder: img.sortOrder,
          source: normalizeInputSource(img.source),
          masterImageId: img.masterImageId ?? null,
          candidateImageId: img.candidateImageId ?? null,
          sourceThumbnailCandidateId: img.sourceThumbnailCandidateId ?? null,
          mimeType: img.mimeType,
          width: null,
          height: null,
          fileSize: img.fileSize,
        })),
      });
    }
    await tx.thumbnailGeneration.updateMany({
      where: { id: generationId, organizationId, isDeleted: false, status: 'running' },
      data: {
        status: 'succeeded',
        phase: 'ready',
        selectedUrl: null,
        errorMessage: null,
        inputMeta,
        editAnalysis: editAnalysis
          ? (editAnalysis as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
    return {
      fromStatus: current.status,
      fromPhase: current.phase,
      attemptNumber: current.attemptCount,
    };
  });
}

/**
 * Async-pipeline variant of `replaceGenerationResult` for direct thumbnail
 * generation completion.
 *
 * Differences from `replaceGenerationResult`:
 *   - Does NOT delete or rewrite `ThumbnailGenerationInputImage` rows.
 *     Inputs are written once at enqueue time by the producer; the
 *     async sink only owns the candidate / status / phase transition.
 *   - Same atomic lock-checking pattern (status='running' must be
 *     true at write time so a parallel cancel cannot be overridden).
 */
export async function applyDirectSuccessResult(
  prisma: PrismaService,
  args: {
    generationId: string;
    organizationId: string;
    candidates: ThumbnailEditorCandidate[];
    inputMeta: Prisma.InputJsonValue;
  },
): Promise<{
  fromStatus: string;
  fromPhase: string | null;
  attemptNumber: number;
} | null> {
  const { generationId, organizationId, candidates, inputMeta } = args;
  return prisma.$transaction(async (tx) => {
    const current = await tx.thumbnailGeneration.findFirst({
      where: { id: generationId, organizationId, isDeleted: false, status: 'running' },
      select: { id: true, status: true, phase: true, attemptCount: true },
    });
    if (!current) return null;
    await tx.thumbnailGenerationCandidate.deleteMany({ where: { generationId, organizationId } });
    if (candidates.length > 0) {
      await tx.thumbnailGenerationCandidate.createMany({
        data: candidates.map((candidate, index) => ({
          organizationId,
          generationId,
          url: candidate.url,
          storageKey: candidate.storageKey ?? null,
          filename: candidate.filename ?? candidate.storageKey?.split('/').pop() ?? null,
          sortOrder: index,
          mimeType: candidate.mimeType ?? null,
          width: null,
          height: null,
          fileSize: candidate.fileSize ?? null,
        })),
      });
    }
    await tx.thumbnailGeneration.updateMany({
      where: { id: generationId, organizationId, isDeleted: false, status: 'running' },
      data: {
        status: 'succeeded',
        phase: 'ready',
        selectedUrl: null,
        errorMessage: null,
        inputMeta,
      },
    });
    return {
      fromStatus: current.status,
      fromPhase: current.phase,
      attemptNumber: current.attemptCount,
    };
  });
}

/**
 * Persist a producer-resolved input-image array onto a freshly created
 * pending generation row. Used by the editor enqueue path so the user
 * can see their inputs in the generation history while the direct job is still
 * working on candidates.
 */
export async function persistPendingInputImages(
  prisma: PrismaService,
  args: {
    generationId: string;
    organizationId: string;
    inputImages: ThumbnailEditorInputImage[];
  },
): Promise<void> {
  if (args.inputImages.length === 0) return;
  await prisma.thumbnailGenerationInputImage.createMany({
    data: args.inputImages.map((img) => ({
      organizationId: args.organizationId,
      generationId: args.generationId,
      url: img.url,
      storageKey: img.storageKey,
      role: img.role,
      label: img.label,
      sortOrder: img.sortOrder,
      source: normalizeInputSource(img.source),
      masterImageId: img.masterImageId ?? null,
      candidateImageId: img.candidateImageId ?? null,
      sourceThumbnailCandidateId: img.sourceThumbnailCandidateId ?? null,
      mimeType: img.mimeType,
      width: null,
      height: null,
      fileSize: img.fileSize,
    })),
  });
}

export async function markGenerationFailed(
  prisma: PrismaService,
  id: string,
  organizationId: string,
  message: string,
): Promise<{
  fromStatus: string;
  fromPhase: string | null;
  attemptNumber: number;
} | null> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.thumbnailGeneration.findFirst({
      where: { id, organizationId, isDeleted: false, status: 'running' },
      select: { status: true, phase: true, attemptCount: true },
    });
    if (!current) return null;
    const updated = await tx.thumbnailGeneration.updateMany({
      where: { id, organizationId, isDeleted: false, status: 'running' },
      data: { status: 'failed', phase: null, errorMessage: message },
    });
    if (updated.count === 0) return null;
    return {
      fromStatus: current.status,
      fromPhase: current.phase,
      attemptNumber: current.attemptCount,
    };
  }).catch(() => null);
}
