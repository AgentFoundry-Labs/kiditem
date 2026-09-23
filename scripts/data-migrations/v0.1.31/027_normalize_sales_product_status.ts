import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

const CONTRACT_STATUSES = ['draft', 'active', 'archived'];
/** KID-313 이전 사방넷 어휘(대기중 · 일시중지 · 완전품절 · 미사용)와 지금 계약 값. 이 밖의 값은 멈춘다. */
const KNOWN_STATUSES = [...CONTRACT_STATUSES, 'paused', 'sold_out', 'unused'];

/**
 * 판매 상품 상태를 KID-313 의 세 값(`draft` · `active` · `archived`)으로 옮긴다. 규칙은
 * `code IS NULL ⇔ status = 'draft'` 하나다.
 *
 * 1. 코드가 없는 행은 무엇이었든 초안이다 — 보관도 코드를 지닌 판매 상품만 한다.
 * 2. 코드가 있는 `unused`(사방넷 미사용)는 보관이다.
 * 3. 코드가 있는 `draft` · `paused` · `sold_out` 은 판매 상품(`active`)이다. 품절 · 일시중지는
 *    상품 상태가 아니라 단품 공급 상태가 말한다.
 *
 * 조직을 가리지 않고 모든 행을 한 번에 옮기며, 다시 돌리면 바꿀 것이 없다.
 */
export async function normalizeSalesProductStatus(tx: Prisma.TransactionClient): Promise<MigrationResult> {
  const unknown = await tx.salesProduct.groupBy({
    by: ['status'],
    where: { status: { notIn: KNOWN_STATUSES } },
    _count: { _all: true },
  });
  if (unknown.length > 0) {
    const values = unknown.map((row) => `${row.status}(${row._count._all})`).join(', ');
    throw new Error(`Unknown sales product status blocks normalization: ${values}`);
  }
  const codeless = await tx.salesProduct.updateMany({
    where: { code: null, status: { not: 'draft' } },
    data: { status: 'draft' },
  });
  const unused = await tx.salesProduct.updateMany({
    where: { code: { not: null }, status: 'unused' },
    data: { status: 'archived' },
  });
  const coded = await tx.salesProduct.updateMany({
    where: { code: { not: null }, status: { in: ['draft', 'paused', 'sold_out'] } },
    data: { status: 'active' },
  });
  return {
    affectedRows: codeless.count + unused.count + coded.count,
    details: { codelessToDraft: codeless.count, unusedToArchived: unused.count, codedToActive: coded.count },
  };
}

export const normalizeSalesProductStatusMigration: DataMigration = {
  id: 'v0.1.31:027_normalize_sales_product_status',
  releaseVersion: '0.1.31',
  name: 'Normalize sales product status to draft, active and archived',
  phase: 'post-schema',
  run: normalizeSalesProductStatus,
};
