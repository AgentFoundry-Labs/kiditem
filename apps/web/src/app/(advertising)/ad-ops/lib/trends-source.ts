import type { AdTrendsSummary } from '@kiditem/shared/advertising';

/**
 * Names where an ad-ops trend value came from, using only the server's
 * declared source. The campaign sweep is the only measured source; a window
 * with no measured date is `미수집`, and a summary that has not loaded is `-`.
 */
export function adTrendsSourceLabel(summary: AdTrendsSummary | null | undefined): string {
  if (!summary) return '-';
  if (summary.source === 'unavailable') return '미수집';
  return summary.latestBusinessDate
    ? `쿠팡 광고 캠페인 합산 · ${summary.latestBusinessDate}까지`
    : '쿠팡 광고 캠페인 합산';
}
