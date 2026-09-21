import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** Shared noncycling allocator for source products and channel options. Gaps are allowed. */
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
