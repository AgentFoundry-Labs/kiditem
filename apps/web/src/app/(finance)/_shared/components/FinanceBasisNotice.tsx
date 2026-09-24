import { Info } from 'lucide-react';
import { periodBasisStatus, type DashboardPeriodBasis } from '@kiditem/shared/dashboard';
import { periodDaysText } from '@/lib/period-days';
import {
  financeCostInputState,
  type FinanceCostInputBasis,
  type FinanceCostInputsBasis,
} from '@kiditem/shared/finance';

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
 * A component that does not apply is 0 by rule. The shared evidence state
 * decides the wording: Not applied to every line of the window, or to some.
 */
function notAppliedMessage(subject: string, zero: string, input: FinanceCostInputBasis): string | null {
  switch (financeCostInputState(input)) {
    case 'empty':
      return null;
    case 'not_applied':
      return `${subject} 적용되지 않아 주문 라인 ${input.lines}건 모두 ${zero}으로 계산했습니다.`;
    default:
      return input.notAppliedLines > 0
        ? `${subject} 적용되지 않는 주문 라인 ${input.notAppliedLines}건은 ${zero}으로 계산했습니다.`
        : null;
  }
}

/**
 * A component Not measured on some or all of the lines it applies to leaves
 * those listings' profit and the window total unavailable, while every other
 * listing keeps its measured profit.
 */
function unmeasuredMessage(label: string, input: FinanceCostInputBasis): string | null {
  switch (financeCostInputState(input)) {
    case 'not_measured':
    case 'partial':
      return `${label} 주문 라인 ${input.unmeasuredLines}건 — ${WITHHELD}`;
    default:
      return null;
  }
}

/** What the cost components' line counts say beside the values. */
function costInputMessages(costInputs: FinanceCostInputsBasis): string[] {
  return [
    notAppliedMessage('판매수수료가', '0원', costInputs.commission),
    notAppliedMessage('기타비용이', '0원', costInputs.otherCost),
    notAppliedMessage('광고가', '광고비 0원', costInputs.advertising),
    unmeasuredMessage('판매수수료 원천이 없는', costInputs.commission),
    unmeasuredMessage('기타비용 원천이 없는', costInputs.otherCost),
    unmeasuredMessage('매입가가 없는', costInputs.purchaseCost),
    // Lines sold under no listing option have no product row to withhold.
    costInputs.unmappedLines > 0
      ? `상품 옵션에 연결되지 않은 주문 라인 ${costInputs.unmappedLines}건 — 상품 행이 없어 매출 합계에만 포함했고, 합계 순이익은 계산하지 않았습니다.`
      : null,
  ].filter((message): message is string => message !== null);
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
        `주문 수집 ${periodDaysText(basis.revenue)} — 기간 합계와 비율은 모든 날짜가 수집된 뒤 표시합니다.`,
      );
    }
    if (basis.adCost && periodBasisStatus(basis.adCost) !== 'complete') {
      messages.push(
        `쿠팡 광고 수집 ${periodDaysText(basis.adCost)} — 광고비와 순이익은 광고가 모든 날짜에 수집된 뒤 표시합니다.`,
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
