export type RankChangeDirection = 'rising' | 'falling' | 'steady';

export type RankChange = Readonly<{
  /** Positive means the product moved closer to rank 1. */
  change: number | null;
  /** Missing whenever either business-date rank was not measured. */
  direction: RankChangeDirection | null;
}>;

/** Derive presentation-only movement from two measured business-date ranks. */
export function deriveRankChange(
  currentRank: number | null,
  previousRank: number | null,
): RankChange {
  if (currentRank === null || previousRank === null) {
    return { change: null, direction: null };
  }
  const change = previousRank - currentRank;
  return {
    change,
    direction: change > 0 ? 'rising' : change < 0 ? 'falling' : 'steady',
  };
}
