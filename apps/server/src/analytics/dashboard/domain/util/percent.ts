// Dashboard ratio primitives.
//
// A ratio is a measurement, so it exists only when both of its inputs are
// measured. Missing evidence is never a measured zero (2026-09-10 approved
// amendment — dashboard partial aggregation): when the denominator is not a
// positive finite number, or either input is unavailable, the ratio itself is
// unavailable and these functions return `null`. Callers must render that as
// "no data", not as `0`.
//
// A collected zero numerator is still evidence and still produces `0`.

/** Numeric evidence that may be unavailable. */
type Measured = number | null | undefined;

function isMeasured(value: Measured): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 1-decimal KPI percent: `(n/d)*100` rounded to 1dp, or `null` when the ratio
 * is not measurable. Use for adRate, profitRate, and any other single-decimal
 * KPI percent.
 */
export function measuredPercent1(numerator: Measured, denominator: Measured): number | null {
  if (!isMeasured(numerator) || !isMeasured(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * 2-decimal KPI percent: `(n/d)*100` rounded to 2dp, or `null` when the ratio
 * is not measurable. Use for ROAS, CTR, CVR, and any other two-decimal KPI
 * percent.
 */
export function measuredPercent2(numerator: Measured, denominator: Measured): number | null {
  if (!isMeasured(numerator) || !isMeasured(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100 * 100) / 100;
}

/**
 * Period-over-period change as a 1-decimal percent of the previous value.
 *
 * `absolutePrevious` divides by `Math.abs(previous)` so a signed metric (net
 * profit) reports the direction of the change rather than inverting it. Left
 * off, a negative previous value is not a usable base and the change is
 * unavailable.
 */
export function percentChange(
  current: number | null,
  previous: number | null,
  absolutePrevious = false,
): number | null {
  if (current === null || previous === null) return null;
  return measuredPercent1(
    current - previous,
    absolutePrevious ? Math.abs(previous) : previous,
  );
}

/**
 * Difference between two already-computed 1-decimal percents, in percentage
 * points. Unavailable on either side keeps the difference unavailable.
 */
export function oneDecimalDifference(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 10) / 10;
}
