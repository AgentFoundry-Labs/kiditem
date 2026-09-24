import { Prisma } from '@prisma/client';
import { KiditemConflictError, KiditemNotFoundError } from '@kiditem/shared/errors';
import { allocateKidItemCode } from '../../../../common/kid-item-code';
import { planKidIssue } from '../../../domain/sales-product/sales-product-code';
import { SalesProductStatusError, statusAfterKidIssued } from '../../../domain/sales-product/sales-product-status';
import type { SalesProductStatus } from '@kiditem/shared/sales-product';

/**
 * KID 발급의 유일한 쓰기 자리(KID-310). 판매상품 줄을 잠그고, 비어 있는 상품 · 단품 코드만
 * 채운다 — 이미 있는 번호는 그대로 둬서 같은 상품을 두 번 불러도 결과가 같다. 상품 코드를
 * 채우는 순간 초안은 `active` 가 된다(KID-313) — 코드와 상태가 같은 문장에서 바뀐다.
 *
 * 부르는 곳은 정확히 셋이다: 그 상품의 첫 등록 설정을 만들 때, 등록 설정 없이 몰 엑셀 파일을
 * 만들 때, 직접 작성한 상품을 만들 때. 사방넷 이관은 품번코드를 그대로 쓴다.
 */
export async function ensureSalesProductCodesInTransaction(
  tx: Prisma.TransactionClient,
  organizationId: string,
  salesProductId: string,
  readMasterProductCodes: (masterProductIds: readonly string[]) => Promise<ReadonlyMap<string, string>>,
): Promise<{ code: string; issued: number }> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM sales_products
    WHERE id = ${salesProductId}::uuid AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `);
  if (locked.length !== 1) throw new KiditemNotFoundError('CHANNELS_SALES_PRODUCT_NOT_FOUND');
  const product = await tx.salesProduct.findFirstOrThrow({
    where: { id: salesProductId, organizationId },
    select: {
      name: true,
      code: true,
      status: true,
      options: {
        where: { supplyStatus: { not: 'unused' } },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          optionCode: true,
          components: { select: { masterProductId: true, quantity: true } },
        },
      },
    },
  });
  const pending = product.options.filter((option) => option.optionCode === null);
  const masterProductCodes = pending.length === 0
    ? new Map<string, string>()
    : await readMasterProductCodes([...new Set(pending.flatMap((option) =>
      option.components.map((component) => component.masterProductId)))]);
  const plan = planKidIssue({ code: product.code, options: product.options, masterProductCodes });
  if (!plan.product && plan.optionIds.length === 0 && Object.keys(plan.reuse).length === 0) {
    return { code: product.code!, issued: 0 };
  }
  const code = plan.product ? await allocateKidItemCode(tx) : product.code!;
  if (plan.product) {
    await tx.salesProduct.update({
      where: { id: salesProductId, organizationId },
      data: {
        code,
        status: issuedStatus(product.name, product.status as SalesProductStatus),
        version: { increment: 1 },
      },
    });
  }
  let issued = plan.product ? 1 : 0;
  for (const [optionId, sourceCode] of Object.entries(plan.reuse) as [string, string][]) {
    await tx.salesProductOption.update({ where: { id: optionId, organizationId }, data: { optionCode: sourceCode } });
    issued += 1;
  }
  for (const optionId of plan.optionIds) {
    await tx.salesProductOption.update({
      where: { id: optionId, organizationId },
      data: { optionCode: await allocateKidItemCode(tx) },
    });
    issued += 1;
  }
  return { code, issued };
}

function issuedStatus(name: string, status: SalesProductStatus): 'active' {
  try {
    return statusAfterKidIssued({ name, status });
  } catch (error) {
    if (error instanceof SalesProductStatusError) {
      throw new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'KID_ALREADY_ISSUED' }, cause: error });
    }
    throw error;
  }
}
