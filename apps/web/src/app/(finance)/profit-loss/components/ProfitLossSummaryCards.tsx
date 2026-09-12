'use client';

import { cn, formatKRW, formatPercent, getProfitColor } from '@/lib/utils';

interface Props {
  totalRevenue: number;
  // Unavailable when any listing in view has incomplete ad coverage (ADR-0003).
  // `formatKRW`/`formatPercent` render that as '-', never as 0.
  totalProfit: number | null;
  totalAdCost: number | null;
  overallRate: number | null;
}

export default function ProfitLossSummaryCards({ totalRevenue, totalProfit, totalAdCost, overallRate }: Props) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="card">
        <div className="card-label">총 매출</div>
        <div className="card-value">{formatKRW(totalRevenue)}원</div>
      </div>
      <div className="card">
        <div className="card-label">총 순이익</div>
        <div className={cn('card-value', getProfitColor(overallRate))}>{formatKRW(totalProfit)}원</div>
      </div>
      <div className="card">
        <div className="card-label">평균 이익률</div>
        <div className={cn('card-value', getProfitColor(overallRate))}>{formatPercent(overallRate)}</div>
      </div>
      <div className="card">
        <div className="card-label">총 광고비</div>
        <div className="card-value text-orange-600">{formatKRW(totalAdCost)}원</div>
        <div className="text-xs text-slate-400">{totalAdCost !== null && totalRevenue > 0 ? formatPercent((totalAdCost / totalRevenue) * 100) : "-"} of 매출</div>
      </div>
    </div>
  );
}
