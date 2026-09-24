// Test-side shorthand for the resolved period the outgoing ports now take.
// Specs that only care about "this window" build one here instead of
// re-deriving business dates or a cutoff of their own.

import {
  resolveExactPeriod,
  type DashboardSourceClass,
  type ResolvedDashboardPeriod,
} from '../../../domain/dashboard/period/dashboard-period';

export function periodOf(
  from: Date,
  to: Date,
  options: { anchor?: Date; sourceClass?: DashboardSourceClass } = {},
): ResolvedDashboardPeriod {
  return resolveExactPeriod(
    { from, to },
    options.anchor ?? new Date(),
    options.sourceClass ?? 'order_timestamps',
  );
}
