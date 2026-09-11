'use client';

import type { DashboardMetricBasis } from '@kiditem/shared/dashboard';


/**
 * These five numbers are one story — a visitor becoming a sale — and they all
 * come from the same owner (Wing traffic). Stacked inside the revenue card they
 * made that one card twice the height of its neighbours while saying nothing
 * about revenue. As their own strip they read in the order they happen, and the
 * revenue card goes back to being about revenue.
 *
 * Ad conversion revenue is deliberately NOT here: it belongs to the Coupang ads
 * owner, not to Wing traffic, and putting it in this row would imply the funnel
 * measured it.
 */

export interface TrafficFunnelStep {
  key: string;
  label: string;
  /** Already formatted by the caller, which owns the unit and the withheld marker. */
  display: string;
  /** Conversion from the previous step, when both steps are measured. */
  rate: string | null;
}

export function DashboardTrafficFunnel({
  steps,
  basis,
  sourceNote,
  collected,
  onCollect,
}: {
  steps: TrafficFunnelStep[];
  basis: DashboardMetricBasis | null;
  sourceNote: string;
  collected: boolean;
  onCollect: () => void;
}) {
  return (
    <section
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
      aria-labelledby="dashboard-traffic-funnel-title"
      data-testid="dashboard-traffic-funnel"
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <h2 id="dashboard-traffic-funnel-title" className="text-sm font-semibold text-slate-900 shrink-0">
            Wing 트래픽 퍼널
          </h2>
          <span className={collected ? 'truncate text-xs text-slate-500' : 'truncate text-xs font-medium text-amber-700'}>
            {collected ? sourceNote : `${steps.map(s => s.label).join(' · ')} — Wing 트래픽 기준 · 미수집`}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!collected && (
            <button
              type="button"
              onClick={onCollect}
              className="text-xs font-semibold text-violet-700 hover:text-violet-900"
            >
              수집 시작 →
            </button>
          )}
        </div>
      </header>

      {/* Nothing collected means there is no measurement to lay out — the steps
          stay named on one line so the operator can see what would appear, and
          no slot pretends to hold a value. */}
      {collected ? (
        <ol className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-3 lg:grid-cols-5">
          {steps.map(step => (
            <li key={step.key} className="bg-white px-3 py-1.5">
              <p className="text-xs text-slate-500">{step.label}</p>
              <p className="text-lg font-bold tabular-nums tracking-tight text-slate-900">
                {step.display}
                {step.rate && <span className="ml-1.5 text-xs font-medium text-slate-500">{step.rate}</span>}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
