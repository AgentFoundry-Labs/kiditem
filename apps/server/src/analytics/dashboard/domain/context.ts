import { kstBusinessDate, kstDayStart, kstMonthStart } from '../../../common/kst';

interface DateRangeContext {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
}

export interface DashboardContext {
  now: Date;
  /** Effective anchor — equals `now` for production query context. */
  anchor: Date;
  todayStart: Date;
  todayEnd: Date;
  year: number;
  month: number;
  monthStart: Date;
  monthEnd: Date;
  prevMonthDate: Date;
  prevYear: number;
  prevMonthNum: number;
  dateRange: DateRangeContext;
  effectiveRange: string; // 'day' | 'week' | 'month' | 'custom' | original string
  /** Set only for explicit historical anchors supplied by deterministic callers. */
  anchorShifted: boolean;
}

/**
 * Build the full set of date boundaries the dashboard services need.
 *
 * `range`/`from`/`to` mirror the query-string contract:
 * - no args (or range='month')         → current calendar month vs previous month
 * - range='week'                        → the latest 7 closed KST days vs the preceding 7
 * - range='day'                         → today vs yesterday
 * - range='custom' + from + to (ISO)    → [from, to+1d) vs the preceding same-length window
 *
 * `effectiveAnchor` is retained for deterministic callers/tests that need to
 * evaluate a historical calendar. Production query context does not derive
 * it from source freshness: an absent selection always means the current KST
 * calendar, even when the current period has no rows.
 */
export function buildDashboardContext(
  range?: string,
  from?: string,
  to?: string,
  effectiveAnchor?: Date,
): DashboardContext {
  const now = new Date();
  const anchor = effectiveAnchor ?? now;
  const anchorShifted = effectiveAnchor !== undefined && effectiveAnchor.getTime() !== now.getTime();

  const todayStart = kstDayStart(anchor);
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const anchorBusinessDate = kstBusinessDate(anchor);
  const year = anchorBusinessDate.getUTCFullYear();
  const month = anchorBusinessDate.getUTCMonth() + 1;
  const monthStart = kstMonthStart(year, month);
  const monthEnd = nextKstMonthStart(year, month);
  const prevMonthDate = previousKstMonthStart(year, month);
  const prevYear = previousKstMonthParts(year, month).year;
  const prevMonthNum = previousKstMonthParts(year, month).month;

  const effectiveRange = range ?? 'month';
  const weekStart = new Date(todayStart.getTime() - 7 * 86_400_000);
  const prevWeekStart = new Date(todayStart.getTime() - 14 * 86_400_000);
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);

  let dateRange: DateRangeContext;
  if (from && to) {
    const rangeStart = parseKstDate(from);
    const rangeEnd = new Date(parseKstDate(to).getTime() + 86_400_000);
    const duration = rangeEnd.getTime() - rangeStart.getTime();
    dateRange = {
      start: rangeStart,
      end: rangeEnd,
      prevStart: new Date(rangeStart.getTime() - duration),
      prevEnd: rangeStart,
    };
  } else if (effectiveRange === 'week') {
    // Keep the period half-open and aligned with the approved Wing/UI
    // collection contract: [today-7d, today), never the partial current day.
    dateRange = { start: weekStart, end: todayStart, prevStart: prevWeekStart, prevEnd: weekStart };
  } else if (effectiveRange === 'day') {
    dateRange = { start: todayStart, end: todayEnd, prevStart: yesterdayStart, prevEnd: todayStart };
  } else {
    dateRange = { start: monthStart, end: monthEnd, prevStart: prevMonthDate, prevEnd: monthStart };
  }

  return {
    now,
    anchor,
    todayStart, todayEnd,
    year, month, monthStart, monthEnd,
    prevMonthDate, prevYear, prevMonthNum,
    dateRange, effectiveRange,
    anchorShifted,
  } satisfies DashboardContext;
}

function parseKstDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!) - 9 * 60 * 60 * 1000);
}

function nextKstMonthStart(year: number, month: number): Date {
  return month === 12
    ? kstMonthStart(year + 1, 1)
    : kstMonthStart(year, month + 1);
}

function previousKstMonthParts(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function previousKstMonthStart(year: number, month: number): Date {
  const previous = previousKstMonthParts(year, month);
  return kstMonthStart(previous.year, previous.month);
}
