import { ConflictException } from '@nestjs/common';
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
  const rows = await tx.$queryRaw<Array<{ value: bigint }>>`
    -- queryraw-tenancy-exempt: global identifier sequence, no organization data is read.
    SELECT nextval('kid_item_code_seq'::regclass) AS value
  `;
  const value = Number(rows[0]?.value);
  if (!Number.isSafeInteger(value) || value < 1 || value > 99_999_999) {
    throw new ConflictException('KID item code sequence is exhausted or invalid');
  }
  return `KID${value.toString().padStart(8, '0')}`;
}
