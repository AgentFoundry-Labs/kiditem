import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type RegistrationTarget } from '@prisma/client';
import {
  SalesProductDraftError,
  requireConfirmedPrice,
} from '../../../domain/sales-product/sales-product-draft';
import type { SalesProductStatus } from '@kiditem/shared/sales-product';

/**
 * 등록 설정 행을 다루는 공용 조각. 등록 상태 리더와 등록 울타리가 쓰는 설정 어댑터가 같은
 * 잠금 · 선택값 규칙을 쓰도록 한 곳에 둔다.
 */

export interface ConfirmedSalesProduct {
  id: string;
  name: string;
  sourceRecordId: string | null;
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
      id: true, name: true, status: true, sourceRecordId: true,
      options: { where: { supplyStatus: { not: 'unused' } },
        orderBy: [{ sortOrder: 'asc' }, { optionCode: 'asc' }],
        select: { id: true, salePrice: true, supplyStatus: true } },
    },
  });
  try {
    return {
      id: product.id,
      name: product.name,
      sourceRecordId: product.sourceRecordId,
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

export async function findAccountPreparation(
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
 * 등록 설정의 정체성은 상품과 계정이다. 이름은 설정이 갖지 않는다 — 판매 상품 이름이다(KID-313 W2).
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
