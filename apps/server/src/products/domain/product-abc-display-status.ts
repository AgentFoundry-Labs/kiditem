import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  productAbcSaleAgeDays,
  type ProductAbcDisplayStatus,
} from '@kiditem/shared/product-abc';

/** Display labels consume owner-derived readiness; they never publish grades. */
export function productAbcDisplayStatus(
  hasEvaluation: boolean,
  mappingValid: boolean,
  status: {
    sellpia: { status: string };
    advertising: { status: string };
    actualCutoff: string | null;
  },
  saleStartDate: string | null,
): ProductAbcDisplayStatus {
  if (!mappingValid) return 'SOURCE_UNMAPPED';
  if (status.sellpia.status !== 'READY') return 'SELLPIA_SOURCE_STALE';
  if (status.advertising.status !== 'READY') return 'AD_SOURCE_STALE';
  if (hasEvaluation) return 'READY';
  const saleAge = productAbcSaleAgeDays(saleStartDate, status.actualCutoff);
  if (saleAge !== null && saleAge < PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.minimumSaleAgeDays) {
    return 'NEW';
  }
  return 'INSUFFICIENT_EVIDENCE';
}

/**
 * The evidence cutoff every ABC read asks its sources for: the latest closed
 * KST business day.
 *
 * Products owns this because "is this source fresh enough" must not depend on
 * which screen asked. Readers that picked their own cutoff could report the
 * same product `READY` on one screen and `SELLPIA_SOURCE_STALE` on another at
 * the same instant (ADR 0002).
 */
export function productAbcEvidenceCutoff(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  return new Date(Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate() - 1,
  )).toISOString().slice(0, 10);
}
