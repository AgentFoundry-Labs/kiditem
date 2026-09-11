'use client';

import type { DashboardMetricBasis } from '@kiditem/shared/dashboard';
import { DashboardBasisMarker } from './DashboardDataBasis';

/**
 * Ad conversion revenue used to sit inside the revenue card, under a "쿠팡"
 * sub-label, beside five Wing traffic numbers it has nothing to do with. It
 * belongs to the Coupang ads owner, so it reads here with the rest of that
 * owner's measurements instead.
 *
 * Impressions, clicks and conversions already travel on the ad summary; the
 * screen simply never showed them.
 */

export interface AdPerformanceRow {
  key: string;
  label: string;
  /** Owner attribution for a value whose source differs from its neighbours. */
  sublabel?: string;
  /** Formatted by the caller, which owns the unit and the withheld marker. */
  display: string;
}

export function DashboardAdPerformance({
  rows,
  basis,
  coverageLabel,
}: {
  rows: AdPerformanceRow[];
  basis: DashboardMetricBasis | null;
  coverageLabel: string | null;
}) {
  return (
    <section
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
      aria-labelledby="dashboard-ad-performance-title"
      data-testid="dashboard-ad-performance"
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <h2 id="dashboard-ad-performance-title" className="text-sm font-semibold text-slate-900">
          광고 성과 <span className="font-normal text-slate-500">쿠팡</span>
        </h2>
        <div className="flex items-center gap-2">
          {coverageLabel && <span className="text-[11px] tabular-nums text-slate-500">{coverageLabel}</span>}
          <DashboardBasisMarker basis={basis} />
        </div>
      </header>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">쿠팡 광고 성과 지표</caption>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className="border-b border-slate-100 last:border-b-0">
              <th scope="row" className="px-3 py-1.5 text-left font-medium text-slate-700">
                {row.label}
                {row.sublabel && <>{' '}<span className="text-xs font-normal text-slate-500">{row.sublabel}</span></>}
              </th>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-900">{row.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
