/**
 * Column-presence evidence for scraped ad report rows.
 *
 * The extension normalizes every metric to a number and emits `0` when the
 * source grid had no such column. A reader therefore cannot tell "the column
 * was absent" from "the value really was zero" by looking at the value alone.
 * `_observedMetrics` (built in `content/ads-report.js`) records which headers
 * were actually found, and this module turns that into a durable stamp.
 *
 * The conversion count is the case that matters in practice. Live header census
 * over `channel_scrape_snapshots` for 2026-07-13..20:
 *
 *   130 rows carry `클릭수`
 *    72 rows are campaign dashboard rows  — no conversion-count column at all
 *    58 rows are campaign product detail rows — carry `광고 전환 판매수`
 *
 * The campaign dashboard grid's headers are `집행 광고비 / 중요 결과 광고 전환
 * 매출 / 노출수 / 클릭수 / 클릭률 / 전환율 / 광고수익률`. Without this stamp the
 * campaign tab rendered a fabricated `0` conversions on rows that had real
 * revenue (live: `매출 TOP 제품`, 353,390원 revenue / 440 clicks / 0 conversions).
 */
export function hasObservedConversionColumn(
  row: Record<string, unknown>,
): boolean {
  const observed = row._observedMetrics;
  if (observed && typeof observed === 'object' && !Array.isArray(observed)) {
    return (observed as Record<string, unknown>).conversions === true;
  }
  // Callers predating the evidence map (server-side/test payloads) fall back to
  // property presence, matching `hasCompleteObservedAdditiveMetrics`.
  return Object.prototype.hasOwnProperty.call(row, 'conversions');
}
