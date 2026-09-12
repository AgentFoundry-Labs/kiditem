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
      <div className="flex h-full flex-col px-4 py-3">
        <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
        <p className="flex items-baseline gap-0.5 text-xl font-bold leading-tight tracking-tight tabular-nums text-slate-900">
          {value}
          <span className="text-[13px] font-semibold text-slate-500">{unit}</span>
        </p>
        <p className="mt-0.5 text-xs leading-snug text-slate-500">
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

/**
 * The same three lines, with the value slot held open by a dash.
 *
 * The third line used to carry the reason — `미수집`, `정산 데이터 없음`,
 * `부분 0/11일` — one per blank card. The section's ⓘ now says the same thing
 * per value and says it in full ("주문 · Wing 트래픽에서 이 기간에 수집된 날이
 * 없어…"), so the caption was the affordance's job written out six times in
 * eleven pixels. The line itself stays: without it a blank cell would be
 * shorter than a measured one and the row would step.
 */
export function UnavailableMetricCard({ label }: { label: string }) {
  return (
    <div className="h-full bg-white" data-testid="dashboard-metric-card">
      <div className="flex h-full flex-col px-4 py-3">
        <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-xl font-medium leading-tight tracking-tight tabular-nums text-slate-400">—</p>
        <p className="mt-0.5 text-xs leading-snug text-slate-500" aria-hidden="true">&nbsp;</p>
      </div>
    </div>
  );
}
