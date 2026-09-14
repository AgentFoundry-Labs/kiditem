import {
  addDays,
  businessDateKey,
  kstBusinessDate,
  kstDayStart,
  kstMonthStart,
} from '@kiditem/shared/common';

export {
  addDays,
  businessDateKey,
  closedMonthRangeFromCutoff,
  currentBusinessDate,
  datesInclusive,
  evidenceCutoffDate,
  inclusiveDayCount,
  kstBusinessDate,
  kstDayStart,
  kstInclusiveDaysStart,
  kstMonthEnd,
  kstMonthRange,
  kstMonthStart,
  parseBusinessDate,
  resolveBusinessDate,
  shiftBusinessDateKey,
  toBusinessDate,
} from '@kiditem/shared/common';

/** Half-open timestamp window, `[from, to)`. */
export interface KstQueryWindow {
  from: Date;
  to: Date;
}

/** The KST calendar month `[first day 00:00, next month's first day 00:00)`. */
export function kstMonthWindow(year: number, month: number): KstQueryWindow {
  return { from: kstMonthStart(year, month), to: kstMonthStart(year, month + 1) };
}

/**
 * Clip a window forward to the KST business days already closed at `anchor`
 * ([ADR 0001](../../../../docs/adr/0001-dashboard-month-window-is-anchor-clipped.md)).
 * A window that ends before today is unchanged. A window with no closed day
 * yet — a month on its 1st, or a future month — becomes empty at `from`, so a
 * reader returns unavailable rather than admitting a same-day row or another
 * month's rows. The caller supplies `anchor`; this never reads the wall clock.
 */
export function clipToClosedKstDays(anchor: Date, window: KstQueryWindow): KstQueryWindow {
  const todayStart = kstDayStart(anchor);
  return {
    from: window.from,
    to: todayStart.getTime() <= window.from.getTime()
      ? window.from
      : todayStart.getTime() < window.to.getTime()
        ? todayStart
        : window.to,
  };
}

/**
 * The inclusive `YYYY-MM-DD` business dates a day-aligned `[from, to)` window
 * covers. An empty window yields `to` one day before `from`, which counts zero
 * days in the shared basis vocabulary.
 */
export function kstWindowDateRange(window: KstQueryWindow): { from: string; to: string } {
  const from = kstBusinessDate(window.from);
  const to = window.to.getTime() > window.from.getTime()
    ? kstBusinessDate(new Date(window.to.getTime() - 1))
    : addDays(from, -1);
  return { from: businessDateKey(from), to: businessDateKey(to) };
}
