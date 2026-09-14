import { businessDateKey, evidenceCutoffDate } from '../../common/kst';

/**
 * The evidence cutoff every ABC read asks its sources for: the latest closed
 * KST business day.
 *
 * Products owns this because "is this source fresh enough" must not depend on
 * which screen asked. Readers that picked their own cutoff could report the
 * same product `READY` on one screen and `SELLPIA_SOURCE_STALE` on another at
 * the same instant (ADR 0002). The display word is derived from the published
 * facts by the shared `productAbcDisplayStatus`.
 */
export function productAbcEvidenceCutoff(now: Date): string {
  return businessDateKey(evidenceCutoffDate(now));
}
