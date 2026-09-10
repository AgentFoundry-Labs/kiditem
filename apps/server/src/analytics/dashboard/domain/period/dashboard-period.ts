import { enumerateDashboardDates } from '@kiditem/shared/dashboard';
import { kstBusinessDate, kstDayStart, kstMonthStart } from '../../../../common/kst';

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
 * - `wing_closed_day` — only closed KST days feed Wing traffic, so every
 *   preset window ends at the anchor's KST day start and the month window
 *   starts in the month containing *yesterday*.
 * - `ads_preset_clipped` — preset windows are clipped forward to the anchor's
 *   last completed KST day; a `day` preset is rewritten to yesterday.
 *
 * One rule cuts across all three: an explicit custom range stays exact,
 * including future dates, so missing coverage stays visible to the caller
 * instead of being silently trimmed away.
 */
export type DashboardSourceClass =
  | 'order_timestamps'
  | 'wing_closed_day'
  | 'ads_preset_clipped';

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

const DAY_MS = 86_400_000;

export function resolveDashboardPeriod(
  selection: DashboardPeriodSelection,
  anchor: Date,
  sourceClass: DashboardSourceClass,
): DashboardPeriodSet {
  const windows = sourceClass === 'wing_closed_day'
    ? wingClosedDayWindows(selection, anchor)
    : sourceClass === 'ads_preset_clipped'
      ? adsPresetClippedWindows(selection, anchor)
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
 * Rolling closed-day trend window for `/api/dashboard/trend`. The in-progress
 * KST day is excluded, so no partial row can shift the selected date set or
 * make a missing day look collected.
 *
 * Every trend source — orders, Wing traffic and account ads alike — reads this
 * one window, so the whole series obeys the `wing_closed_day` rule rather than
 * the per-source rules the selection-driven windows use.
 */
export function resolveTrendPeriod(
  range: string,
  anchor: Date,
): ResolvedDashboardPeriod {
  const days = trendDays(range);
  const to = kstDayStart(anchor);
  const from = new Date(to.getTime() - days * DAY_MS);
  return resolveExactPeriod({ from, to }, anchor, 'wing_closed_day');
}

/** Day count behind a `/api/dashboard/trend` range token. */
function trendDays(range: string): number {
  return range === '7d' ? 7 : range === '90d' ? 90 : 30;
}

/**
 * Wing window for one month of the six-month sales trend. The month containing
 * the anchor is still open, so it reads the closed-day month window; every
 * older month is already closed and stays exact.
 */
export function resolveWingMonthlyTrendPeriod(
  monthStart: Date,
  monthEnd: Date,
  anchor: Date,
): ResolvedDashboardPeriod {
  const { month } = closedWingMonthWindows(anchor);
  const periodStart = kstBusinessDate(monthStart);
  const currentMonthDate = kstBusinessDate(month.from);
  const window = periodStart.getUTCFullYear() === currentMonthDate.getUTCFullYear()
    && periodStart.getUTCMonth() === currentMonthDate.getUTCMonth()
    ? month
    : { from: monthStart, to: monthEnd };
  return resolveExactPeriod(window, anchor, 'wing_closed_day');
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
  const yesterday = kstBusinessDate(anchor);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10);
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

function wingClosedDayWindows(
  selection: DashboardPeriodSelection,
  anchor: Date,
): PeriodWindows {
  const { month, previousMonth } = closedWingMonthWindows(anchor);
  const todayStart = kstDayStart(anchor);
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);

  switch (selection.effectiveRange) {
    case 'day':
      return {
        selected: { from: yesterdayStart, to: todayStart },
        previousSelected: {
          from: new Date(yesterdayStart.getTime() - DAY_MS),
          to: yesterdayStart,
        },
        month,
        previousMonth,
      };
    case 'week':
      return {
        selected: {
          from: new Date(todayStart.getTime() - 7 * DAY_MS),
          to: todayStart,
        },
        previousSelected: {
          from: new Date(todayStart.getTime() - 14 * DAY_MS),
          to: new Date(todayStart.getTime() - 7 * DAY_MS),
        },
        month,
        previousMonth,
      };
    case 'custom':
      // An explicit range stays exact, future dates included.
      return {
        selected: { from: selection.dateRange.start, to: selection.dateRange.end },
        previousSelected: {
          from: selection.dateRange.prevStart,
          to: selection.dateRange.prevEnd,
        },
        month,
        previousMonth,
      };
    default:
      return { selected: month, previousSelected: previousMonth, month, previousMonth };
  }
}

