// apps/server/src/advertising/util/ratio-recompute.ts
//
// Hard rewrite Phase H3 — recompute ROAS/CTR/CVR from additive numerator and
// denominator sums. Reads MUST NOT trust per-row provider ratios — those are
// captured (in `metaJson`) for audit only. The source-of-truth is the additive
// columns on `ChannelListingDailySnapshot` / `ChannelAdTargetDailySnapshot`,
// and ratios over a period are recomputed as `SUM(numerator) / SUM(denominator)`.
//
// Returns `null` when the denominator is 0 / NaN / non-finite — callers MUST
// surface `null` (not 0) so the UI can label "no data" correctly.
//
// Scaling matches the legacy services:
//   - ROAS:  return as percentage (revenue / spend * 100), 2-decimal rounded
//   - CTR:   return as percentage (clicks / impressions * 100), 2-decimal
//   - CVR:   return as percentage (conversions / clicks * 100), 2-decimal

function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  // 2-decimal percentage rounding matches legacy buildMetrics() helpers across
  // ad-campaigns / ad-benchmark / advertising hub.
  return Math.round((numerator / denominator) * 10000) / 100;
}

/** ROAS = SUM(revenue) / SUM(spend) * 100. Null when spend is 0. */
export function recomputeRoas(revenue: number, spend: number): number | null {
  return safeRatio(revenue, spend);
}

/** CTR = SUM(clicks) / SUM(impressions) * 100. Null when impressions is 0. */
export function recomputeCtr(clicks: number, impressions: number): number | null {
  return safeRatio(clicks, impressions);
}

/** CVR = SUM(conversions) / SUM(clicks) * 100. Null when clicks is 0. */
export function recomputeCvr(conversions: number, clicks: number): number | null {
  return safeRatio(conversions, clicks);
}
