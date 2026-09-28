/**
 * 셀피아 이익의 광고비가 측정값인가(ADR-0006, KID-45): 요청 기간 중 닫힌 날(`knownThrough`까지)을 광고 보고서가
 * **모두** 측정했을 때만이다. 일부만 측정한 창의 합은 광고비를 적게 잡아 이익을 부풀리므로 보류(null)한다 — 손익
 * (`per-listing-profit` `coversWindow`)과 같은 답. 매출이 있는 날로 좁히는 교집합은 이 판정 뒤의 일이다.
 */
export function profitAdCostMeasured(input: Readonly<{
  requestedDates: readonly string[];
  knownThrough: string;
  measuredAdDates: ReadonlySet<string>;
}>): boolean {
  const closed = input.requestedDates.filter((date) => date <= input.knownThrough);
  return closed.length > 0 && closed.every((date) => input.measuredAdDates.has(date));
}
