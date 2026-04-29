import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { EditAnalysisResult } from '@kiditem/shared/ai';
import type {
  ThumbnailEditorCandidate,
  ThumbnailEditorInputImage,
} from '../../../domain/model/thumbnail-editor';
import { generationInclude } from './thumbnail-generation.query';
import type { GenerationRow } from '../../../mapper/thumbnail-generation.mapper';

/**
 * Tenant-scoped writers for `ThumbnailGeneration` and its candidate / input-
 * image / master-product relations. Each function takes the company scope as
 * an explicit argument and binds it on every write — there is no fallback or
 * default-company recovery path.
 *
 * Writes that span multiple rows ( `applyGeneration`, `replaceGenerationResult`,
 * `removeCandidate`, `reEditJob`) take ownership of `$transaction` here so the
 * service layer keeps a single application-level call path.
 */

export interface SaveEditorResultInput {
  productId: string;
  companyId: string;
  originalUrl: string | null;
  candidates: ThumbnailEditorCandidate[];
  inputImages?: ThumbnailEditorInputImage[];
  method: string;
  inputMeta?: Prisma.InputJsonValue | null;
  editAnalysis?: EditAnalysisResult | null;
  triggeredByUserId?: string | null;
}

export async function saveEditorResult(
  prisma: PrismaService,
  input: SaveEditorResultInput,
): Promise<string> {
  const generation = await prisma.thumbnailGeneration.create({
    data: {
      companyId: input.companyId,
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
          companyId: input.companyId,
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
              companyId: input.companyId,
              url: img.url,
              storageKey: img.storageKey,
              role: img.role,
              label: img.label,
              sortOrder: img.sortOrder,
              source: img.source,
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
    companyId: string;
    masterId: string;
    originalUrl: string;
    method: string;
    inputMeta: Prisma.InputJsonValue;
    editAnalysis: EditAnalysisResult | null;
  },
): Promise<GenerationRow> {
  const generation = await prisma.thumbnailGeneration.create({
    data: {
      companyId: args.companyId,
      masterId: args.masterId,
      originalUrl: args.originalUrl,
      method: args.method,
      status: 'pending',
      phase: null,
      inputMeta: args.inputMeta,
      editAnalysis: args.editAnalysis
        ? (args.editAnalysis as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
    include: generationInclude(args.companyId),
  });
  return generation as unknown as GenerationRow;
}

/**
 * Update `selectedUrl` (or clear it on de-select), gating the change to the
 * caller's company. When selecting a real URL also flips status/phase to
 * succeeded/ready to mirror the legacy behavior.
 */
export async function setSelectedCandidate(
  prisma: PrismaService,
  id: string,
  companyId: string,
  selectedUrl: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.thumbnailGeneration.updateMany({
      where: { id, companyId },
      data: {
        selectedUrl: selectedUrl,
        ...(selectedUrl ? { status: 'succeeded', phase: 'ready' } : {}),
      },
    });
  });
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
 * generation row to phase=`applied`. All writes bind `companyId`.
 */
export async function applyGenerationToMaster(
  prisma: PrismaService,
  args: {
    id: string;
    companyId: string;
    masterId: string;
    selected: ApplyGenerationSelected | null;
  },
): Promise<void> {
  const { id, companyId, masterId, selected } = args;
  await prisma.$transaction(async (tx) => {
    if (selected) {
      await tx.masterProduct.updateMany({
        where: { id: masterId, companyId, isDeleted: false },
        data: { imageUrl: selected.url },
      });
      await tx.masterProductImage.updateMany({
        where: { companyId, masterId, isDeleted: false },
        data: { isPrimary: false },
      });
      await tx.masterProductImage.create({
        data: {
          companyId,
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
      where: { id, companyId },
      data: { status: 'succeeded', phase: 'applied', selectedUrl: selected?.url ?? null },
    });
  });
}

export async function markGenerationCancelled(
  prisma: PrismaService,
  id: string,
  companyId: string,
): Promise<void> {
  await prisma.thumbnailGeneration.updateMany({
    where: { id, companyId },
    data: { status: 'cancelled', phase: null },
  });
}

export async function deleteGeneration(
  prisma: PrismaService,
  id: string,
  companyId: string,
): Promise<void> {
  await prisma.thumbnailGeneration.deleteMany({ where: { id, companyId } });
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
    companyId: string;
    candidateId: string;
    candidateUrl: string;
    selectedUrl: string | null;
    remainingAfterDelete: number;
  },
): Promise<void> {
  const { id, companyId, candidateId, candidateUrl, selectedUrl, remainingAfterDelete } = args;
  await prisma.$transaction(async (tx) => {
    await tx.thumbnailGenerationCandidate.deleteMany({ where: { id: candidateId, companyId } });
    if (remainingAfterDelete === 0) {
      await tx.thumbnailGeneration.deleteMany({ where: { id, companyId } });
      return;
    }
    if (selectedUrl === candidateUrl) {
      await tx.thumbnailGeneration.updateMany({
        where: { id, companyId },
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
    companyId: string;
    purpose: 'compliance' | 'quality';
    variantKey: 'auto' | 'with-box' | 'no-box' | null;
  },
): Promise<void> {
  const { id, companyId, purpose, variantKey } = args;
  await prisma.$transaction(async (tx) => {
    await tx.thumbnailGenerationCandidate.deleteMany({
      where: { generationId: id, companyId },
    });
    await tx.thumbnailGeneration.updateMany({
      where: { id, companyId },
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
  });
}

/**
 * Atomically lock a pending/running generation into `running` and increment
 * its attempt counter. Returns true when the lock was taken so the caller
 * knows whether to proceed; returns false if the row was already locked or no
 * longer exists in the caller's company.
 */
export async function lockGenerationForProcessing(
  prisma: PrismaService,
  id: string,
  companyId: string,
): Promise<boolean> {
  const locked = await prisma.thumbnailGeneration.updateMany({
    where: { id, companyId, status: { in: ['pending', 'running'] } },
    data: {
      status: 'running',
      phase: null,
      errorMessage: null,
      attemptCount: { increment: 1 },
    },
  });
  return locked.count > 0;
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
    companyId: string;
    candidates: ThumbnailEditorCandidate[];
    inputImages: ThumbnailEditorInputImage[];
    inputMeta: Prisma.InputJsonValue;
    editAnalysis: EditAnalysisResult | null;
  },
): Promise<void> {
  const { generationId, companyId, candidates, inputImages, inputMeta, editAnalysis } = args;
  await prisma.$transaction(async (tx) => {
    const current = await tx.thumbnailGeneration.findFirst({
      where: { id: generationId, companyId, status: 'running' },
      select: { id: true },
    });
    if (!current) return;
    await tx.thumbnailGenerationCandidate.deleteMany({ where: { generationId, companyId } });
    await tx.thumbnailGenerationInputImage.deleteMany({ where: { generationId, companyId } });
    if (candidates.length > 0) {
      await tx.thumbnailGenerationCandidate.createMany({
        data: candidates.map((candidate, index) => ({
          companyId,
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
          companyId,
          generationId,
          url: img.url,
          storageKey: img.storageKey,
          role: img.role,
          label: img.label,
          sortOrder: img.sortOrder,
          source: img.source,
          mimeType: img.mimeType,
          width: null,
          height: null,
          fileSize: img.fileSize,
        })),
      });
    }
    await tx.thumbnailGeneration.updateMany({
      where: { id: generationId, companyId, status: 'running' },
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
  });
}

export async function markGenerationFailed(
  prisma: PrismaService,
  id: string,
  companyId: string,
  message: string,
): Promise<void> {
  await prisma.thumbnailGeneration
    .updateMany({
      where: { id, companyId, status: 'running' },
      data: { status: 'failed', phase: null, errorMessage: message },
    })
    .catch(() => {});
}
