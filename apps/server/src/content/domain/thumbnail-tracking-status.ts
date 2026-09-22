import type { ThumbnailTrackingStatus } from '@kiditem/shared/ai';

/** The stored facts a thumbnail tracking status is derived from. */
export interface ThumbnailTrackingStatusFacts {
  markedInconclusiveAt: Date | null;
  ctrBefore: number | null;
  ctrAfter: number | null;
}

/**
 * The one thumbnail tracking status rule. The operator's 결론 없음 mark is the
 * only stored judgment; measurement follows from the CTR recorded before and
 * after the thumbnail was applied.
 *
 * | markedInconclusiveAt | ctrBefore and ctrAfter | status       |
 * |----------------------|------------------------|--------------|
 * | set                  | any                    | inconclusive |
 * | none                 | both recorded          | measured     |
 * | none                 | either missing         | tracking     |
 *
 * The mark wins over recorded CTRs, because the operator judged those numbers
 * inconclusive. The repository's status filter states this rule in SQL, and a
 * PostgreSQL spec pins the two together.
 */
export function deriveThumbnailTrackingStatus(
  facts: ThumbnailTrackingStatusFacts,
): ThumbnailTrackingStatus {
  if (facts.markedInconclusiveAt !== null) return 'inconclusive';
  return facts.ctrBefore !== null && facts.ctrAfter !== null ? 'measured' : 'tracking';
}
