import { shiftBusinessDateKey } from '@kiditem/shared/common';

/** 한 계정의 광고 보고서 실행이 확정한 창(달력일, 양 끝 포함). */
export type AdReportWindow = Readonly<{ channelAccountId: string; start: string; end: string }>;

/**
 * 조직이 광고를 "측정한 날"(KID-45·372): 활성 쿠팡 계정 **모두**가 성공한 `advertising.ad_report` 실행의 확정 창으로
 * 덮은 달력일. 한 계정이라도 창 밖이면 그날은 측정하지 않은 날이고, 소비처는 0으로 메우지 않는다(옛 원장의
 * `coveredDates` HAVING COUNT(DISTINCT account) = active_accounts 규칙과 같다). 측정한 날인데 행이 없으면 "측정했는데 0".
 *
 * `from`(포함)·`to`(제외)는 달력일 `YYYY-MM-DD`. 활성 계정이 없으면 측정한 날도 없다.
 */
export function measuredAdDates(input: Readonly<{
  activeAccountIds: readonly string[];
  windows: readonly AdReportWindow[];
  from?: string;
  to?: string;
}>): string[] {
  const accounts = new Set(input.activeAccountIds);
  if (accounts.size === 0) return [];
  const datesByAccount = new Map<string, Set<string>>();
  for (const id of accounts) datesByAccount.set(id, new Set());
  for (const window of input.windows) {
    const dates = datesByAccount.get(window.channelAccountId);
    if (!dates) continue;
    for (let day = window.start; day <= window.end; day = shiftBusinessDateKey(day, 1)) {
      if (input.from && day < input.from) continue;
      if (input.to && day >= input.to) break;
      dates.add(day);
    }
  }
  const [first, ...rest] = [...datesByAccount.values()];
  const measured = [...first].filter((day) => rest.every((dates) => dates.has(day)));
  return measured.sort();
}
