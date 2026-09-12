export * from './schemas/common.js';

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Formats a normalized `@db.Date` value without applying a timezone shift. */
export function businessDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parses an exact calendar date into the UTC-midnight form used by Prisma `@db.Date`. */
export function parseBusinessDate(value: string): Date | null {
  const match = BUSINESS_DATE_PATTERN.exec(value);
  if (!match) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || businessDateKey(parsed) !== value) {
    return null;
  }
  return parsed;
}

/** Converts a provider calendar value or timestamp to the canonical KST business date. */
export function toBusinessDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const looseDate = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (looseDate) {
    const normalized = `${looseDate[1]}-${String(Number(looseDate[2])).padStart(2, '0')}-${String(Number(looseDate[3])).padStart(2, '0')}`;
    return parseBusinessDate(normalized);
  }
  if (!trimmed.includes('T')) return null;
  const instant = new Date(trimmed);
  return Number.isFinite(instant.getTime()) ? kstBusinessDate(instant) : null;
}

/** Returns the UTC-midnight database key for the calendar date containing `date` in Korea. */
export function kstBusinessDate(date: Date): Date {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ));
}

/** Returns the instant at which the calendar date containing `date` began in Korea. */
export function kstDayStart(date: Date): Date {
  return new Date(kstBusinessDate(date).getTime() - KST_OFFSET_MS);
}

/** Returns the latest fully closed Korean business date. */
export function evidenceCutoffDate(now: Date = new Date()): Date {
  return addDays(kstBusinessDate(now), -1);
}

/** Compatibility name used by source owners for today's KST database key. */
export function currentBusinessDate(now: Date = new Date()): Date {
  return kstBusinessDate(now);
}

/** Selects the first valid input date, falling back to today's KST database key. */
export function resolveBusinessDate(
  ...candidates: Array<string | undefined | null>
): Date {
  for (const candidate of candidates) {
    const parsed = toBusinessDate(candidate);
    if (parsed) return parsed;
  }
  return currentBusinessDate();
}

/** Adds whole calendar days to a normalized business date. */
export function addDays(date: Date, amount: number): Date {
  return new Date(date.getTime() + Math.trunc(amount) * DAY_MS);
}

/** Shifts an exact business-date key without consulting a host/browser timezone. */
export function shiftBusinessDateKey(value: string, amount: number): string {
  const parsed = parseBusinessDate(value);
  if (!parsed) throw new Error('Expected YYYY-MM-DD');
  return businessDateKey(addDays(parsed, amount));
}

export interface BusinessDateRange {
  from: string;
  to: string;
}

/**
 * Resolves the current calendar month's closed dates from a server cutoff.
 * The calendar anchor is the day after the cutoff, so a cutoff on the final
 * day of the previous month represents an empty current-month window.
 */
export function closedMonthRangeFromCutoff(
  knownThrough: string,
): BusinessDateRange | null {
  const anchor = shiftBusinessDateKey(knownThrough, 1);
  const from = `${anchor.slice(0, 7)}-01`;
  return knownThrough < from ? null : { from, to: knownThrough };
}

/** Enumerates normalized business dates in an inclusive range. */
export function datesInclusive(from: Date, to: Date): Date[] {
  const result: Date[] = [];
  for (let cursor = from; cursor.getTime() <= to.getTime(); cursor = addDays(cursor, 1)) {
    result.push(cursor);
  }
  return result;
}

/** Counts an inclusive whole-day span without allocating its date vector. */
export function inclusiveDayCount(from: Date, to: Date): number {
  const span = to.getTime() - from.getTime();
  if (!Number.isFinite(span) || span < 0) return 0;
  return Math.floor(span / DAY_MS) + 1;
}

/** Returns the final calendar day for a YYYY-MM value as YYYY-MM-DD. */
export function kstMonthEnd(yearMonth: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(yearMonth);
  if (!match) throw new Error('Expected YYYY-MM');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${match[1]}-${match[2]}-${String(day).padStart(2, '0')}`;
}

/** Returns the newest `count` calendar months ending at a complete cutoff. */
export function kstMonthRange(targetCutoff: string, count: number): string[] {
  const match = /^(\d{4})-(0[1-9]|1[0-2])-\d{2}$/.exec(targetCutoff);
  if (!match || kstMonthEnd(`${match[1]}-${match[2]}`) !== targetCutoff) {
    throw new Error('Expected a complete YYYY-MM-DD cutoff');
  }
  const normalizedCount = Math.max(1, Math.floor(count));
  const year = Number(match[1]);
  const month = Number(match[2]);
  return Array.from({ length: normalizedCount }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (normalizedCount - 1 - index), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/** Returns the instant at which a Korean calendar month starts. */
export function kstMonthStart(year: number, month: number): Date {
  const normalized = new Date(Date.UTC(year, month - 1, 1));
  return new Date(normalized.getTime() - KST_OFFSET_MS);
}

/** Returns the first instant in an inclusive rolling window of Korean calendar days. */
export function kstInclusiveDaysStart(days: number, now = new Date()): Date {
  const normalizedDays = Math.max(1, Math.floor(days));
  return addDays(kstDayStart(now), -(normalizedDays - 1));
}
