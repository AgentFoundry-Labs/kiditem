import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Shared noncycling allocator for source products and channel options. Gaps are allowed.
 *
 * Stays in `common/` rather than moving to either owner: Channels (e.g.
 * `channels/adapter/out/persistence/sales-product-code-rows.ts`) and Products
 * (`products/adapter/out/persistence/product-source-publication.repository.adapter.ts:216`)
 * both allocate from the same `kid_item_code_seq` database sequence, so a
 * single global allocator is the correct owner-neutral shape — splitting it
 * per owner would risk two sequences or a cross-owner call for one raw query.
 */
export async function allocateKidItemCode(tx: Prisma.TransactionClient): Promise<string> {
  let rows: Array<{ value: bigint }>;
  try {
    rows = await tx.$queryRaw<Array<{ value: bigint }>>`
      -- queryraw-tenancy-exempt: global identifier sequence, no organization data is read.
      SELECT nextval('kid_item_code_seq'::regclass) AS value
    `;
  } catch (error) {
    // 시퀀스가 없으면 발급할 수 없다 — 부르는 트랜잭션이 통째로 되돌아가 코드 없는 판매 상품이 남지
    // 않는다. 데이터 마이그레이션의 ensure 단계(`ensure:kid_item_code_sequence`)가 만든다(KID-313).
    if (isMissingSequence(error)) throw new ServiceUnavailableException('kid_item_code_sequence_missing');
    throw error;
  }
  const value = Number(rows[0]?.value);
  if (!Number.isSafeInteger(value) || value < 1 || value > 99_999_999) {
    throw new ConflictException('KID item code sequence is exhausted or invalid');
  }
  return `KID${value.toString().padStart(8, '0')}`;
}

/** `nextval` 이 없는 시퀀스를 만났다(Postgres 42P01). */
function isMissingSequence(error: unknown): boolean {
  const text = error instanceof Error ? error.message : '';
  return text.includes('42P01') && text.includes('kid_item_code_seq');
}
