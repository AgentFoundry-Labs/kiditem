'use client';

import Link from 'next/link';
import type { DashboardInventorySummary, DashboardMetricBasis } from '@kiditem/shared/dashboard';
import { cn } from '@/lib/utils';
import { basisHasValues } from './DashboardDataBasis';

/**
 * Each warning used to own a card, so five counts never lined up against one
 * another — and the actual question ("what needs a hand first?") is comparative.
 * As rows they sort by severity and read against each other.
 *
 * The counts come from separate keys that can disagree, so each row still reads
 * its own basis — to decide whether the number is a measurement or a withheld
 * value. What it no longer does is print that basis five times: the evidence is
 * reached through the section's one disclosure.
 */

export interface DashboardWarningRow {
  key: string;
  testId: string;
  label: string;
  note: string;
  href: string;
  unit: string;
  value: number | null | undefined;
  basis: DashboardMetricBasis | null;
  /**
   * A count that is published with the rows it counts and has no separate
   * evidence to verify — how many products carry no classification is not a
   * measurement of the business, it is a fact about the table itself.
   */
  countsItself?: boolean;
  /** Lower is more urgent; ties keep the declared order. */
  severity: number;
}

export function buildWarningRows(
  warnings: DashboardInventorySummary['warnings'],
  basisOf: (key: string) => DashboardMetricBasis | null,
  unclassifiedProductCount?: number,
  abcBasis?: DashboardMetricBasis | null,
): DashboardWarningRow[] {
  return [
    {
      key: 'minusProducts',
      testId: 'minus-products',
      label: '적자 상품',
      note: '이익률 마이너스',
      href: '/product-hub?tab=cleanup',
      unit: '개',
      value: warnings.minusProducts,
      basis: basisOf('warnings.minusProducts'),
      severity: 0,
    },
    {
      key: 'highAdProducts',
      testId: 'high-ad-products',
      label: '광고비 초과',
      note: '광고비율 15% 초과',
      href: '/ad-ops',
      unit: '개',
      value: warnings.highAdProducts,
      basis: basisOf('warnings.highAdProducts'),
      severity: 1,
    },
    {
      key: 'lowProfitProducts',
      testId: 'low-profit-products',
      label: '저이익 상품',
      note: '이익률 3% 이하',
      href: '/product-hub?tab=cleanup',
      unit: '개',
      value: warnings.lowProfitProducts,
      basis: basisOf('warnings.lowProfitProducts'),
      severity: 2,
    },
    {
      key: 'outOfStockSkus',
      testId: 'out-of-stock',
      label: '셀피아 재고 0',
      note: '최신 셀피아 스냅샷',
      href: '/inventory-hub',
      unit: '건',
      value: warnings.outOfStockSkus,
      basis: basisOf('warnings.outOfStockSkus'),
      severity: 3,
    },
    {
      key: 'mappingAttentionSkus',
      testId: 'mapping-attention',
      label: '매칭 확인 필요',
      note: '판매중 옵션의 미매칭·검토 필요',
      href: '/product-hub/matching?status=attention',
      unit: '건',
      value: warnings.mappingAttentionSkus,
      basis: basisOf('warnings.mappingAttentionSkus'),
      severity: 4,
    },
    // Unclassified products are the same kind of thing as the rest of this
    // table — a count someone has to go act on — and they read against the
    // others rather than only inside the ABC panel. The count comes from the
    // products read, not from an ABC evaluation, so it answers to that basis:
    // gating it on the evaluation would withhold a number nothing else shows.
    {
      key: 'abcUnclassified',
      testId: 'abc-unclassified',
      label: 'ABC 미분류',
      note: '셀피아·광고비 수집 또는 매핑을 확인',
      href: '/product-hub?abcGrade=unclassified',
      unit: '개',
      value: unclassifiedProductCount,
      basis: abcBasis ?? null,
      countsItself: true,
      severity: 5,
    },
  ];
}

/**
 * A row without a verified basis is withheld, not zero — the two read the same
 * on screen otherwise, and the operator would take "0건" as "nothing to do".
 */
function rowState(row: DashboardWarningRow): 'withheld' | 'clear' | 'attention' {
  if (row.value === null || row.value === undefined) return 'withheld';
  if (!row.countsItself && !basisHasValues(row.basis)) return 'withheld';
  return row.value > 0 ? 'attention' : 'clear';
}

const STATE_LABEL: Record<ReturnType<typeof rowState>, string> = {
  withheld: '미수집',
  clear: '정상',
  attention: '확인',
};

export function DashboardWarningTable({ rows }: { rows: DashboardWarningRow[] }) {
  // Withheld rows sort last. A row with no verified basis is not "less
  // urgent" — it is unmeasured, and putting it above a real count would rank
  // the two on a scale they do not share.
  const rank = (row: DashboardWarningRow) => {
    const state = rowState(row);
    if (state === 'attention') return 0;
    if (state === 'clear') return 1;
    return 2;
  };
  const ordered = [...rows].sort((a, b) => rank(a) - rank(b) || a.severity - b.severity);

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
      aria-labelledby="dashboard-warning-table-title"
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <h2 id="dashboard-warning-table-title" className="text-sm font-semibold text-slate-900">
          지금 손이 필요한 것
        </h2>
        <span className="text-[11px] text-slate-500">심각도순</span>
      </header>
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">경고 항목별 상태와 건수</caption>
        <colgroup>
          <col />
          <col className="w-[58px]" />
          <col className="w-[76px]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="border-b border-slate-200 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">항목</th>
            <th scope="col" className="border-b border-slate-200 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">상태</th>
            <th scope="col" className="border-b border-slate-200 px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">건수</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map(row => {
            const state = rowState(row);
            return (
              <tr key={row.key} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                <td className="min-w-0 px-3 py-1.5">
                  <Link href={row.href} className="block truncate font-medium text-slate-900 hover:text-violet-700" title={row.note}>
                    {row.label}
                  </Link>
                </td>
                <td className="px-1 py-1.5 align-top">
                  <span
                    className={cn(
                      'inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold',
                      state === 'attention' && 'bg-red-50 text-red-700',
                      state === 'clear' && 'bg-emerald-50 text-emerald-700',
                      state === 'withheld' && 'bg-slate-100 italic text-slate-500',
                    )}
                  >
                    {STATE_LABEL[state]}
                  </span>
                </td>
                <td
                  className={cn(
                    'px-3 py-1.5 text-right align-top font-semibold tabular-nums',
                    state === 'withheld' ? 'font-medium text-slate-500' : 'text-slate-900',
                  )}
                >
                  <span data-warning-count={row.testId}>
                    {state === 'withheld' ? '—' : row.value!.toLocaleString('ko-KR')}
                  </span>
                  {state !== 'withheld' && <span className="ml-0.5 text-xs text-slate-500">{row.unit}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
