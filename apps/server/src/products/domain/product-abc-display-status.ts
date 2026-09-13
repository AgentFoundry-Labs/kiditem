import type { ProductAbcDisplayStatus } from '@kiditem/shared/product-abc';
import { businessDateKey, evidenceCutoffDate } from '../../common/kst';

/** Display labels consume owner-derived readiness; they never publish grades. */
export function productAbcDisplayStatus(
  hasEvaluation: boolean,
  mappingValid: boolean,
  status: {
    sellpia: { ready: boolean };
    advertising: { ready: boolean };
  },
): ProductAbcDisplayStatus {
  if (!mappingValid) return 'SOURCE_UNMAPPED';
  if (!status.sellpia.ready) return 'SELLPIA_SOURCE_STALE';
  if (!status.advertising.ready) return 'AD_SOURCE_STALE';
  // A product the evaluation has not graded is one still gathering evidence,
  // whether because it is young or because its months are short. Both wait.
  return hasEvaluation ? 'READY' : 'INSUFFICIENT_EVIDENCE';
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
  return businessDateKey(evidenceCutoffDate(now));
}
