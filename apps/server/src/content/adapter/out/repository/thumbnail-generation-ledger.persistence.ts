import { randomUUID } from 'node:crypto';
import { KiditemConflictError } from '@kiditem/shared/errors';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { ThumbnailEditorCandidate } from '../../../domain/model/thumbnail-editor';
import { thumbnailCandidateAssetKey } from '../../../domain/content-asset-key';
import { readThumbnailJobInputs, withThumbnailJobInputs } from '../../../domain/thumbnail/thumbnail-job-input-meta';
import type { ThumbnailJobRow } from '../../../application/port/out/repository/thumbnail-generation-ledger.repository.port';

/**
 * Tenant-scoped writers for the thumbnail job (`thumbnail_generations`) and its
 * AI candidate assets (`content_assets.thumbnail_generation_id`, KID-313 W3a).
 * Every function binds the organization scope on every write. A job whose
 * candidate is a workspace's representative image is not rewritten.
 */

export const thumbnailJobSelect = {
  id: true,
  contentWorkspaceId: true,
  status: true,
  method: true,
  prompt: true,
  inputMeta: true,
  errorMessage: true,
  attemptCount: true,
  triggeredByUserId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ThumbnailGenerationSelect;

interface LockedThumbnailJob {
  id: string;
  contentWorkspaceId: string;
  status: string;
  attemptCount: number;
  inputMeta: unknown;
}

async function lockThumbnailJob(
  tx: Prisma.TransactionClient,
  id: string,
  organizationId: string,
): Promise<LockedThumbnailJob | null> {
  const rows = await tx.$queryRaw<LockedThumbnailJob[]>(Prisma.sql`
    SELECT
      id,
      content_workspace_id AS "contentWorkspaceId",
      status,
      attempt_count AS "attemptCount",
      input_meta AS "inputMeta"
    FROM thumbnail_generations
    WHERE id = ${id}::uuid
      AND organization_id = ${organizationId}::uuid
      AND is_deleted = false
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

/**
 * 이 job 의 후보가 워크스페이스의 대표이미지로 채택돼 있으면 job 과 후보를 바꿀 수 없다. 후보 자산 행을 먼저
 * 잠가 같은 자산을 잠그는 채택(`setCurrentThumbnail`)과 차례를 세운다 — 채택이 먼저면 여기서 409, 이쪽이
 * 먼저면 채택이 지워진 자산을 만나 400 이다.
 */
async function assertCandidatesNotAdopted(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; generationId: string; assetId?: string },
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id
    FROM content_assets
    WHERE organization_id = ${input.organizationId}::uuid
      AND thumbnail_generation_id = ${input.generationId}::uuid
      AND is_deleted = false
    ORDER BY id
    FOR UPDATE
  `);
  const adopted = await tx.contentWorkspace.findFirst({
    where: {
      organizationId: input.organizationId,
      isDeleted: false,
      currentThumbnailAsset: {
        is: {
          organizationId: input.organizationId,
          thumbnailGenerationId: input.generationId,
          ...(input.assetId ? { id: input.assetId } : {}),
        },
      },
    },
    select: { id: true },
  });
  if (adopted) {
    throw new KiditemConflictError('CONTENT_ASSET_IN_USE', { details: { reason: 'ADOPTED_REPRESENTATIVE_IMAGE' } });
  }
}

async function replaceCandidateAssets(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    generationId: string;
    contentWorkspaceId: string;
    createdByUserId: string | null;
    candidates: ThumbnailEditorCandidate[];
  },
): Promise<void> {
  const now = new Date();
  // 이전 시도의 후보는 지우고(soft), 새 시도의 열쇠가 같으면 되살려 쓴다.
  await tx.contentAsset.updateMany({
    where: {
      organizationId: input.organizationId,
      thumbnailGenerationId: input.generationId,
      isDeleted: false,
    },
    data: { isDeleted: true, deletedAt: now },
  });
  for (const [index, candidate] of input.candidates.entries()) {
    const assetKey = thumbnailCandidateAssetKey(input.generationId, candidate.url);
    const data = {
      url: candidate.url,
      storageKey: candidate.storageKey ?? null,
      role: 'thumbnail',
      label: candidate.filename ?? candidate.storageKey?.split('/').pop() ?? null,
      sortOrder: index,
      mimeType: candidate.mimeType ?? null,
      fileSize: candidate.fileSize ?? null,
      isDeleted: false,
      deletedAt: null,
    };
    await tx.contentAsset.upsert({
      where: { organizationId_assetKey: { organizationId: input.organizationId, assetKey } },
      update: data,
      create: {
        ...data,
        organizationId: input.organizationId,
        contentWorkspaceId: input.contentWorkspaceId,
        source: 'ai',
        thumbnailGenerationId: input.generationId,
        createdByUserId: input.createdByUserId,
        assetKey,
        assetType: 'image',
      },
      select: { id: true },
    });
  }
}

