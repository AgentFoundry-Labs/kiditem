import type { ProductAbcDisplayStatus } from '@kiditem/shared/product-abc';

/** Display labels consume owner-derived readiness; they never publish grades. */
export function productAbcDisplayStatus(
  hasEvaluation: boolean,
  mappingValid: boolean,
  status: {
    sellpia: { status: string };
    advertising: { status: string };
    formulaState: { publishedAt: string | Date | null };
  },
  createdAt: string | Date,
): ProductAbcDisplayStatus {
  if (!mappingValid) return 'SOURCE_UNMAPPED';
  if (status.sellpia.status !== 'READY') return 'SELLPIA_SOURCE_STALE';
  if (status.advertising.status !== 'READY') return 'AD_SOURCE_STALE';
  if (hasEvaluation) return 'READY';
  if (status.formulaState.publishedAt
    && new Date(createdAt) > new Date(status.formulaState.publishedAt)) return 'NEW';
  return 'INSUFFICIENT_EVIDENCE';
}
