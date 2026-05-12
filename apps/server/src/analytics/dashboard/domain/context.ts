import { kstDayStart } from '../../../common/kst';

interface DateRangeContext {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
}

export interface DashboardContext {
  now: Date;
  /** Effective anchor — equals `now` unless we shifted onto Drive replay data. */
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
  /** Set when the anchor was shifted away from `now` because the calendar period had no data. */
  anchorShifted: boolean;
}

/**
 * Build the full set of date boundaries the dashboard services need.
 *
 * `range`/`from`/`to` mirror the query-string contract:
 * - no args (or range='month')         → current calendar month vs previous month
 * - range='week'                        → last 7 days vs 7-14 days ago
 * - range='day'                         → today vs yesterday
 * - range='custom' + from + to (ISO)    → [from, to+1d) vs the preceding same-length window
 *
 * `effectiveAnchor` overrides the "today" the month/week/day windows are
 * computed against. We use this to fall back onto the latest Drive replay
 * date when the calendar month has no Order or Wing/Drive data, so the
 * dashboard surfaces the latest available month instead of an empty current
 * month.
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

  const year = anchor.getFullYear();
  const month = anchor.getMonth() + 1;
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const prevMonthDate = new Date(year, month - 2, 1);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonthNum = prevMonthDate.getMonth() + 1;

  const effectiveRange = range ?? 'month';
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  let dateRange: DateRangeContext;
  if (from && to) {
    const rangeEnd = new Date(to);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
    const duration = rangeEnd.getTime() - new Date(from).getTime();
    dateRange = {
      start: new Date(from),
      end: rangeEnd,
      prevStart: new Date(new Date(from).getTime() - duration),
      prevEnd: new Date(from),
    };
  } else if (effectiveRange === 'week') {
    dateRange = { start: weekStart, end: anchor, prevStart: prevWeekStart, prevEnd: weekStart };
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
