import { ConflictException } from '@nestjs/common';
import { Prisma, type ProductPreparation } from '@prisma/client';
import type { ResolvedRegistrationContentSelections } from '../../../application/port/out/cross-domain/registration-content-workspace.port';

/**
 * 초안 행을 다루는 공용 조각. 초안 CRUD 어댑터와 등록 울타리가 쓰는 초안 어댑터가
 * 같은 잠금·선택값 규칙을 쓰도록 한 곳에 둔다.
 */

export const ACTIVE_PREPARATION_STATUSES = ['draft', 'submitting', 'failed'] as const;

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
    FROM product_preparations
    WHERE id = ${preparationId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `);
}

export async function lockCandidate(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceCandidateId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id
    FROM sourcing_candidates
    WHERE id = ${sourceCandidateId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `);
}

export async function assertActiveCandidate(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceCandidateId: string,
): Promise<void> {
  const candidate = await tx.sourcingCandidate.findFirst({
    where: {
      id: sourceCandidateId,
      organizationId,
      status: 'sourced',
      isDeleted: false,
    },
    select: { id: true },
  });
  if (!candidate) {
    throw new ConflictException('Source candidate is not active for registration.');
  }
}

export function assertRegistrationIdentity(
  row: Pick<
    ProductPreparation,
    'sourceCandidateId' | 'channelAccountId' | 'sourceContentWorkspaceId'
  >,
): asserts row is typeof row & {
  sourceCandidateId: string;
  channelAccountId: string;
  sourceContentWorkspaceId: string;
} {
  if (!row.sourceCandidateId || !row.channelAccountId || !row.sourceContentWorkspaceId) {
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
