import { X } from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import {
  DashboardBasisDisclosure,
  DashboardDataBasis,
  readMetricBasis,
  type DashboardMetricBasis,
} from './DashboardDataBasis';
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

function negateMeasured(value: number | null): number | null {
  return value === null ? null : -value;
}

function formatNullable(value: number | null, digits = 0): string {
  return value === null ? '—' : value.toFixed(digits);
}

export type DashboardProfitInputsView = {
  revenue: number;
  cost: number;
  adCost: number;
  qty: number | null;
  basis: DashboardMetricBasis;
};

export function DashboardProfitDetailModal({
  salesBaseline,
  adBaseline,
  selectedRange,
  inputs,
  onClose,
}: {
  salesBaseline: DashboardSalesSummary;
  adBaseline: DashboardAdSummary;
  selectedRange: DashboardProfitDetailRange;
  /**
   * The inputs the card that opened this modal was reading. The profit card no
   * longer prints them itself, so the modal has to show the caller's own
   * numbers rather than re-deriving a set from the sales baseline — Sellpia and
   * order profitability publish different ones.
   *
   * Passing `null` is an answer, not an absence: it says the caller's source
   * published nothing, and the sales baseline's own inputs must NOT stand in.
   * Omitting the prop entirely is what keeps the old baseline behaviour.
   */
  inputs?: DashboardProfitInputsView | null;
  onClose: () => void;
}) {
  const profitInputs = inputs !== undefined ? inputs : salesBaseline.profitInputs ?? null;
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
  // The caller said its source published no structure. Every remaining branch
  // reads a different source — the calendar month's order structure, or the ad
  // account — so any of them would put one source's numbers under another
  // source's card. The rows stay named and withheld instead.
  const sourcePublishedNothing = inputs === null;
  const view: ProfitDetailView = sourcePublishedNothing ? {
    items: [
      { label: '매출', value: null, negative: false },
      { label: '집행광고비', value: null, negative: true },
      { label: '비광고 비용', value: null, negative: true },
    ],
    scale: null,
    basis: null,
    scopeNote: '선택한 원천이 순이익 구성을 발행하지 않았습니다.',
  } : profitInputs ? {
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
      { label: '집행광고비', value: negateMeasured(monthProfitDetail.adCost), negative: true },
      { label: '수수료', value: negateMeasured(monthProfitDetail.commission), negative: true },
      { label: '배송비', value: negateMeasured(monthProfitDetail.shippingCost), negative: true },
      { label: '매입원가', value: negateMeasured(monthProfitDetail.costOfGoods), negative: true },
      { label: '기타비용', value: negateMeasured(monthProfitDetail.otherCost), negative: true },
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
  // Quantity is not a currency, so it reads as its own line rather than as a
  // bar in the cost structure.
  const soldQuantity = profitInputs?.qty ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-bold text-slate-900">순이익 구조</h3>
          <div className="flex items-center gap-1">
            {/* The modal is its own section, so its evidence is reached the
                same way: one affordance, broken down per value. */}
            <DashboardBasisDisclosure
              label="순이익 구조 근거"
              entries={[
                { label: '비용 구성', basis: view.basis },
                { label: '순이익', basis: selectedProfitBasis },
              ]}
            />
            <button onClick={onClose} className="p-1 rounded-lg hover:opacity-80 text-slate-400">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {view.scopeNote && (
            <div className="text-xs text-slate-400" data-testid="dashboard-profit-detail-scope">{view.scopeNote}</div>
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
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">판매수량</span>
            <span
              className={cn('w-24 text-right text-sm font-semibold tabular-nums', soldQuantity === null ? 'text-slate-300' : 'text-slate-900')}
              data-testid="dashboard-profit-detail-qty"
            >
              {soldQuantity === null ? '—' : `${formatNumber(soldQuantity)}개`}
            </span>
          </div>
          <DashboardDataBasis basis={view.basis} className="text-center" />
          <div className="pt-3 mt-3 flex items-center justify-between border-t border-slate-200">
            <span className="text-sm font-bold text-slate-900">순이익</span>
            <span className={cn(
              'text-xl font-extrabold tabular-nums',
              selectedNetProfit === null ? 'text-slate-300' : selectedNetProfit >= 0 ? 'text-emerald-600' : 'text-red-600',
            )}>
              {selectedNetProfit === null ? '—' : `${formatKRW(selectedNetProfit)}원`}
            </span>
          </div>
          <div className="text-[13px] text-center mt-2 text-slate-400">
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
