import { Prisma } from '@prisma/client';

export type AttemptRecency = Readonly<{
  observedAt: Date | number | bigint | null;
  importedAt: Date | null;
  id: string;
}>;

function compareDescending(
  left: Date | number | bigint | null,
  right: Date | number | bigint | null,
): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;
  if (leftValue === rightValue) return 0;
  return leftValue > rightValue ? -1 : 1;
}

/** Compares attempts in the canonical newest-first order. */
export function compareAttemptsNewestFirst(
  left: AttemptRecency,
  right: AttemptRecency,
): number {
  return (
    compareDescending(left.observedAt, right.observedAt) ||
    compareDescending(left.importedAt, right.importedAt) ||
    right.id.localeCompare(left.id)
  );
}

/** Returns whether a candidate supersedes the currently selected attempt. */
export function isNewerAttempt(
  candidate: AttemptRecency,
  current: AttemptRecency,
): boolean {
  return compareAttemptsNewestFirst(candidate, current) < 0;
}

/** Canonical SQL ordering after a caller's `DISTINCT ON` partition columns. */
export function currentRowTieBreakSql(columns: {
  businessDate: Prisma.Sql;
  observedAt: Prisma.Sql;
  updatedAt: Prisma.Sql;
  id: Prisma.Sql;
}): Prisma.Sql {
  return Prisma.sql`
    ${columns.businessDate} DESC,
    ${columns.observedAt} DESC NULLS LAST,
    ${columns.updatedAt} DESC NULLS LAST,
    ${columns.id} DESC
  `;
}
