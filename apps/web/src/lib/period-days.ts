import type { z } from 'zod';
import {
  enumerateDashboardDates,
  periodBasisStatus,
  type DashboardPeriodBasis,
  type TrafficCoverageSchema,
} from '@kiditem/shared/dashboard';

/** 판단에 필요한 만큼의 기간 근거 — 측정된 날짜와 대상 일수, 조회 실패 원천. */
export type PeriodDaysBasis = Pick<DashboardPeriodBasis, 'includedDates' | 'targetDays' | 'queryFailedSources'>;

/**
 * "N/M일" 문구는 여기 한 곳에서 만든다(KID-232). 부분인지 아닌지는 화면이 스스로 세지 않고
 * `periodBasisStatus` 가 정한다(ADR-0006) — 대시보드 · 상품 허브 · 재무 안내가 같은 판단을 쓴다.
 */
export function periodDaysText(basis: PeriodDaysBasis): string {
  return `${basis.includedDates.length}/${basis.targetDays}일`;
}

/** 일부 날짜만 측정된 기간이면 "부분 N/M일", 아니면 null. */
export function partialPeriodDaysText(basis: PeriodDaysBasis): string | null {
  return periodBasisStatus(basis) === 'partial' ? `부분 ${periodDaysText(basis)}` : null;
}

/** 다 측정되면 "M/M일", 일부면 "부분 N/M일", 측정이 없으면 null. */
export function periodCoverageDaysText(basis: PeriodDaysBasis): string | null {
  const status = periodBasisStatus(basis);
  if (status === 'complete') return periodDaysText(basis);
  if (status === 'partial') return `부분 ${periodDaysText(basis)}`;
  return null;
}

/** Wing 트래픽 coverage(빠진 날짜 목록)를 같은 판단에 넣을 수 있는 기간 근거로 읽는다. */
export function trafficCoverageBasis(
  coverage: z.infer<typeof TrafficCoverageSchema>,
): PeriodDaysBasis {
  const missing = new Set(coverage.missingDates);
  return {
    includedDates: enumerateDashboardDates(coverage.from, coverage.to).filter((date) => !missing.has(date)),
    targetDays: coverage.targetDays,
  };
}
