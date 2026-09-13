'use client';

import type { FinanceWindowTotals } from '@kiditem/shared/finance';
import { cn, formatKRW, formatPercent, getProfitColor } from '@/lib/utils';

interface Props {
  /**
   * The month's totals as the server calculated them. A total whose inputs
   * were not all measured arrives as `null` and renders as `-`, never as 0.
   * Shares and the parts no product row carries are server values too; the
   * cards do no arithmetic.
   */
  totals: FinanceWindowTotals;
}

/** A money card value; an unavailable amount is `-` and carries no unit. */
function won(amount: number | null): string {
  return amount === null ? '-' : `${formatKRW(amount)}원`;
}

/**
 * Why the month total differs from the sum of the product rows: advertising
 * spent on listings that sold nothing, and shipping of orders with no revenue
 * to weigh it by.
 */
function unallocatedNote(totals: FinanceWindowTotals): string | null {
  const hasAd = totals.unallocatedAdCost !== null && totals.unallocatedAdCost !== 0;
  const hasShipping = totals.unallocatedShipping !== null && totals.unallocatedShipping !== 0;
  if (!hasAd && !hasShipping) return null;
  return `상품 행에 배분되지 않은 광고비 ${won(totals.unallocatedAdCost)} · 배송비 ${won(totals.unallocatedShipping)}`;
}

export default function ProfitLossSummaryCards({ totals }: Props) {
  const note = unallocatedNote(totals);

  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="card">
        <div className="card-label">총 매출</div>
        <div className="card-value">{won(totals.revenue)}</div>
      </div>
      <div className="card">
        <div className="card-label">총 순이익</div>
        <div className={cn('card-value', getProfitColor(totals.profitRate))}>{won(totals.netProfit)}</div>
        {note && <div className="text-xs text-slate-400">{note}</div>}
      </div>
      <div className="card">
        <div className="card-label">평균 이익률</div>
        <div className={cn('card-value', getProfitColor(totals.profitRate))}>{formatPercent(totals.profitRate)}</div>
      </div>
      <div className="card">
        <div className="card-label">총 광고비</div>
        <div className="card-value text-orange-600">{won(totals.adCost)}</div>
        <div className="text-xs text-slate-400">{`${formatPercent(totals.adCostRate)} of 매출`}</div>
      </div>
    </div>
  );
}
