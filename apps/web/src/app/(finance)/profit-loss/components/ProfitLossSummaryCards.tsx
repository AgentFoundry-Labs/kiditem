'use client';

import type { FinanceWindowTotals } from '@kiditem/shared/finance';
import { cn, formatKRW, formatPercent, getProfitColor } from '@/lib/utils';

interface Props {
  /**
   * The month's totals as the server calculated them. A total whose inputs
   * were not all measured arrives as `null` and renders as `-`, never as 0.
   */
  totals: FinanceWindowTotals;
}

/** A money card value; an unavailable amount is `-` and carries no unit. */
function won(amount: number | null): string {
  return amount === null ? '-' : `${formatKRW(amount)}원`;
}

export default function ProfitLossSummaryCards({ totals }: Props) {
  const adShare = totals.adCost !== null && totals.revenue !== null && totals.revenue > 0
    ? formatPercent((totals.adCost / totals.revenue) * 100)
    : '-';

  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="card">
        <div className="card-label">총 매출</div>
        <div className="card-value">{won(totals.revenue)}</div>
      </div>
      <div className="card">
        <div className="card-label">총 순이익</div>
        <div className={cn('card-value', getProfitColor(totals.profitRate))}>{won(totals.netProfit)}</div>
      </div>
      <div className="card">
        <div className="card-label">평균 이익률</div>
        <div className={cn('card-value', getProfitColor(totals.profitRate))}>{formatPercent(totals.profitRate)}</div>
      </div>
      <div className="card">
        <div className="card-label">총 광고비</div>
        <div className="card-value text-orange-600">{won(totals.adCost)}</div>
        <div className="text-xs text-slate-400">{adShare} of 매출</div>
      </div>
    </div>
  );
}
