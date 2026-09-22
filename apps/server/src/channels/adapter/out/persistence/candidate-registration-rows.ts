import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type RegistrationTarget } from '@prisma/client';
import {
  SalesProductDraftError,
  requireConfirmedPrice,
} from '../../../domain/sales-product/sales-product-draft';
import {
  SelectedThumbnailError,
  assertSelectedThumbnailAllowed,
} from '../../../domain/registration/selected-thumbnail';
import type { SalesProductStatus } from '@kiditem/shared/sales-product';
import type { ResolvedRegistrationContentSelections } from '../../../../ai/application/port/in/workspace/registration-content-workspace.port';

/**
 * 초안 행을 다루는 공용 조각. 초안 CRUD 어댑터와 등록 울타리가 쓰는 초안 어댑터가
 * 같은 잠금·선택값 규칙을 쓰도록 한 곳에 둔다.
 */

export const ACTIVE_PREPARATION_STATUSES = ['draft', 'submitting', 'failed'] as const;

export interface ConfirmedSalesProduct {
  id: string;
  name: string;
  sourceCandidateId: string | null;
  options: { id: string; salePrice: number }[];
}

/**
 * 등록 준비가 쓰는 단일 가격 게이트. 판매상품 줄을 잠그고 초안(판매가 미정)이면 거절한다.
 * 몰 엑셀 · 품절 송신도 같은 도메인 함수(`requireConfirmedPrice`)를 쓴다.
 */
export async function lockSalesProduct(
  tx: Prisma.TransactionClient,
  organizationId: string,
  salesProductId: string,
): Promise<void> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM sales_products
    WHERE organization_id = ${organizationId}::uuid
      AND id = ${salesProductId}::uuid
    FOR UPDATE
  `);
  if (locked.length !== 1) throw new NotFoundException('판매상품을 찾지 못했습니다.');
}

export async function requireConfirmedSalesProduct(
  tx: Prisma.TransactionClient,
  organizationId: string,
  salesProductId: string,
): Promise<ConfirmedSalesProduct> {
  await lockSalesProduct(tx, organizationId, salesProductId);
  const product = await tx.salesProduct.findFirstOrThrow({
    where: { id: salesProductId, organizationId },
    select: {
      id: true, name: true, status: true, sourceCandidateId: true,
      options: { where: { supplyStatus: { not: 'unused' } },
        orderBy: [{ sortOrder: 'asc' }, { optionCode: 'asc' }],
        select: { id: true, salePrice: true, supplyStatus: true } },
    },
  });
  try {
    return {
      id: product.id,
      name: product.name,
      sourceCandidateId: product.sourceCandidateId,
      options: requireConfirmedPrice({
        name: product.name,
        status: product.status as SalesProductStatus,
        options: product.options.map((option) => ({
          id: option.id,
          supplyStatus: option.supplyStatus as 'selling' | 'sold_out' | 'unused',
          salePrice: option.salePrice,
        })),
      }),
    };
  } catch (error) {
    if (error instanceof SalesProductDraftError) throw new ConflictException(error.message);
    throw error;
  }
}

/** 원천 기록(후보)에서 만든 초안. 후보당 초안은 하나다. */
export async function requireConfirmedProductForCandidate(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceCandidateId: string,
): Promise<ConfirmedSalesProduct> {
  const product = await tx.salesProduct.findFirst({
    where: { organizationId, sourceCandidateId },
    select: { id: true },
  });
  if (!product) {
    throw new ConflictException('이 수집상품의 판매상품이 없습니다. 판매상품을 먼저 만들어주세요.');
  }
  return requireConfirmedSalesProduct(tx, organizationId, product.id);
}

export async function findCandidateAccountPreparation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  salesProductId: string,
  channelAccountId: string,
) {
  const rows = await tx.registrationTarget.findMany({
    where: { organizationId, salesProductId, channelAccountId, archivedAt: null },
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

/**
 * 등록 설정의 정체성은 상품과 계정이다.
 *
 * 표시명은 정체성이 아니라 덮어쓰기다 — 비어 있으면 판매상품 이름을 쓴다. 설정을 찾거나
 * 만드는 길(`registration-targets/resolve`)은 이름을 주지 않으므로 이름을 요구하면 그 길로 만든
 * 설정이 제출 동결에서 통째로 막힌다.
 */
export function assertRegistrationIdentity(
  row: Pick<RegistrationTarget, 'salesProductId' | 'channelAccountId'>,
): asserts row is typeof row & {
  salesProductId: string;
  channelAccountId: string;
} {
  if (!row.salesProductId || !row.channelAccountId) {
    throw new ConflictException('Preparation is missing account-scoped registration identity.');
  }
}

/**
 * 고른 대표 사진이 이 판매상품의 것인지 본다(KID-310).
 *
 * AI 는 id 를 가진 선택만 자기 작업공간 소유인지 확인한다 — 맨 주소(`selectedThumbnailUrl`)는
 * 초안이 든 사진인지 알 방법이 없어 그대로 채택한다. 초안의 사진 목록은 Channels 것이므로
 * 여기서 막는다. 초안 편집과 제출 동결이 같은 허용 목록을 쓴다.
 */
export async function assertThumbnailBelongsToProduct(
  reader: Pick<Prisma.TransactionClient, 'salesProduct'>,
  thumbnailSources: { listGeneratedThumbnailUrls(organizationId: string, salesProductId: string): Promise<string[]> } | undefined,
  organizationId: string,
  salesProductId: string,
  selectedThumbnailUrl: string | null | undefined,
): Promise<void> {
  if (!selectedThumbnailUrl || !thumbnailSources) return;
  const [product, generated] = await Promise.all([
    reader.salesProduct.findFirst({
      where: { id: salesProductId, organizationId },
      select: { imageUrls: true },
    }),
    thumbnailSources.listGeneratedThumbnailUrls(organizationId, salesProductId),
  ]);
  try {
    assertSelectedThumbnailAllowed(selectedThumbnailUrl, [...(product?.imageUrls ?? []), ...generated]);
  } catch (error) {
    if (error instanceof SelectedThumbnailError) throw new BadRequestException(error.message);
    throw error;
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
