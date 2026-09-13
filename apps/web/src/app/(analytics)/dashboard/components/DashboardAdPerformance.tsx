'use client';

import { DashboardBasisDisclosure } from './DashboardDataBasis';
import type { DashboardMetricBasis } from '@kiditem/shared/dashboard';

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
  basis: DashboardMetricBasis | null;
}

export function DashboardAdPerformance({
  rows,
  rangeLabel,
  source,
  knownThrough,
  effectiveAdSource,
}: {
  rows: AdPerformanceRow[];
  rangeLabel: string;
  source: string | null;
  knownThrough: string | null;
  effectiveAdSource: string | null;
}) {
  const sourceLabel = source === 'coupang_ads' ? '쿠팡 광고' : '미수집';
  return (
    <section
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
      aria-labelledby="dashboard-ad-performance-title"
      data-testid="dashboard-ad-performance"
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <h2 id="dashboard-ad-performance-title" className="text-sm font-semibold text-slate-900">
          광고 성과 <span className="font-normal text-slate-500">{rangeLabel}</span>
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500" data-testid="ad-performance-source">
            {sourceLabel}
            {knownThrough ? ` · ${knownThrough}까지` : ''}
            {effectiveAdSource ? ` · 기준 ${effectiveAdSource}` : ''}
          </span>
          <DashboardBasisDisclosure
            label="광고 성과 근거"
            entries={rows.map((row) => ({ label: row.label, basis: row.basis }))}
            meaning={(
              <p>
                쿠팡 광고 계정의 일별 실적을 선택한 기간만큼 합친 값입니다. 광고전환매출은
                광고를 거쳐 발생한 매출이라 전체 매출의 부분집합이고, 수집되지 않은 날은
                0이 아니라 빠진 것으로 셉니다.
              </p>
            )}
          />
        </div>
      </header>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">쿠팡 광고 성과 지표</caption>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className="border-b border-slate-100 last:border-b-0">
              <th scope="row" className="px-4 py-2.5 text-left font-medium text-slate-700">
                {row.label}
                {row.sublabel && <>{' '}<span className="text-[13px] font-normal text-slate-500">{row.sublabel}</span></>}
              </th>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">{row.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
