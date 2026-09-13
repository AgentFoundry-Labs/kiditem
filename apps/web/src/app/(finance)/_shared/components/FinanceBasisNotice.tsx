import { Info } from 'lucide-react';
import { periodBasisStatus, type DashboardPeriodBasis } from '@kiditem/shared/dashboard';
import type { FinanceCostInputBasis, FinanceCostInputsBasis } from '@kiditem/shared/finance';

/** The evidence behind a finance window, as the server published it. */
export type FinanceBasisNoticeBasis = {
  /** The window asked for; the value bases cover its closed KST days. */
  requestedWindow?: { from: string; to: string };
  revenue: DashboardPeriodBasis;
  adCost?: DashboardPeriodBasis;
  profit?: DashboardPeriodBasis;
  /** Per cost component, the lines it does not apply to and the lines nobody measured. */
  costInputs?: FinanceCostInputsBasis;
} | null | undefined;

const WITHHELD = '그 상품의 순이익과 합계 순이익은 계산하지 않았습니다.';

/**
 * What one cost component's line counts say beside the values. A component
 * that does not apply is 0 by rule; one that applies without a source leaves
 * its listing's profit and the window total unavailable, while every other
 * listing keeps its measured profit.
 */
function costInputMessages(costInputs: FinanceCostInputsBasis): string[] {
  const messages: string[] = [];
  const notApplied = (subject: string, input: FinanceCostInputBasis, zero: string) => {
    if (input.notAppliedLines > 0) {
      messages.push(`${subject} 적용되지 않는 주문 라인 ${input.notAppliedLines}건은 ${zero}으로 계산했습니다.`);
    }
  };
  notApplied('판매수수료가', costInputs.commission, '0원');
  notApplied('기타비용이', costInputs.otherCost, '0원');
  notApplied('광고가', costInputs.advertising, '광고비 0원');

  const unmeasured = (label: string, input: FinanceCostInputBasis) => {
    if (input.unmeasuredLines > 0) {
      messages.push(`${label} 주문 라인 ${input.unmeasuredLines}건 — ${WITHHELD}`);
    }
  };
  unmeasured('판매수수료 원천이 없는', costInputs.commission);
  unmeasured('기타비용 원천이 없는', costInputs.otherCost);
  unmeasured('매입가가 없는', costInputs.purchaseCost);
  return messages;
}

/**
 * Says which window the values were evaluated over and which of its inputs
 * were not fully measured or do not apply. The values unmeasured inputs would
 * have produced arrive as `null` and render as `-`; this is the reason beside
 * them. The status word comes from the shared derivation, never from a word on
 * the wire.
 */
export function FinanceBasisNotice({ basis }: { basis: FinanceBasisNoticeBasis }) {
  if (!basis) return null;

  const messages: string[] = [];
  const requested = basis.requestedWindow;
  if (basis.revenue.targetDays === 0) {
    // The requested month has no closed day yet (the 1st, or a future month).
    messages.push(requested
      ? `아직 마감된 날이 없습니다 — ${requested.from} ~ ${requested.to} 합계는 첫 마감일 이후 표시합니다.`
      : '아직 마감된 날이 없습니다 — 합계는 첫 마감일 이후 표시합니다.');
  } else {
    if (requested && basis.revenue.to < requested.to) {
      messages.push(
        `${basis.revenue.from} ~ ${basis.revenue.to} 마감일 기준으로 집계했습니다 (요청 기간 ${requested.from} ~ ${requested.to}, 오늘 이후 제외).`,
      );
    }
    if (periodBasisStatus(basis.revenue) !== 'complete') {
      messages.push(
        `주문 수집 ${basis.revenue.includedDates.length}/${basis.revenue.targetDays}일 — 기간 합계와 비율은 모든 날짜가 수집된 뒤 표시합니다.`,
      );
    }
    if (basis.adCost && periodBasisStatus(basis.adCost) !== 'complete') {
      messages.push(
        `쿠팡 광고 수집 ${basis.adCost.includedDates.length}/${basis.adCost.targetDays}일 — 광고비와 순이익은 광고가 모든 날짜에 수집된 뒤 표시합니다.`,
      );
    }
    if (basis.costInputs) messages.push(...costInputMessages(basis.costInputs));
  }
  if (messages.length === 0) return null;

  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
    >
      <Info size={14} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
      <ul className="space-y-1">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
