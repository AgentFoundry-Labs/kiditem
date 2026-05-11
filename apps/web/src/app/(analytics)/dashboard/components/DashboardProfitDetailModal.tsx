import { X } from 'lucide-react';
import type { DashboardAdSummary, DashboardSalesSummary } from '@kiditem/shared/dashboard';
import { cn, formatKRW } from '@/lib/utils';

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
  const revenue = profitDetail?.revenue ?? salesBaseline.monthly.revenue;
  const items = profitDetail ? [
    { label: '매출', value: profitDetail.revenue, negative: false },
    { label: '집행광고비', value: -profitDetail.adCost, negative: true },
    { label: '수수료', value: -profitDetail.commission, negative: true },
    { label: '배송비', value: -profitDetail.shippingCost, negative: true },
    { label: '매입원가', value: -profitDetail.costOfGoods, negative: true },
    { label: '기타비용', value: -profitDetail.otherCost, negative: true },
  ] : [
    { label: '매출', value: salesBaseline.monthly.revenue, negative: false },
    { label: '광고비', value: -adBaseline.monthly.totalAdSpend, negative: true },
    { label: '광고전환매출', value: adBaseline.monthly.adRevenue, negative: false },
  ];
  const netProfit = profitDetail?.netProfit ?? salesBaseline.monthly.profit;
  const orderCount = profitDetail?.orderCount;

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
                    style={{ width: `${Math.min(Math.abs(item.value) / Math.max(revenue, 1) * 100, 100)}%` }}
                  />
                </div>
                <span className={cn('text-sm font-semibold tabular-nums w-24 text-right', item.value >= 0 ? 'text-slate-900' : 'text-red-600')}>
                  {item.value >= 0 ? '' : '-'}{formatKRW(Math.abs(item.value))}원
                </span>
              </div>
            </div>
          ))}
          <div className="pt-3 mt-3 flex items-center justify-between border-t border-slate-200">
            <span className="text-sm font-bold text-slate-900">순이익</span>
            <span className={cn('text-lg font-extrabold tabular-nums', netProfit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {formatKRW(netProfit)}원
            </span>
          </div>
          <div className="text-xs text-center mt-2 text-slate-400">
            {orderCount != null ? `주문 ${orderCount}건 기준` : `ROAS ${adBaseline.monthly.roas.toFixed(0)}% | CTR ${adBaseline.monthly.ctr.toFixed(2)}%`}
          </div>
        </div>
      </div>
    </div>
  );
}
