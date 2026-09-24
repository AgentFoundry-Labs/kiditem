import { enumerateDashboardDates } from '@kiditem/shared/dashboard';
import {
  addDays,
  businessDateKey,
  clipToClosedKstDays,
  evidenceCutoffDate,
  kstBusinessDate,
  kstDayStart,
} from '../../../../common/kst';

/**
 * The single place the dashboard turns a period selection into query windows.
 *
 * A window is not just a pair of timestamps: every source closes its period on
 * a different rule, and the rule used to be re-derived inside each service and
 * each outgoing adapter. `DashboardSourceClass` names those rules so the set is
 * enumerable rather than implicit in three switch statements, and the resolved
 * value carries the KST business dates the window covers so adapters no longer
 * re-derive date keys or read the wall clock.
 *
 * The closure rules, as the dashboard actually applies them:
 *
 * - `order_timestamps` — the selected calendar window verbatim, half-open
 *   `[from, to)`. `day`/`month` selections therefore include the in-progress
 *   KST day; order rows exist for it.
 * - `closed_day_clipped` — only closed KST days feed Wing traffic and
 *   owner-published account ad rows, so a preset window is clipped forward to
 *   the anchor's last completed KST day and a `day` preset is rewritten to
 *   yesterday.
 * - `closed_day_month` — a profit reads orders and the ad sweep together, and
 *   both can only have covered closed days, so a month window — the anchor's
 *   month, or a month selection — is clipped the same way. A day, week or
 *   custom selection keeps its calendar window, as under `order_timestamps`.
 *
 * Every rule takes the month from the *anchor's* calendar month, so no month
 * value is ever built from a period other than the one it is labelled with.
 * Under the clipping rules that month is empty on the 1st; the affected cards
 * showing nothing is the intended outcome, not a window to widen — see
 * `docs/adr/0001-dashboard-month-window-is-anchor-clipped.md`.
 *
 * One rule cuts across all of them: an explicit custom range stays exact, including
 * future dates, so missing coverage stays visible to the caller instead of
 * being silently trimmed away.
 */
export type DashboardSourceClass =
  | 'order_timestamps'
  | 'closed_day_clipped'
  | 'closed_day_month';

/** Half-open timestamp window, `[from, to)`. */
export interface DashboardQueryWindow {
  from: Date;
  to: Date;
}

export interface ResolvedDashboardPeriod {
  sourceClass: DashboardSourceClass;
  /**
   * Contiguous, sorted, unique `YYYY-MM-DD` KST business dates covered by
   * `queryWindow`. Empty when the window is empty.
   */
  selectedDates: string[];
  queryWindow: DashboardQueryWindow;
  /**
   * Last KST business date the resolving anchor treats as closed. Adapters use
   * it as their coverage cutoff instead of reading the wall clock, which is
   * what keeps an injected anchor authoritative all the way down.
   */
  knownThrough: string;
}

/**
 * The four windows every period-aware dashboard read needs. `month` /
 * `previousMonth` are the calendar months the effective-period label is built
 * from; `selected` / `previousSelected` follow the caller's range selection.
 */
export interface DashboardPeriodSet {
  sourceClass: DashboardSourceClass;
  selected: ResolvedDashboardPeriod;
  previousSelected: ResolvedDashboardPeriod;
  month: ResolvedDashboardPeriod;
  previousMonth: ResolvedDashboardPeriod;
}

/**
 * Structural view of the calendar a selection resolves to. `DashboardContext`
 * satisfies this; the module declares its own shape so `domain/**` keeps no
 * dependency on application contracts.
 */
export interface DashboardPeriodSelection {
  /** 'day' | 'week' | 'month' | 'custom'; any other value behaves as 'month'. */
  effectiveRange: string;
  dateRange: {
    start: Date;
    end: Date;
    prevStart: Date;
    prevEnd: Date;
  };
  monthStart: Date;
  monthEnd: Date;
  prevMonthDate: Date;
}

export function resolveDashboardPeriod(
  selection: DashboardPeriodSelection,
  anchor: Date,
  sourceClass: DashboardSourceClass,
): DashboardPeriodSet {
  const windows = sourceClass === 'closed_day_clipped'
    ? closedDayClippedWindows(selection, anchor)
    : sourceClass === 'closed_day_month'
      ? closedDayMonthWindows(selection, anchor)
      : orderTimestampWindows(selection);

  return {
    sourceClass,
    selected: resolveExactPeriod(windows.selected, anchor, sourceClass),
    previousSelected: resolveExactPeriod(windows.previousSelected, anchor, sourceClass),
    month: resolveExactPeriod(windows.month, anchor, sourceClass),
    previousMonth: resolveExactPeriod(windows.previousMonth, anchor, sourceClass),
  };
}

/**
 * Wing window for one month of the six-month sales trend. The anchor's own
 * month is still open, so it is clipped to closed days like every other month
 * window; every older month is already closed and stays exact.
 */
export function resolveWingMonthlyTrendPeriod(
  monthStart: Date,
  monthEnd: Date,
  anchor: Date,
): ResolvedDashboardPeriod {
  const periodStart = kstBusinessDate(monthStart);
  const anchorDate = kstBusinessDate(anchor);
  const window = periodStart.getUTCFullYear() === anchorDate.getUTCFullYear()
    && periodStart.getUTCMonth() === anchorDate.getUTCMonth()
    ? clipToClosedKstDays(anchor, { from: monthStart, to: monthEnd })
    : { from: monthStart, to: monthEnd };
  return resolveExactPeriod(window, anchor, 'closed_day_clipped');
}

