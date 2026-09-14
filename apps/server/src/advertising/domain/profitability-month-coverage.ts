import { inclusiveDayCount, parseBusinessDate } from '../../common/kst';

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
  if (![input.factFrom, input.factTo, input.sliceFrom, input.sliceTo].every(validDate)) {
    return null;
  }
  const from = input.factFrom > input.sliceFrom ? input.factFrom : input.sliceFrom;
  const to = input.factTo < input.sliceTo ? input.factTo : input.sliceTo;
  if (from > to) return null;
  return {
    from,
    to,
    coveredDays: daysInclusive(from, to),
  };
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function daysInclusive(from: string, to: string): number {
  const start = parseBusinessDate(from);
  const end = parseBusinessDate(to);
  if (!start || !end) return 0;
  return inclusiveDayCount(start, end);
}
