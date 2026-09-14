/**
 * A finance month: `YYYY-MM` naming a real calendar month. `2026-00` and
 * `2026-13` are rejected rather than normalized into a neighbouring month
 * under the label the caller sent.
 */
export const FINANCE_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const FINANCE_PERIOD_MESSAGE = 'period must match YYYY-MM (e.g., 2026-04)';
