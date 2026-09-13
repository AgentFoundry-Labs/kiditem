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

/** A difference that can go either way keeps its sign. */
function signedWon(amount: number): string {
  return `${amount > 0 ? '+' : ''}${formatKRW(amount)}원`;
}

/**
 * What the month total carries beyond its product rows, each part by its
 * cause: spend on listings that sold nothing, the difference between the
 * campaign-grain account spend and the listing-grain rows, and shipping no
 * line revenue can weigh. The server takes each part from exact values, so a
 * part of 0 or `null` is not listed and rounding never appears as one; the note
 * names the rounding every row applies instead.
 */
function unallocatedNote(totals: FinanceWindowTotals): string | null {
  const parts: string[] = [];
  if (totals.unallocatedAdCost) parts.push(`판매 없는 상품의 광고비 ${won(totals.unallocatedAdCost)}`);
  if (totals.adCostGrainDifference) {
    parts.push(`캠페인 합계와 상품별 광고비 차이 ${signedWon(totals.adCostGrainDifference)}`);
  }
  if (totals.unallocatedShipping) parts.push(`매출로 배분할 수 없는 배송비 ${won(totals.unallocatedShipping)}`);
  if (parts.length === 0) return null;
  return `상품 행에 없는 금액 — ${parts.join(' · ')}. 상품 행은 각각 반올림해 합계와 몇 원 다를 수 있습니다.`;
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
