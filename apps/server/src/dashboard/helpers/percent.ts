/**
 * Zero-guarded 1-decimal percent: (n/d)*100 rounded to 1dp. Returns 0 when d <= 0.
 * Use for adRate, profitRate, and any "single-decimal KPI percent".
 *
 * For abs-guarded percent change (prev may be negative), pass Math.abs(prev):
 *   pct1(cur - prev, Math.abs(prev))
 */
export function pct1(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

/**
 * Zero-guarded 2-decimal percent: (n/d)*100 rounded to 2dp. Returns 0 when d <= 0.
 * Use for ROAS, CTR, CVR, and any "two-decimal KPI percent".
 */
export function pct2(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100 * 100) / 100 : 0;
}
