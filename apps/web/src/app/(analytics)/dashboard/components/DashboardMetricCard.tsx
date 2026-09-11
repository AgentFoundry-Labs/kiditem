import { cn } from '@/lib/utils';

/**
 * One cell of the period-metric row: a label, a number, and the one line of
 * context that makes the number mean something.
 *
 * It used to carry a goal gauge as well — a target, an achievement percentage,
 * a progress bar, and a "N%p 남음" line, on four of the six cells. The targets
 * were constants in the page (15%, 10%, 5%, 400%), not anything an operator had
 * set, so the bar measured the number against a number nobody had chosen. It
 * also made four cells taller than the other two, which is the opposite of what
 * a row of comparable measurements should do. Industry reference figures live in
 * the chart's own tab, where they are labelled as reference.
 *
 * Every cell is three lines, whether the value is measured or withheld, so the
 * row keeps one height and the operator finds each number in the same place.
 */
export function MetricCard({
  label,
  value,
  unit,
  change,
  prevLabel,
  invertColor,
  onClick,
}: {
  label: string;
  value: string;
  unit: string;
  change: number | null;
  prevLabel: string;
  /** A metric where down is good, such as the ad-cost ratio. */
  invertColor?: boolean;
  onClick?: () => void;
}) {
  const isUnavailable = change === null;
  const isPositive = !isUnavailable && (invertColor ? change < 0 : change > 0);
  const isNeutral = !isUnavailable && Math.abs(change) < 0.5;

  return (
    <div
      className={cn('h-full bg-white transition-colors hover:bg-slate-50', onClick && 'cursor-pointer')}
      data-testid="dashboard-metric-card"
      onClick={onClick}
    >
      <div className="flex h-full flex-col px-3 py-2">
        <p className="font-mono text-[9.5px] uppercase tracking-wider text-slate-500">{label}</p>
        <p className="flex items-baseline gap-0.5 text-xl font-bold leading-tight tracking-tight tabular-nums text-slate-900">
          {value}
          <span className="text-xs font-semibold text-slate-500">{unit}</span>
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
          {!isUnavailable && !isNeutral && (
            <span className={cn('mr-1 font-medium', isPositive ? 'text-emerald-700' : 'text-red-600')}>
              {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
            </span>
          )}
          {prevLabel}
        </p>
      </div>
    </div>
  );
}

/** The same three lines, with the value slot held open by a dash. */
export function UnavailableMetricCard({ label, note }: { label: string; note: string }) {
  return (
    <div className="h-full bg-white" data-testid="dashboard-metric-card">
      <div className="flex h-full flex-col px-3 py-2">
        <p className="font-mono text-[9.5px] uppercase tracking-wider text-slate-500">{label}</p>
        {/* The value slot stays a dash; the fixed vocabulary belongs to the
            reason under it, which is what the operator acts on. */}
        <p className="text-xl font-medium leading-tight tracking-tight tabular-nums text-slate-400">—</p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{note}</p>
      </div>
    </div>
  );
}