/**
 * KST business dates touched by a half-open `[from, to)` timestamp window. The
 * last date is the one containing the final instant before `to`, so a
 * day-aligned end excludes its own date and a mid-day end includes it.
 */
export function businessDatesInWindow(from: Date, to: Date): string[] {
  if (from.getTime() >= to.getTime()) return [];
  return enumerateDashboardDates(
    businessDateText(from),
    businessDateText(new Date(to.getTime() - 1)),
  );
}

/** Last KST business date an anchor treats as closed. */
function knownThroughDate(anchor: Date): string {
  return businessDateKey(evidenceCutoffDate(anchor));
}

/**
 * Resolve a window whose bounds are already decided into the resolved shape.
 * Every resolver above ends here, and a caller with its own exact window (a
 * historical trend month, for example) gets the same treatment.
 */
export function resolveExactPeriod(
  queryWindow: DashboardQueryWindow,
  anchor: Date,
  sourceClass: DashboardSourceClass,
): ResolvedDashboardPeriod {
  return {
    sourceClass,
    selectedDates: businessDatesInWindow(queryWindow.from, queryWindow.to),
    queryWindow,
    knownThrough: knownThroughDate(anchor),
  };
}

interface PeriodWindows {
  selected: DashboardQueryWindow;
  previousSelected: DashboardQueryWindow;
  month: DashboardQueryWindow;
  previousMonth: DashboardQueryWindow;
}

function orderTimestampWindows(selection: DashboardPeriodSelection): PeriodWindows {
  return {
    selected: { from: selection.dateRange.start, to: selection.dateRange.end },
    previousSelected: {
      from: selection.dateRange.prevStart,
      to: selection.dateRange.prevEnd,
    },
    month: { from: selection.monthStart, to: selection.monthEnd },
    previousMonth: { from: selection.prevMonthDate, to: selection.monthStart },
  };
}

function closedDayClippedWindows(
  selection: DashboardPeriodSelection,
  anchor: Date,
): PeriodWindows {
  const preset = closedDayPreset(selection.effectiveRange);
  return {
    selected: presetWindow(anchor, selection.dateRange.start, selection.dateRange.end, preset),
    previousSelected: previousPresetWindow(
      anchor,
      selection.dateRange.prevStart,
      selection.dateRange.prevEnd,
      preset,
    ),
    // The month is the anchor's calendar month under the same clip. Anchoring
    // it on yesterday instead would, on the 1st, answer a September question
    // with August's rows.
    month: clipToClosedKstDays(anchor, { from: selection.monthStart, to: selection.monthEnd }),
    // The previous calendar month is already closed; clipping it would be a
    // no-op, and leaving it exact keeps the owner coverage report honest.
    previousMonth: { from: selection.prevMonthDate, to: selection.monthStart },
  };
}

/**
 * `order_timestamps` windows whose months are clipped to the anchor's closed
 * KST days: the anchor's month always, the selection only when it is a month.
 * The previous windows stay exact, as under `order_timestamps`.
 */
function closedDayMonthWindows(
  selection: DashboardPeriodSelection,
  anchor: Date,
): PeriodWindows {
  const windows = orderTimestampWindows(selection);
  return {
    ...windows,
    selected: closedDayPreset(selection.effectiveRange) === 'month'
      ? clipToClosedKstDays(anchor, windows.selected)
      : windows.selected,
    month: clipToClosedKstDays(anchor, windows.month),
  };
}

type ClosedDayPreset = 'month' | 'day' | null;

function closedDayPreset(effectiveRange: string): ClosedDayPreset {
  if (effectiveRange === 'day') return 'day';
  // A week selection is already built from closed days, and an explicit custom
  // range stays exact so uncovered/future dates remain visible in the owner's
  // `coverage`. Anything else is a month selection.
  if (effectiveRange === 'week' || effectiveRange === 'custom') return null;
  return 'month';
}

function presetWindow(
  anchor: Date,
  from: Date,
  to: Date,
  preset: ClosedDayPreset,
): DashboardQueryWindow {
  if (!preset) return { from, to };
  if (preset === 'day') {
    const todayStart = kstDayStart(anchor);
    return { from: addDays(todayStart, -1), to: todayStart };
  }
  // The anchor is the cutoff; provider latest-row dates must not shrink the
  // requested range, and a window with no closed day yet stays empty.
  return clipToClosedKstDays(anchor, { from, to });
}

function previousPresetWindow(
  anchor: Date,
  from: Date,
  to: Date,
  preset: ClosedDayPreset,
): DashboardQueryWindow {
  if (preset !== 'day') return { from, to };
  const yesterdayStart = addDays(kstDayStart(anchor), -1);
  return {
    from: addDays(yesterdayStart, -1),
    to: yesterdayStart,
  };
}


/** KST business date of an instant, `YYYY-MM-DD`. */
/**
 * The calendar month a resolved period is, as `YYYY-MM`, when its dates run
 * from a month's first day through its last; `null` for any other window. A
 * source that publishes whole months (Sellpia's product sales) can answer
 * only such a period.
 */
export function wholeCalendarMonth(period: ResolvedDashboardPeriod): string | null {
  const dates = period.selectedDates;
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last || !first.endsWith('-01')) return null;
  const yearMonth = first.slice(0, 7);
  if (last.slice(0, 7) !== yearMonth) return null;
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return dates.length === daysInMonth ? yearMonth : null;
}

export function businessDateText(value: Date): string {
  return businessDateKey(kstBusinessDate(value));
}
