import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { generationInclude } from './thumbnail-generation-ledger.query';
import type { EditAnalysisResult } from '@kiditem/shared/ai';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { ThumbnailEditorCandidate, ThumbnailEditorInputImage } from '../../../domain/model/thumbnail-editor';
import type { GenerationRow } from '../../../domain/thumbnail-generation.mapper';

/**
 * Tenant-scoped writers for `ThumbnailGeneration` and its candidate / input-
 * image / content-workspace relations. Each function takes the organization scope as
 * an explicit argument and binds it on every write — there is no fallback or
 * default-organization recovery path.
 *
 * Writes that span multiple rows ( `applyGeneration`, `replaceGenerationResult`,
 * `removeCandidate`, `reEditJob`) take ownership of `$transaction` here so the
 * service layer keeps a single application-level call path.
 */

export interface SaveEditorResultInput {
  contentWorkspaceId: string;
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
  if (source === 'workspace_image' || source === 'master_image') return 'hub';
  return source ?? 'upload';
}

interface LockedThumbnailGeneration {
  id: string;
  status: string;
  phase: string | null;
  attemptCount: number;
  selectedUrl: string | null;
}

async function lockThumbnailGeneration(
  tx: Prisma.TransactionClient,
  id: string,
  organizationId: string,
): Promise<LockedThumbnailGeneration | null> {
  const rows = await tx.$queryRaw<LockedThumbnailGeneration[]>(Prisma.sql`
    SELECT
      id,
      status,
      phase,
      attempt_count AS "attemptCount",
      selected_url AS "selectedUrl"
    FROM thumbnail_generations
    WHERE id = ${id}::uuid
      AND organization_id = ${organizationId}::uuid
      AND is_deleted = false
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

async function lockThumbnailCandidateByUrl(
  tx: Prisma.TransactionClient,
  input: { generationId: string; organizationId: string; candidateUrl: string },
): Promise<{ id: string; url: string } | null> {
  const rows = await tx.$queryRaw<Array<{ id: string; url: string }>>(Prisma.sql`
    SELECT id, url
    FROM thumbnail_generation_candidates
    WHERE generation_id = ${input.generationId}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND url = ${input.candidateUrl}
    ORDER BY id
    LIMIT 1
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

async function assertThumbnailProvenanceMutable(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; generationId: string; candidateId?: string },
): Promise<void> {
  const adopted = await tx.contentWorkspaceThumbnailSelection.findFirst({
    where: {
      organizationId: input.organizationId,
      ...(input.candidateId
        ? { sourceThumbnailCandidateId: input.candidateId }
        : {
            OR: [
              { sourceThumbnailGenerationId: input.generationId },
              { sourceCandidate: { is: { generationId: input.generationId } } },
            ],
          }),
    },
    select: { id: true },
  });
  if (adopted) {
    throw new ConflictException('Adopted thumbnail provenance cannot be changed.');
  }
}

export async function saveEditorResult(prisma: PrismaService, input: SaveEditorResultInput): Promise<string> {
  const generation = await prisma.thumbnailGeneration.create({
    data: {
      organizationId: input.organizationId,
      contentWorkspaceId: input.contentWorkspaceId,
      originalUrl: input.originalUrl,
      method: input.method,
      status: 'succeeded',
      phase: 'ready',
      inputMeta: input.inputMeta ?? undefined,
      editAnalysis: input.editAnalysis ? (input.editAnalysis as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
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
  prisma: Prisma.TransactionClient | PrismaService,
  args: {
    id?: string;
    organizationId: string;
    contentWorkspaceId: string;
    originalUrl: string;
    method: string;
    inputMeta: Prisma.InputJsonValue;
    editAnalysis: EditAnalysisResult | null;
    triggeredByUserId?: string | null;
  },
): Promise<GenerationRow> {
  const generation = await prisma.thumbnailGeneration.create({
    data: {
      ...(args.id ? { id: args.id } : {}),
      organizationId: args.organizationId,
      originalUrl: args.originalUrl,
      method: args.method,
      contentWorkspaceId: args.contentWorkspaceId,
      status: 'pending',
      phase: null,
      inputMeta: args.inputMeta,
      editAnalysis: args.editAnalysis ? (args.editAnalysis as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      triggeredByUserId: args.triggeredByUserId ?? null,
    },
    include: generationInclude(args.organizationId),
  });
  return generation as unknown as GenerationRow;
}

/**
 * Build a pending thumbnail generation for a sales-product draft workspace.
 * The draft owns one workspace, so the job opens (or reuses) that workspace and
 * registration later attaches the listing to the same row.
 */
export async function createPendingSalesProductJob(
  prisma: Prisma.TransactionClient | PrismaService,
  args: {
    id?: string;
    organizationId: string;
    salesProductId: string;
    productName: string;
    originalUrl: string;
    method: string;
    inputMeta: Prisma.InputJsonValue;
    contentWorkspaceId?: string | null;
    triggeredByUserId?: string | null;
  },
): Promise<{ id: string }> {
  let contentWorkspaceId = args.contentWorkspaceId ?? undefined;
  if (!contentWorkspaceId) {
    const existing = await prisma.contentWorkspace.findFirst({
      where: {
        organizationId: args.organizationId,
        salesProductId: args.salesProductId,
        status: 'active',
        isDeleted: false,
      },
      select: { id: true },
    });
    if (existing) {
      contentWorkspaceId = existing.id;
    } else {
      const displayName = args.productName.trim() || '상품 콘텐츠 작업';
      // 초안 작업공간은 판매상품 하나에 하나다. 호출자 트랜잭션 안에서도 안전하도록 유일 index 에
      // 부딪히면 넣지 않고(ON CONFLICT DO NOTHING) 이긴 쪽을 다시 읽는다.
      await prisma.$executeRaw`
        INSERT INTO content_workspaces
          (id, organization_id, owner_type, sales_product_id, display_name, normalized_title, status, is_deleted)
        VALUES
          (${randomUUID()}::uuid, ${args.organizationId}::uuid, 'sales_product', ${args.salesProductId}::uuid,
           ${displayName}, ${displayName.toLowerCase()}, 'active', false)
        ON CONFLICT (organization_id, sales_product_id)
          WHERE sales_product_id IS NOT NULL AND status = 'active' AND is_deleted = false
        DO NOTHING`;
      const ensured = await prisma.contentWorkspace.findFirstOrThrow({
        where: { organizationId: args.organizationId, salesProductId: args.salesProductId, status: 'active', isDeleted: false },
        select: { id: true },
      });
      contentWorkspaceId = ensured.id;
    }
  }
  return prisma.thumbnailGeneration.create({
    data: {
      ...(args.id ? { id: args.id } : {}),
      organizationId: args.organizationId,
      contentWorkspaceId,
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
 * These rows get a `direct_detail_page` workspace of their own: they are
 * user-visible only by generation id and must not create sourcing inbox cards.
 */
export async function createPendingStandaloneJob(
  prisma: Prisma.TransactionClient | PrismaService,
  args: {
    id?: string;
    organizationId: string;
    originalUrl: string;
    method: string;
    inputMeta: Prisma.InputJsonValue;
    contentWorkspaceId?: string | null;
    triggeredByUserId?: string | null;
  },
): Promise<{ id: string }> {
  const contentWorkspaceId =
    args.contentWorkspaceId ??
    (
      await prisma.contentWorkspace.create({
        data: {
          organizationId: args.organizationId,
          ownerType: 'direct_detail_page',
          displayName: 'Standalone thumbnail',
          normalizedTitle: `standalone-thumbnail-${randomUUID()}`,
        },
        select: { id: true },
      })
    ).id;
  return prisma.thumbnailGeneration.create({
    data: {
      ...(args.id ? { id: args.id } : {}),
      organizationId: args.organizationId,
      contentWorkspaceId,
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
 * 사용처: `/product-pipeline/thumbnail-ai` AI 편집 탭의 "선택 대기" 진입 시 — 사용자가 새로
 * 들어올 때마다 깨끗한 선택 상태에서 시작하도록 한다. 이미 적용된
 * (`phase: 'applied'`) generation 의 `selectedUrl` 은 유지 (실 적용 결과니까).
 *
 * Tenant scope: organizationId WHERE 절로 강제.
 */
export async function clearReadySelections(prisma: PrismaService, organizationId: string): Promise<{ count: number }> {
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
 * Adopt the chosen candidate as the content workspace's current thumbnail.
 * The Sellpia ContentWorkspace is inventory-only and never receives media.
 */
export async function applyGenerationToWorkspace(
  prisma: PrismaService,
  args: {
    id: string;
    organizationId: string;
    contentWorkspaceId: string;
    selected: ApplyGenerationSelected | null;
  },
): Promise<void> {
  const { id, organizationId, contentWorkspaceId, selected } = args;
  await prisma.$transaction(async (tx) => {
    if (selected) {
      const candidate = await tx.thumbnailGenerationCandidate.findFirst({
        where: { generationId: id, organizationId, url: selected.url },
        select: { id: true },
      });
      const assetKey = selected.storageKey ?? `thumbnail-generation:${id}:selected`;
      const asset = await tx.contentAsset.upsert({
        where: {
          organizationId_assetKey: { organizationId, assetKey },
        },
        create: {
          organizationId,
          assetKey,
          url: selected.url,
          storageKey: selected.storageKey,
          role: 'thumbnail',
          label: 'AI thumbnail',
          mimeType: selected.mimeType ?? null,
          width: selected.width ?? null,
          height: selected.height ?? null,
          fileSize: selected.fileSize ?? null,
          metadata: { source: 'thumbnail_generation' },
        },
        update: {
          url: selected.url,
          storageKey: selected.storageKey,
          mimeType: selected.mimeType ?? null,
          width: selected.width ?? null,
          height: selected.height ?? null,
          fileSize: selected.fileSize ?? null,
          isDeleted: false,
          deletedAt: null,
        },
        select: { id: true },
      });
      const selection = await tx.contentWorkspaceThumbnailSelection.create({
        data: {
          organizationId,
          contentWorkspaceId: contentWorkspaceId,
          contentAssetId: asset.id,
          sourceThumbnailGenerationId: id,
          sourceThumbnailCandidateId: candidate?.id ?? null,
        },
        select: { id: true },
      });
      await tx.contentWorkspace.updateMany({
        where: { id: contentWorkspaceId, organizationId, isDeleted: false },
        data: { currentThumbnailSelectionId: selection.id },
      });
    }
    await tx.thumbnailGeneration.updateMany({
      where: { id, organizationId, isDeleted: false },
      data: {
        status: 'succeeded',
        phase: 'applied',
        selectedUrl: selected?.url ?? null,
      },
    });
  });
}

export async function cancelDirectGeneration(
  prisma: PrismaService,
  input: {
    organizationId: string;
    generationId: string;
    reason: string;
    actorUserId?: string | null;
    payload?: unknown | null;
  },
): Promise<{
  status: 'cancelled' | 'already_terminal' | 'not_found';
  generationId: string;
  preserved: boolean;
}> {
  return prisma.$transaction(async (tx) => {
    const current = await lockThumbnailGeneration(
      tx,
      input.generationId,
      input.organizationId,
    );
    if (!current) {
      return {
        status: 'not_found' as const,
        generationId: input.generationId,
        preserved: false,
      };
    }
    if (!['pending', 'running'].includes(current.status)) {
      return {
        status: 'already_terminal' as const,
        generationId: current.id,
        preserved: current.status === 'succeeded' || current.phase === 'applied',
      };
    }

    await tx.thumbnailGeneration.update({
      where: { id: current.id },
      data: {
        status: 'cancelled',
        phase: null,
        errorMessage: input.reason,
      },
    });
    await tx.aiDirectJob.updateMany({
      where: {
        organizationId: input.organizationId,
        sourceResourceId: current.id,
        jobType: { in: ['thumbnail_generate', 'thumbnail_reedit'] },
        status: { in: ['held', 'pending', 'running', 'projecting'] },
      },
      data: {
        status: 'cancelled',
        finishedAt: new Date(),
        leaseExpiresAt: null,
        lastErrorCode: 'user_cancelled',
        lastErrorMessage: input.reason,
      },
    });
    await tx.thumbnailGenerationEvent.create({
      data: {
        organizationId: input.organizationId,
        generationId: current.id,
        eventType: 'status_change',
        fromStatus: current.status,
        toStatus: 'cancelled',
        fromPhase: current.phase,
        toPhase: null,
        attemptNumber: current.attemptCount,
        actorUserId: input.actorUserId ?? null,
        payload: input.payload == null ? undefined : input.payload as Prisma.InputJsonValue,
      },
    });
    if (current.phase !== null) {
      await tx.thumbnailGenerationEvent.create({
        data: {
          organizationId: input.organizationId,
          generationId: current.id,
          eventType: 'phase_change',
          fromStatus: current.status,
          toStatus: 'cancelled',
          fromPhase: current.phase,
          toPhase: null,
          attemptNumber: current.attemptCount,
          actorUserId: input.actorUserId ?? null,
          payload: input.payload == null ? undefined : input.payload as Prisma.InputJsonValue,
        },
      });
    }
    return {
      status: 'cancelled' as const,
      generationId: current.id,
      preserved: false,
    };
  });
}

export async function deleteGeneration(prisma: PrismaService, id: string, organizationId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await lockThumbnailGeneration(tx, id, organizationId);
    if (!current) return;
    await assertThumbnailProvenanceMutable(tx, {
      organizationId,
      generationId: id,
    });
    await tx.thumbnailGeneration.updateMany({
      where: { id, organizationId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });
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
    candidateUrl: string;
  },
): Promise<{ generationDeleted: boolean; remaining: number } | null> {
  const { id, organizationId, candidateUrl } = args;
  return prisma.$transaction(async (tx) => {
    const generation = await lockThumbnailGeneration(tx, id, organizationId);
    if (!generation) return null;
    const candidate = await lockThumbnailCandidateByUrl(tx, {
      generationId: id,
      organizationId,
      candidateUrl,
    });
    if (!candidate) return null;
    await assertThumbnailProvenanceMutable(tx, {
      organizationId,
      generationId: id,
      candidateId: candidate.id,
    });
    await tx.thumbnailGenerationCandidate.deleteMany({
      where: { id: candidate.id, generationId: id, organizationId },
    });
    const remaining = await tx.thumbnailGenerationCandidate.count({
      where: { generationId: id, organizationId },
    });
    if (remaining === 0) {
      await tx.thumbnailGeneration.updateMany({
        where: { id, organizationId, isDeleted: false },
        data: { selectedUrl: null, isDeleted: true, deletedAt: new Date() },
      });
      return { generationDeleted: true, remaining };
    }
    if (generation.selectedUrl === candidate.url) {
      await tx.thumbnailGeneration.updateMany({
        where: { id, organizationId, isDeleted: false },
        data: { selectedUrl: null },
      });
    }
    return { generationDeleted: false, remaining };
  });
}

/**
 * Reset a finished generation back to pending and clear its candidates so the
 * background scheduler can reprocess. `inputMeta` is replaced with a minimal
 * re-edit pointer; the prior context is no longer needed because the next
 * `processEditJob` rebuilds it from fresh workspace analysis.
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
    const current = await lockThumbnailGeneration(tx, id, organizationId);
    if (!current) return null;
    await assertThumbnailProvenanceMutable(tx, {
      organizationId,
      generationId: id,
    });
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
    const current = await lockThumbnailGeneration(tx, id, organizationId);
    if (!current) return null;
    if (!['pending', 'running'].includes(current.status)) return null;
    await assertThumbnailProvenanceMutable(tx, {
      organizationId,
      generationId: id,
    });
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
    const current = await lockThumbnailGeneration(tx, generationId, organizationId);
    if (!current) return null;
    if (current.status !== 'running') return null;
    await assertThumbnailProvenanceMutable(tx, {
      organizationId,
      generationId,
    });
    await tx.thumbnailGenerationCandidate.deleteMany({
      where: { generationId, organizationId },
    });
    await tx.thumbnailGenerationInputImage.deleteMany({
      where: { generationId, organizationId },
    });
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
      where: {
        id: generationId,
        organizationId,
        isDeleted: false,
        status: 'running',
      },
      data: {
        status: 'succeeded',
        phase: 'ready',
        selectedUrl: null,
        errorMessage: null,
        inputMeta,
        editAnalysis: editAnalysis ? (editAnalysis as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
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
    const current = await lockThumbnailGeneration(tx, generationId, organizationId);
    if (!current) return null;
    if (current.status !== 'running') return null;
    await assertThumbnailProvenanceMutable(tx, {
      organizationId,
      generationId,
    });
    await tx.thumbnailGenerationCandidate.deleteMany({
      where: { generationId, organizationId },
    });
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
      where: {
        id: generationId,
        organizationId,
        isDeleted: false,
        status: 'running',
      },
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
  prisma: Prisma.TransactionClient | PrismaService,
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
    const current = await lockThumbnailGeneration(tx, id, organizationId);
    if (!current) return null;
    if (current.status !== 'running') return null;
    await assertThumbnailProvenanceMutable(tx, {
      organizationId,
      generationId: id,
    });
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
  });
}