function adsPresetClippedWindows(
  selection: DashboardPeriodSelection,
  anchor: Date,
): PeriodWindows {
  const preset = adPreset(selection.effectiveRange);
  return {
    selected: presetAdWindow(anchor, selection.dateRange.start, selection.dateRange.end, preset),
    previousSelected: previousPresetAdWindow(
      anchor,
      selection.dateRange.prevStart,
      selection.dateRange.prevEnd,
      preset,
    ),
    month: presetAdWindow(anchor, selection.monthStart, selection.monthEnd, 'month'),
    // The previous calendar month is already closed; clipping it would be a
    // no-op, and leaving it exact keeps the owner coverage report honest.
    previousMonth: { from: selection.prevMonthDate, to: selection.monthStart },
  };
}

type AdPreset = 'month' | 'day' | null;

function adPreset(effectiveRange: string): AdPreset {
  if (effectiveRange === 'day') return 'day';
  if (effectiveRange === 'month') return 'month';
  return null;
}

/**
 * Clip only the current preset windows. Custom and week windows stay exact so
 * future/uncovered dates remain visible in the owner's `coverage`.
 */
function presetAdWindow(
  anchor: Date,
  from: Date,
  to: Date,
  preset: AdPreset,
): DashboardQueryWindow {
  if (!preset) return { from, to };
  const todayStart = kstDayStart(anchor);
  if (preset === 'day') {
    return { from: new Date(todayStart.getTime() - DAY_MS), to: todayStart };
  }
  // Preset windows may query only through the last completed KST business day.
  // The explicit dashboard anchor is the cutoff; provider latest-row dates must
  // not shrink the requested range.
  return {
    from,
    // An all-current-day preset has no completed day yet. Keep the empty
    // half-open window so the owner adapter returns unavailable rather than
    // accidentally admitting a same-day row.
    to: todayStart.getTime() <= from.getTime()
      ? from
      : todayStart.getTime() < to.getTime()
        ? todayStart
        : to,
  };
}

function previousPresetAdWindow(
  anchor: Date,
  from: Date,
  to: Date,
  preset: AdPreset,
): DashboardQueryWindow {
  if (preset !== 'day') return { from, to };
  const yesterdayStart = new Date(kstDayStart(anchor).getTime() - DAY_MS);
  return {
    from: new Date(yesterdayStart.getTime() - DAY_MS),
    to: yesterdayStart,
  };
}

/**
 * Align Wing month reads with the web collection contract: only closed KST
 * days feed dashboard traffic, so the "current" month is the month containing
 * yesterday and it ends at the anchor's KST day start.
 */
function closedWingMonthWindows(anchor: Date): {
  month: DashboardQueryWindow;
  previousMonth: DashboardQueryWindow;
} {
  const todayStart = kstDayStart(anchor);
  const yesterdayBusinessDate = kstBusinessDate(new Date(todayStart.getTime() - DAY_MS));
  const year = yesterdayBusinessDate.getUTCFullYear();
  const month = yesterdayBusinessDate.getUTCMonth() + 1;
  const monthStart = kstMonthStart(year, month);
  const previousMonthStart = month === 1
    ? kstMonthStart(year - 1, 12)
    : kstMonthStart(year, month - 1);
  return {
    month: { from: monthStart, to: todayStart },
    previousMonth: { from: previousMonthStart, to: monthStart },
  };
}

/** KST business date of an instant, `YYYY-MM-DD`. */
export function businessDateText(value: Date): string {
  return kstBusinessDate(value).toISOString().slice(0, 10);
}
