export type CompetitorCollectionStatus =
  | 'catalog_empty'
  | 'not_configured'
  | 'not_collected'
  | 'ready';

/** Counts the competitor-tracking overview publishes; the status word is derived from them. */
export type CompetitorCollectionFacts = Readonly<{
  ownProductCount: number;
  enabledTrackerCount: number;
  /** SERP snapshots read for the overview's period. */
  serpSnapshotCount: number;
}>;

/** Derives the one collection word the competitor screen shows from the overview's counts. */
export function competitorCollectionStatus(
  facts: CompetitorCollectionFacts,
): CompetitorCollectionStatus {
  if (facts.ownProductCount === 0) return 'catalog_empty';
  if (facts.enabledTrackerCount === 0) return 'not_configured';
  if (facts.serpSnapshotCount === 0) return 'not_collected';
  return 'ready';
}
