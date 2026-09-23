import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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
    if (isMissingKidItemCodeSequence(error)) throw new ServiceUnavailableException('kid_item_code_sequence_missing');
    throw error;
  }
  const value = Number(rows[0]?.value);
  if (!Number.isSafeInteger(value) || value < 1 || value > 99_999_999) {
    throw new ConflictException('KID item code sequence is exhausted or invalid');
  }
  return `KID${value.toString().padStart(8, '0')}`;
}

/**
 * `nextval` 이 없는 시퀀스를 만났다. 날것 질의 실패(P2010)의 드라이버 원인이 Postgres 42P01 이고 그
 * 관계가 `kid_item_code_seq` 일 때만이다 — 문장은 드라이버마다 바뀌므로 보지 않는다.
 */
export function isMissingKidItemCodeSequence(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2010') return false;
  const cause = (error.meta?.driverAdapterError as { cause?: { originalCode?: unknown; table?: unknown } } | undefined)?.cause;
  return cause?.originalCode === '42P01' && cause.table === 'kid_item_code_seq';
}
