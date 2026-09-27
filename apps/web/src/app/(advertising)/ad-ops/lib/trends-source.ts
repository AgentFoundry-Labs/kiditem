import type { AdTrendsSummary } from '@kiditem/shared/advertising';

/**
 * Names where an ad-ops trend value came from, from the summary's facts. The
 * ad report is the only measured source; a window with no measured date
 * (`periodDayCount === 0`) is `미수집`, and a summary that has not loaded is `-`.
 */
export function adTrendsSourceLabel(summary: AdTrendsSummary | null | undefined): string {
  if (!summary) return '-';
  if (summary.periodDayCount === 0) return '미수집';
  return summary.latestBusinessDate
    ? `쿠팡 광고 보고서 · ${summary.latestBusinessDate}까지`
    : '쿠팡 광고 보고서';
}