function jobInputMeta(args: {
  inputMeta: unknown;
  originalUrl: string;
  editAnalysis?: Record<string, unknown> | null;
  inputImages: Parameters<typeof withThumbnailJobInputs>[1]['inputImages'];
}): Prisma.InputJsonValue {
  const meta = args.inputMeta && typeof args.inputMeta === 'object' && !Array.isArray(args.inputMeta)
    ? args.inputMeta as Record<string, unknown>
    : {};
  return withThumbnailJobInputs(meta, {
    originalUrl: args.originalUrl || null,
    editAnalysis: args.editAnalysis ?? null,
    inputImages: args.inputImages,
  }) as Prisma.InputJsonValue;
}

export async function createPendingJob(
  tx: Prisma.TransactionClient | PrismaService,
  args: {
    id?: string;
    organizationId: string;
    contentWorkspaceId: string;
    method: string;
    inputMeta: Prisma.InputJsonValue;
    triggeredByUserId?: string | null;
  },
): Promise<ThumbnailJobRow> {
  return tx.thumbnailGeneration.create({
    data: {
      ...(args.id ? { id: args.id } : {}),
      organizationId: args.organizationId,
      contentWorkspaceId: args.contentWorkspaceId,
      method: args.method,
      status: 'pending',
      inputMeta: args.inputMeta,
      triggeredByUserId: args.triggeredByUserId ?? null,
    },
    select: thumbnailJobSelect,
  });
}

/**
 * 판매 상품 초안의 작업공간(하나뿐)을 열거나 다시 쓴다. 호출자 트랜잭션 안에서도 안전하도록 유일 index 에
 * 부딪히면 넣지 않고(ON CONFLICT DO NOTHING) 이긴 쪽을 다시 읽는다. 이름은 상품에서 읽으므로 두지 않는다.
 */
export async function ensureSalesProductWorkspace(
  tx: Prisma.TransactionClient | PrismaService,
  args: { organizationId: string; salesProductId: string },
): Promise<string> {
  const where = {
    organizationId: args.organizationId,
    salesProductId: args.salesProductId,
    status: 'active',
    isDeleted: false,
  };
  const existing = await tx.contentWorkspace.findFirst({ where, select: { id: true } });
  if (existing) return existing.id;
  await tx.$executeRaw`
    INSERT INTO content_workspaces
      (id, organization_id, owner_type, sales_product_id, status, is_deleted)
    VALUES
      (${randomUUID()}::uuid, ${args.organizationId}::uuid, 'sales_product', ${args.salesProductId}::uuid, 'active', false)
    ON CONFLICT (organization_id, sales_product_id)
      WHERE sales_product_id IS NOT NULL AND status = 'active' AND is_deleted = false
    DO NOTHING`;
  return (await tx.contentWorkspace.findFirstOrThrow({ where, select: { id: true } })).id;
}

/** 단독 편집기의 job 은 자기만의 직접 작업공간을 갖는다(소싱 카드를 만들지 않는다). */
export async function createStandaloneWorkspace(
  tx: Prisma.TransactionClient | PrismaService,
  organizationId: string,
): Promise<string> {
  const created = await tx.contentWorkspace.create({
    data: {
      organizationId,
      ownerType: 'direct_detail_page',
      normalizedTitle: `standalone-thumbnail-${randomUUID()}`,
    },
    select: { id: true },
  });
  return created.id;
}

