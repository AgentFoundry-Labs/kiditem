import { businessDateKey, inclusiveDayCount, parseBusinessDate } from '../../common/kst';

export type ProfitabilityMonthCoverage = Readonly<{
  from: string;
  to: string;
  coveredDays: number;
}>;

export function clampProfitabilityMonthCoverage(input: Readonly<{
  factFrom: string;
  factTo: string;
  sliceFrom: string;
  sliceTo: string;
}>): ProfitabilityMonthCoverage | null {
  const factFrom = parseBusinessDate(input.factFrom);
  const factTo = parseBusinessDate(input.factTo);
  const sliceFrom = parseBusinessDate(input.sliceFrom);
  const sliceTo = parseBusinessDate(input.sliceTo);
  if (!factFrom || !factTo || !sliceFrom || !sliceTo) return null;
  const from = factFrom.getTime() > sliceFrom.getTime() ? factFrom : sliceFrom;
  const to = factTo.getTime() < sliceTo.getTime() ? factTo : sliceTo;
  if (from.getTime() > to.getTime()) return null;
  return {
    from: businessDateKey(from),
    to: businessDateKey(to),
    coveredDays: inclusiveDayCount(from, to),
  };
}
