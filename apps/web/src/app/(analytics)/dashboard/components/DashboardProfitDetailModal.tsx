import { X } from 'lucide-react';
import { cn, formatKRW } from '@/lib/utils';
import { DashboardDataBasis, readMetricBasis } from './DashboardDataBasis';
import type { DashboardAdSummary, DashboardSalesSummary } from '@kiditem/shared/dashboard';

type DetailItem = {
  label: string;
  value: number | null;
  negative: boolean;
};

function formatNullable(value: number | null, digits = 0): string {
  return value === null ? '—' : value.toFixed(digits);
}

export function DashboardProfitDetailModal({
  salesBaseline,
  adBaseline,
  onClose,
}: {
  salesBaseline: DashboardSalesSummary;
  adBaseline: DashboardAdSummary;
  onClose: () => void;
}) {
  const profitDetail = salesBaseline.profitDetail;
  const profitInputs = salesBaseline.profitInputs ?? null;
  const revenue = profitInputs?.revenue ?? profitDetail?.revenue ?? salesBaseline.rangeKpi?.revenue ?? salesBaseline.monthly.revenue;
  const items: DetailItem[] = profitInputs ? [
    { label: '매출', value: profitInputs.revenue, negative: false },
    { label: '집행광고비', value: -profitInputs.adCost, negative: true },
    { label: '비광고 비용', value: -profitInputs.cost, negative: true },
  ] : profitDetail ? [
    { label: '매출', value: profitDetail.revenue, negative: false },
    { label: '집행광고비', value: -profitDetail.adCost, negative: true },
    { label: '수수료', value: -profitDetail.commission, negative: true },
    { label: '배송비', value: -profitDetail.shippingCost, negative: true },
    { label: '매입원가', value: -profitDetail.costOfGoods, negative: true },
    { label: '기타비용', value: -profitDetail.otherCost, negative: true },
  ] : [
    { label: '매출', value: salesBaseline.rangeKpi?.revenue ?? salesBaseline.monthly.revenue, negative: false },
    {
      label: '광고비',
      value: adBaseline.monthly.totalAdSpend === null ? null : -adBaseline.monthly.totalAdSpend,
      negative: true,
    },
    { label: '광고전환매출', value: adBaseline.monthly.adRevenue, negative: false },
  ];
  const netProfit = profitDetail?.netProfit ?? salesBaseline.rangeKpi?.profit ?? salesBaseline.monthly.profit;
  const orderCount = profitDetail?.orderCount;
  const scale = revenue !== null && revenue > 0 ? revenue : null;

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
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{item.label}</span>
              <div className="flex items-center gap-3">
                <div className="w-24 h-2 rounded-full overflow-hidden bg-slate-100">
                  <div
                    className={cn('h-full rounded-full', item.negative ? 'bg-red-500' : 'bg-purple-600')}
                    style={{
                      width: item.value !== null && scale !== null
                        ? `${Math.min(Math.abs(item.value) / scale * 100, 100)}%`
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
          <div className="pt-3 mt-3 flex items-center justify-between border-t border-slate-200">
            <span className="text-sm font-bold text-slate-900">순이익</span>
            <span className={cn(
              'text-lg font-extrabold tabular-nums',
              netProfit === null ? 'text-slate-300' : netProfit >= 0 ? 'text-emerald-600' : 'text-red-600',
            )}>
              {netProfit === null ? '—' : `${formatKRW(netProfit)}원`}
            </span>
          </div>
          <div className="text-xs text-center mt-2 text-slate-400">
            {orderCount != null
              ? `주문 ${orderCount}건 기준`
              : `ROAS ${formatNullable(adBaseline.monthly.roas)}% | CTR ${formatNullable(adBaseline.monthly.ctr, 2)}%`}
          </div>
          <DashboardDataBasis
            basis={profitInputs?.basis ?? readMetricBasis(salesBaseline, 'rangeKpi.profit') ?? readMetricBasis(salesBaseline, 'monthly.profit')}
            className="mt-3 text-center"
          />
        </div>
      </div>
    </div>
  );
}