export { jobInputMeta };

export async function cancelDirectGeneration(
  prisma: PrismaService,
  input: { organizationId: string; generationId: string; reason: string },
  /** 같은 트랜잭션에서 이 생성의 살아 있는 AI job을 취소한다(실행 계약의 cancel). */
  cancelJobs: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<{
  status: 'cancelled' | 'already_terminal' | 'not_found';
  generationId: string;
  preserved: boolean;
}> {
  return prisma.$transaction(async (tx) => {
    const current = await lockThumbnailJob(tx, input.generationId, input.organizationId);
    if (!current) {
      return { status: 'not_found' as const, generationId: input.generationId, preserved: false };
    }
    if (!['pending', 'running'].includes(current.status)) {
      return {
        status: 'already_terminal' as const,
        generationId: current.id,
        preserved: current.status === 'succeeded',
      };
    }
    await tx.thumbnailGeneration.update({
      where: { id: current.id },
      data: { status: 'cancelled', errorMessage: input.reason },
    });
    await cancelJobs(tx);
    return { status: 'cancelled' as const, generationId: current.id, preserved: false };
  });
}

export async function deleteGeneration(prisma: PrismaService, id: string, organizationId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await lockThumbnailJob(tx, id, organizationId);
    if (!current) return;
    await assertCandidatesNotAdopted(tx, { organizationId, generationId: id });
    const now = new Date();
    await tx.contentAsset.updateMany({
      where: { organizationId, thumbnailGenerationId: id, isDeleted: false },
      data: { isDeleted: true, deletedAt: now },
    });
    await tx.thumbnailGeneration.updateMany({
      where: { id, organizationId, isDeleted: false },
      data: { isDeleted: true, deletedAt: now },
    });
  });
}

