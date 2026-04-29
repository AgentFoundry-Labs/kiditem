/**
 * Pure SKU formatter for `ProductOption`.
 *
 * Format: `<masterCode>-NN` where `NN` is the post-increment `optionCounter`
 * zero-padded to 2 digits. Plan B1 spec accepts gap-tolerant numbering — the
 * counter increments even when downstream creation fails — so callers must
 * pass the value they read AFTER the atomic increment, not before.
 *
 * Holds no Prisma dependency so the rule is unit-testable without a DB.
 */
export function buildOptionSku(masterCode: string, optionCounter: number): string {
  return `${masterCode}-${String(optionCounter).padStart(2, '0')}`;
}
