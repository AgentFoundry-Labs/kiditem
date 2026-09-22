import { ConflictException } from '@nestjs/common';
import { Prisma, type RegistrationTarget } from '@prisma/client';
import type { ResolvedRegistrationContentSelections } from '../../../../sourcing/application/port/in/registration-content-workspace.port';

/**
 * 초안 행을 다루는 공용 조각. 초안 CRUD 어댑터와 등록 울타리가 쓰는 초안 어댑터가
 * 같은 잠금·선택값 규칙을 쓰도록 한 곳에 둔다.
 */

export const ACTIVE_PREPARATION_STATUSES = ['draft', 'submitting', 'failed'] as const;

/** A candidate may initialize a registration only after its priced selling product exists. */
export async function requireCandidateSalesProduct(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceCandidateId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM sales_products
    WHERE organization_id = ${organizationId}::uuid
      AND source_candidate_id = ${sourceCandidateId}::uuid
    FOR UPDATE
  `);
  if (rows.length !== 1) {
    throw new ConflictException('수집상품 상세에서 판매가를 확인한 뒤 판매상품으로 준비해주세요.');
  }
  const product = await tx.salesProduct.findFirstOrThrow({
    where: { id: rows[0]!.id, organizationId },
    select: {
      id: true, name: true, status: true,
      options: { where: { supplyStatus: { not: 'unused' } },
        orderBy: [{ sortOrder: 'asc' }, { optionCode: 'asc' }],
        select: { id: true, salePrice: true } },
    },
  });
  if (product.status === 'archived' || product.options.length === 0
    || product.options.some(option => option.salePrice <= 0)) {
    throw new ConflictException('판매상품의 판매가와 사용할 옵션을 확인해주세요.');
  }
  return product;
}

export async function findCandidateAccountPreparation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceCandidateId: string,
  channelAccountId: string,
) {
  const rows = await tx.registrationTarget.findMany({
    where: { organizationId, sourceCandidateId, channelAccountId, archivedAt: null },
    take: 2,
  });
  if (rows.length > 1) {
    throw new ConflictException('이 쇼핑몰에 여러 판매 설정이 있습니다. 판매상품에서 사용할 설정을 선택하세요.');
  }
  return rows[0] ?? null;
}

export type OptionalSelectionKey =
  | 'selectedThumbnailUrl'
  | 'selectedThumbnailGenerationId'
  | 'selectedThumbnailGenerationCandidateId'
  | 'selectedDetailPageArtifactId'
  | 'selectedDetailPageRevisionId'
  | 'selectedDetailPageGenerationId';

export async function lockPreparation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  preparationId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id
    FROM registration_targets
    WHERE id = ${preparationId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `);
}

export function assertRegistrationIdentity(
  row: Pick<
    RegistrationTarget,
    'sourceCandidateId' | 'channelAccountId' | 'sourceContentWorkspaceId' | 'displayName'
  >,
): asserts row is typeof row & {
  sourceCandidateId: string;
  channelAccountId: string;
  sourceContentWorkspaceId: string;
  displayName: string;
} {
  if (!row.sourceCandidateId || !row.channelAccountId || !row.sourceContentWorkspaceId || !row.displayName) {
    throw new ConflictException('Preparation is missing account-scoped registration identity.');
  }
}

export function selectionResolutionInput(
  organizationId: string,
  sourceWorkspaceId: string,
  selections: Partial<Record<OptionalSelectionKey, string | null | undefined>>,
) {
  return {
    organizationId,
    sourceWorkspaceId,
    selectedThumbnailUrl: selections.selectedThumbnailUrl ?? null,
    selectedThumbnailGenerationId: selections.selectedThumbnailGenerationId ?? null,
    selectedThumbnailGenerationCandidateId:
      selections.selectedThumbnailGenerationCandidateId ?? null,
    selectedDetailPageArtifactId: selections.selectedDetailPageArtifactId ?? null,
    selectedDetailPageRevisionId: selections.selectedDetailPageRevisionId ?? null,
    selectedDetailPageGenerationId: selections.selectedDetailPageGenerationId ?? null,
  };
}

export function resolvedSelectionData(
  resolved: ResolvedRegistrationContentSelections,
): Record<OptionalSelectionKey, string | null> {
  return {
    selectedThumbnailUrl: resolved.selectedThumbnailUrl,
    selectedThumbnailGenerationId: resolved.selectedThumbnailGenerationId,
    selectedThumbnailGenerationCandidateId:
      resolved.selectedThumbnailGenerationCandidateId,
    selectedDetailPageArtifactId: resolved.selectedDetailPageArtifactId,
    selectedDetailPageRevisionId: resolved.selectedDetailPageRevisionId,
    selectedDetailPageGenerationId: resolved.selectedDetailPageGenerationId,
  };
}

export function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002');
}
