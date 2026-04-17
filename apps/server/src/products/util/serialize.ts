// apps/server/src/products/util/serialize.ts
import { Prisma } from '@prisma/client';

/**
 * Prisma row (with Decimal / Date / JsonValue) -> plain JSON-serializable shape.
 * Use at controller response boundary before Zod parse.
 */
export function toSerializable(row: unknown): unknown {
  if (row === null || row === undefined) return row;
  if (row instanceof Date) return row.toISOString();
  if (Prisma.Decimal.isDecimal(row)) return (row as Prisma.Decimal).toNumber();
  if (Array.isArray(row)) return row.map(toSerializable);
  if (typeof row === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      out[k] = toSerializable(v);
    }
    return out;
  }
  return row;
}
