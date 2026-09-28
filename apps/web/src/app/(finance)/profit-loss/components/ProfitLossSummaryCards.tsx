'use client';

import type { FinanceWindowTotals } from '@kiditem/shared/finance';
import { AD_ACCOUNT_ADJUSTMENT_LABEL, PROFIT_AD_COST_LABEL } from '@/lib/ad-spend-labels';
import { cn, formatKRW, formatPercent, getAdCostColor, getProfitColor } from '@/lib/utils';

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
 * What the month total carries beyond its product rows, each part by its
 * cause: ad cost on listings that sold nothing and shipping no line revenue
 * can weigh. The account adjustment has its own line on the ad cost card. The server takes each part from exact values, so a
 * part of 0 or `null` is not listed and rounding never appears as one; the note
 * names the rounding every row applies instead.
 */
function unallocatedNote(totals: FinanceWindowTotals): string | null {
  const parts: string[] = [];
  if (totals.unallocatedAdCost) {
    parts.push(`판매 없는 상품의 ${PROFIT_AD_COST_LABEL} ${won(totals.unallocatedAdCost)}`);
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
        <div className="card-label">{PROFIT_AD_COST_LABEL}</div>
        <div className={cn('card-value', getAdCostColor(totals.adCost))}>{won(totals.adCost)}</div>
        <div className="text-xs text-slate-400">{`매출 대비 ${formatPercent(totals.adCostRate)}`}</div>
        {/* 캠페인에 붙일 수 없는 정산. 광고비에 들어 있고 서버가 따로 준다(KID-368). */}
        {totals.adAccountAdjustment != null && (
          <div className="text-xs text-slate-400">
            {`${AD_ACCOUNT_ADJUSTMENT_LABEL} ${won(totals.adAccountAdjustment)} 포함`}
          </div>
        )}
      </div>
    </div>
  );
}
