// How two keyword-grain contributions to one public keyword key become one.
// The campaign and keyword source repositories merge staged targets with it,
// and the target-day reader merges one attempt's ad-group contributions.

const KEYWORD_ADDITIVE_METRICS = [
  'spend',
  'revenue',
  'impressions',
  'clicks',
  'conversions',
  'orders',
  'adSpend',
  'adRevenue',
] as const;

type KeywordAdditiveMetric = (typeof KEYWORD_ADDITIVE_METRICS)[number];

/** The fields the merge reads; every other field of a target passes through. */
export type KeywordTargetMergeFields = {
  readonly [metric in KeywordAdditiveMetric]?: number | null;
} & {
  readonly status?: string | null;
  readonly onOff?: string | null;
  readonly currentBid?: number | null;
  readonly campaignName?: string | null;
  readonly externalOptionId?: string | null;
  readonly listingId?: string | null;
  readonly listingOptionId?: string | null;
};

/**
 * Sums the additive metrics (an absent value counts as zero) and keeps the
 * earlier target for everything else.
 */
export function mergeKeywordTargets<T extends KeywordTargetMergeFields>(
  previous: T,
  next: T,
): T {
  const earlier: KeywordTargetMergeFields = previous;
  const later: KeywordTargetMergeFields = next;
  const sums: { [metric in KeywordAdditiveMetric]?: number } = {};
  for (const metric of KEYWORD_ADDITIVE_METRICS) {
    sums[metric] = (earlier[metric] ?? 0) + (later[metric] ?? 0);
  }
  return {
    ...previous,
    ...sums,
    // Descriptors only fill gaps: the first row with a value wins so a later
    // share cannot blank out an identity the earlier one established.
    status: earlier.status ?? later.status,
    onOff: earlier.onOff ?? later.onOff,
    currentBid: earlier.currentBid ?? later.currentBid,
    campaignName: earlier.campaignName ?? later.campaignName,
    // A keyword shared by several ads is no longer attributable to one option.
    ...(earlier.externalOptionId !== later.externalOptionId
      ? { externalOptionId: null, listingId: null, listingOptionId: null }
      : {}),
  };
}
