import type { FinanceCostInputBasis } from './profit-loss.js';

/**
 * The evidence word for one finance cost component, in the product vocabulary
 * (`Measured` / `Not measured` / `Not applied`), derived from the line counts
 * the server published. The wire carries the counts; this is the one place the
 * word is computed.
 *
 * - `empty`: the window has no collected line.
 * - `not_applied`: the component applies to no line, so it is 0 by rule.
 * - `measured`: every line it applies to was measured.
 * - `not_measured`: no line it applies to was measured.
 * - `partial`: some lines it applies to were measured and some were not.
 */
export type FinanceCostInputState = 'measured' | 'not_measured' | 'not_applied' | 'partial' | 'empty';

export function financeCostInputState(input: FinanceCostInputBasis): FinanceCostInputState {
  if (input.lines === 0) return 'empty';
  if (input.notAppliedLines === input.lines) return 'not_applied';
  if (input.unmeasuredLines === 0) return 'measured';
  if (input.unmeasuredLines === input.lines - input.notAppliedLines) return 'not_measured';
  return 'partial';
}
