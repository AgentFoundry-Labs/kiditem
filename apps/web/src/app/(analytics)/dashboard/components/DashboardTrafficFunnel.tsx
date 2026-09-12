'use client';

import { cn } from '@/lib/utils';
import { DashboardBasisDisclosure } from './DashboardDataBasis';

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
  partial,
  collected,
  onCollect,
}: {
  steps: TrafficFunnelStep[];
  basis: DashboardMetricBasis | null;
  /** The full provenance sentence, reached through the ⓘ rather than printed. */
  sourceNote: string;
  /** Some day in the window was not collected. */
  partial: boolean;
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
        <h2 id="dashboard-traffic-funnel-title" className="text-sm font-semibold text-slate-900 shrink-0">
          Wing 트래픽 퍼널
        </h2>
        {/* Status in a few characters, evidence behind the ⓘ. The whole
            provenance sentence used to run across the header and truncate,
            which made a panel's state something you had to read rather than
            something you could see. */}
        <div className="flex min-w-0 items-center gap-1.5">
          {!collected && (
            <button
              type="button"
              onClick={onCollect}
              className="shrink-0 text-xs font-semibold text-violet-700 hover:text-violet-900"
            >
              수집 시작 →
            </button>
          )}
          {/* No caption. `부분 10/11일` said in words what the ⓘ now says in
              colour, and the provenance sentence is one click away inside it. */}
          <DashboardBasisDisclosure
            label="Wing 트래픽 퍼널 근거"
            entries={[{ label: 'Wing 트래픽', basis }]}
            note={collected ? sourceNote : null}
            tone={!collected ? 'absent' : partial ? 'partial' : 'neutral'}
          />
        </div>
      </header>

      {/* The five slots are always here. They used to disappear entirely when
          nothing was collected, so the panel — and the whole column under it —
          jumped the moment a collection landed. An uncollected step holds the
          absent-value dash, which is a different thing from a step that is not
          on the screen at all. */}
      <ol className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-3 lg:grid-cols-5">
        {steps.map(step => (
          <li key={step.key} className="bg-white px-3 py-1.5">
            <p className="text-xs text-slate-500">{step.label}</p>
            <p className={cn(
              'text-lg font-bold tabular-nums tracking-tight',
              collected ? 'text-slate-900' : 'text-slate-300',
            )}>
              {collected ? step.display : '—'}
              {collected && step.rate && <span className="ml-1.5 text-xs font-medium text-slate-500">{step.rate}</span>}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
