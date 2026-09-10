import { X } from 'lucide-react';
import { cn, formatKRW } from '@/lib/utils';
import { DashboardDataBasis, readMetricBasis, type DashboardMetricBasis } from './DashboardDataBasis';
import type { DashboardAdSummary, DashboardSalesSummary } from '@kiditem/shared/dashboard';

type DetailItem = {
  label: string;
  value: number | null;
  negative: boolean;
};

/** The dashboard range selection the modal was opened for. */
export type DashboardProfitDetailRange = 'month' | 'week' | 'day' | 'custom';

type ProfitDetailView = {
  /** Rows that all share `basis`; never a mix of sources or periods. */
  items: DetailItem[];
  /** Positive base used for the proportion bars, from the same basis. */
  scale: number | null;
  /**
   * Label describing exactly the rows in `items`, or `null` when the rows are
   * the selected range's own profit structure — the modal already prints that
   * basis below the total, and a second label would repeat it.
   */
  basis: DashboardMetricBasis | null;
  /** Set when the rows are not the selected range's profit structure. */
  scopeNote: string | null;
};

function positiveScale(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && value > 0 ? value : null;
}

function formatNullable(value: number | null, digits = 0): string {
  return value === null ? '—' : value.toFixed(digits);
}

export function DashboardProfitDetailModal({
  salesBaseline,
  adBaseline,
  selectedRange,
  onClose,
}: {
  salesBaseline: DashboardSalesSummary;
  adBaseline: DashboardAdSummary;
  selectedRange: DashboardProfitDetailRange;
  onClose: () => void;
}) {
  const profitInputs = salesBaseline.profitInputs ?? null;
  // A modal opened for the selected range shows that range or nothing. The
  // baseline month's cached values never stand in for a missing range value,
  // and the basis label always describes the values actually rendered.
  const isMonthSelection = selectedRange === 'month';
  // `profitDetail` is built from the calendar month, not from the selected
  // range, so it may only describe a month selection. Week, day, and custom
  // selections fall through instead of relabelling this month's structure.
  const monthProfitDetail = isMonthSelection ? salesBaseline.profitDetail ?? null : null;
  const selectedProfitBasis = readMetricBasis(salesBaseline, 'rangeKpi.profit');
  const selectedNetProfit = monthProfitDetail?.netProfit ?? salesBaseline.rangeKpi?.profit ?? null;
  const view: ProfitDetailView = profitInputs ? {
    items: [
      { label: '매출', value: profitInputs.revenue, negative: false },
      { label: '집행광고비', value: -profitInputs.adCost, negative: true },
      { label: '비광고 비용', value: -profitInputs.cost, negative: true },
    ],
    scale: positiveScale(profitInputs.revenue),
    basis: profitInputs.basis,
    scopeNote: null,
  } : monthProfitDetail ? {
    items: [
      { label: '매출', value: monthProfitDetail.revenue, negative: false },
      { label: '집행광고비', value: -monthProfitDetail.adCost, negative: true },
      { label: '수수료', value: -monthProfitDetail.commission, negative: true },
      { label: '배송비', value: -monthProfitDetail.shippingCost, negative: true },
      { label: '매입원가', value: -monthProfitDetail.costOfGoods, negative: true },
      { label: '기타비용', value: -monthProfitDetail.otherCost, negative: true },
    ],
    scale: positiveScale(monthProfitDetail.revenue),
    basis: null,
    scopeNote: null,
  } : {
    // No profit structure was published for the selection. Keep the
    // advertising subset, which shares one source and one period, rather than
    // pairing it with a sales revenue collected over different dates.
    items: [
      {
        label: '집행광고비',
        value: adBaseline.monthly.totalAdSpend === null ? null : -adBaseline.monthly.totalAdSpend,
        negative: true,
      },
      { label: '광고전환매출', value: adBaseline.monthly.adRevenue, negative: false },
    ],
    scale: positiveScale(adBaseline.monthly.adRevenue),
    basis: readMetricBasis(adBaseline, 'monthly.totalAdSpend'),
    scopeNote: isMonthSelection
      ? '순이익 구성 근거 없음 · 광고 지표만 표시'
      : '선택 기간 순이익 구성 근거 없음 · 이번 달 광고 지표만 표시',
  };
  // Month-scoped evidence for a month-scoped breakdown only.
  const orderCount = monthProfitDetail?.orderCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-900">순이익 구조</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:opacity-80 text-slate-400">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          {view.scopeNote && (
            <div className="text-[11px] text-slate-400" data-testid="dashboard-profit-detail-scope">{view.scopeNote}</div>
          )}
          {view.items.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{item.label}</span>
              <div className="flex items-center gap-3">
                <div className="w-24 h-2 rounded-full overflow-hidden bg-slate-100">
                  <div
                    className={cn('h-full rounded-full', item.negative ? 'bg-red-500' : 'bg-purple-600')}
                    style={{
                      width: item.value !== null && view.scale !== null
                        ? `${Math.min(Math.abs(item.value) / view.scale * 100, 100)}%`
                        : '0%',
                    }}
                  />
                </div>
                <span className={cn(
                  'text-sm font-semibold tabular-nums w-24 text-right',
                  item.value === null ? 'text-slate-300' : item.value >= 0 ? 'text-slate-900' : 'text-red-600',
                )}>
                  {item.value === null ? '—' : `${item.value >= 0 ? '' : '-'}${formatKRW(Math.abs(item.value))}원`}
                </span>
              </div>
            </div>
          ))}
          <DashboardDataBasis basis={view.basis} className="text-center" />
          <div className="pt-3 mt-3 flex items-center justify-between border-t border-slate-200">
            <span className="text-sm font-bold text-slate-900">순이익</span>
            <span className={cn(
              'text-lg font-extrabold tabular-nums',
              selectedNetProfit === null ? 'text-slate-300' : selectedNetProfit >= 0 ? 'text-emerald-600' : 'text-red-600',
            )}>
              {selectedNetProfit === null ? '—' : `${formatKRW(selectedNetProfit)}원`}
            </span>
          </div>
          <div className="text-xs text-center mt-2 text-slate-400">
            {orderCount != null
              ? `주문 ${orderCount}건 기준`
              : `${isMonthSelection ? '' : '이번 달 '}ROAS ${formatNullable(adBaseline.monthly.roas)}% | CTR ${formatNullable(adBaseline.monthly.ctr, 2)}%`}
          </div>
          <DashboardDataBasis basis={selectedProfitBasis} className="mt-3 text-center" />
        </div>
      </div>
    </div>
  );
}
