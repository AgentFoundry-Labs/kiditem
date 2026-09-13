import { Info } from 'lucide-react';
import { periodBasisStatus, type DashboardPeriodBasis } from '@kiditem/shared/dashboard';

/** The evidence behind a finance window, as the server published it. */
export type FinanceBasisNoticeBasis = {
  /** The window asked for; the value bases cover its closed KST days. */
  requestedWindow?: { from: string; to: string };
  revenue: DashboardPeriodBasis;
  adCost?: DashboardPeriodBasis;
  profit?: DashboardPeriodBasis;
} | null | undefined;

/**
 * Says which window the values were evaluated over and which of its inputs
 * were not fully measured. The values those inputs would have produced arrive
 * as `null` and render as `-`; this is the reason beside them. The status word
 * comes from the shared derivation, never from a word on the wire.
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
    if (basis.profit && basis.profit.invalidDates.length > 0) {
      messages.push('원가·수수료·기타비용이 등록되지 않은 주문 라인이 있어 순이익을 계산하지 않았습니다.');
    }
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