/** 후보 자산 하나를 지운다. 마지막 후보였으면 job 도 지운다. 한 트랜잭션이라 중간 상태가 새지 않는다. */
export async function removeCandidate(
  prisma: PrismaService,
  args: { id: string; organizationId: string; assetId: string },
): Promise<{ generationDeleted: boolean; remaining: number } | null> {
  const { id, organizationId, assetId } = args;
  return prisma.$transaction(async (tx) => {
    const job = await lockThumbnailJob(tx, id, organizationId);
    if (!job) return null;
    const candidate = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM content_assets
      WHERE id = ${assetId}::uuid
        AND organization_id = ${organizationId}::uuid
        AND thumbnail_generation_id = ${id}::uuid
        AND is_deleted = false
      FOR UPDATE
    `);
    if (candidate.length !== 1) return null;
    await assertCandidatesNotAdopted(tx, { organizationId, generationId: id, assetId });
    const now = new Date();
    await tx.contentAsset.updateMany({
      where: { id: assetId, organizationId, isDeleted: false },
      data: { isDeleted: true, deletedAt: now },
    });
    const remaining = await tx.contentAsset.count({
      where: { organizationId, thumbnailGenerationId: id, isDeleted: false },
    });
    if (remaining === 0) {
      await tx.thumbnailGeneration.updateMany({
        where: { id, organizationId, isDeleted: false },
        data: { isDeleted: true, deletedAt: now },
      });
      return { generationDeleted: true, remaining };
    }
    return { generationDeleted: false, remaining };
  });
}

/**
 * 끝난 job 을 pending 으로 되돌리고 후보를 지운다. 요청 필드는 재편집 표시로 바꾸되, 입력 사진 · 원본 URL ·
 * 편집 분석은 `input_meta` 에 남겨 재편집이 그것을 다시 읽는다.
 */
export async function resetGenerationForReEdit(
  prisma: PrismaService,
  args: {
    id: string;
    organizationId: string;
    purpose: 'compliance' | 'quality';
    variantKey: 'auto' | 'with-box' | 'no-box' | null;
  },
): Promise<{ fromStatus: string } | null> {
  const { id, organizationId, purpose, variantKey } = args;
  return prisma.$transaction(async (tx) => {
    const current = await lockThumbnailJob(tx, id, organizationId);
    if (!current) return null;
    await assertCandidatesNotAdopted(tx, { organizationId, generationId: id });
    await tx.contentAsset.updateMany({
      where: { organizationId, thumbnailGenerationId: id, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    const inputs = readThumbnailJobInputs(current.inputMeta);
    await tx.thumbnailGeneration.updateMany({
      where: { id, organizationId, isDeleted: false },
      data: {
        status: 'pending',
        errorMessage: null,
        inputMeta: withThumbnailJobInputs(
          {
            sourceGenerationId: id,
            purpose,
            variantKey: variantKey ?? 'auto',
            productName: readMetaString(current.inputMeta, 'productName'),
          },
          inputs,
        ) as Prisma.InputJsonValue,
      },
    });
    return { fromStatus: current.status };
  });
}

/**
 * pending/running job 을 running 으로 잡고 시도 수를 올린다. 이미 끝났거나 조직 밖이면 null.
 */
export async function lockGenerationForProcessing(
  prisma: PrismaService,
  id: string,
  organizationId: string,
): Promise<{ fromStatus: string; attemptNumber: number } | null> {
  return prisma.$transaction(async (tx) => {
    const current = await lockThumbnailJob(tx, id, organizationId);
    if (!current) return null;
    if (!['pending', 'running'].includes(current.status)) return null;
    const locked = await tx.thumbnailGeneration.updateMany({
      where: { id, organizationId, isDeleted: false, status: current.status },
      data: { status: 'running', errorMessage: null, attemptCount: { increment: 1 } },
    });
    if (locked.count === 0) return null;
    return { fromStatus: current.status, attemptNumber: current.attemptCount + 1 };
  });
}

/**
 * running job 의 결과를 후보 자산으로 쓰고 succeeded 로 바꾼다 — 같은 트랜잭션이다. 잠근 뒤 상태를 다시 보므로
 * 동시에 들어온 취소를 덮지 않는다. `inputMeta` 는 바꾸려는 전체 값이다.
 */
export async function completeWithCandidates(
  prisma: PrismaService,
  args: {
    generationId: string;
    organizationId: string;
    candidates: ThumbnailEditorCandidate[];
    inputMeta: (current: unknown) => Prisma.InputJsonValue;
  },
): Promise<{ fromStatus: string; attemptNumber: number } | null> {
  const { generationId, organizationId, candidates } = args;
  return prisma.$transaction(async (tx) => {
    const current = await lockThumbnailJob(tx, generationId, organizationId);
    if (!current) return null;
    if (current.status !== 'running') return null;
    await assertCandidatesNotAdopted(tx, { organizationId, generationId });
    const owner = await tx.thumbnailGeneration.findFirstOrThrow({
      where: { id: generationId, organizationId },
      select: { triggeredByUserId: true },
    });
    await replaceCandidateAssets(tx, {
      organizationId,
      generationId,
      contentWorkspaceId: current.contentWorkspaceId,
      createdByUserId: owner.triggeredByUserId,
      candidates,
    });
    await tx.thumbnailGeneration.updateMany({
      where: { id: generationId, organizationId, isDeleted: false, status: 'running' },
      data: { status: 'succeeded', errorMessage: null, inputMeta: args.inputMeta(current.inputMeta) },
    });
    return { fromStatus: current.status, attemptNumber: current.attemptCount };
  });
}

export async function markGenerationFailed(
  prisma: PrismaService,
  id: string,
  organizationId: string,
  message: string,
): Promise<{ fromStatus: string; attemptNumber: number } | null> {
  return prisma.$transaction(async (tx) => {
    const current = await lockThumbnailJob(tx, id, organizationId);
    if (!current) return null;
    if (current.status !== 'running') return null;
    const updated = await tx.thumbnailGeneration.updateMany({
      where: { id, organizationId, isDeleted: false, status: 'running' },
      data: { status: 'failed', errorMessage: message },
    });
    if (updated.count === 0) return null;
    return { fromStatus: current.status, attemptNumber: current.attemptCount };
  });
}

function readMetaString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === 'string' && value ? value : null;
}
