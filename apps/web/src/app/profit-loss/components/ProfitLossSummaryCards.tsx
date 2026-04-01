'use client';

import { formatKRW, formatPercent, getProfitColor } from '@/lib/utils';

interface Props {
  totalRevenue: number;
  totalProfit: number;
  totalAdCost: number;
  overallRate: number;
}

export default function ProfitLossSummaryCards({ totalRevenue, totalProfit, totalAdCost, overallRate }: Props) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <div className="text-sm text-slate-500">총 매출</div>
        <div className="text-xl font-bold text-slate-900 mt-1">{formatKRW(totalRevenue)}원</div>
      </div>
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <div className="text-sm text-slate-500">총 순이익</div>
        <div className={`text-xl font-bold mt-1 ${getProfitColor(overallRate)}`}>{formatKRW(totalProfit)}원</div>
      </div>
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <div className="text-sm text-slate-500">평균 이익률</div>
        <div className={`text-xl font-bold mt-1 ${getProfitColor(overallRate)}`}>{formatPercent(overallRate)}</div>
      </div>
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <div className="text-sm text-slate-500">총 광고비</div>
        <div className="text-xl font-bold text-orange-600 mt-1">{formatKRW(totalAdCost)}원</div>
        <div className="text-xs text-slate-400">{totalRevenue > 0 ? formatPercent((totalAdCost / totalRevenue) * 100) : "0%"} of 매출</div>
      </div>
    </div>
  );
}
