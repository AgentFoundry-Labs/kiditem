// Period resolution is one module with one interface, so this is where every
// closure rule is asserted. The closed-day cases below were previously reached
// by exporting a helper out of `dashboard-sales.service.ts` purely for a test;
// they now go through `resolveDashboardPeriod` like production does.

import { describe, expect, it } from 'vitest';

import { buildDashboardContext } from '../context';
import {
  businessDatesInWindow,
  resolveDashboardPeriod,
  resolveWingMonthlyTrendPeriod,
  type ResolvedDashboardPeriod,
} from './dashboard-period';

const ANCHOR = new Date('2026-09-08T00:30:00.000Z'); // 2026-09-08 09:30 KST

function isoWindow(period: ResolvedDashboardPeriod): [string, string] {
  return [
    period.queryWindow.from.toISOString(),
    period.queryWindow.to.toISOString(),
  ];
}

describe('resolveDashboardPeriod — closed_day_clipped', () => {
  it('matches the closed KST collection periods and preserves custom dates', () => {
    const month = resolveDashboardPeriod(
      buildDashboardContext('month', undefined, undefined, ANCHOR),
      ANCHOR,
      'closed_day_clipped',
    );
    expect(isoWindow(month.month)).toEqual([
      '2026-08-31T15:00:00.000Z',
      '2026-09-07T15:00:00.000Z',
    ]);
    expect(isoWindow(month.previousMonth)).toEqual([
      '2026-07-31T15:00:00.000Z',
      '2026-08-31T15:00:00.000Z',
    ]);

    const day = resolveDashboardPeriod(
      buildDashboardContext('day', undefined, undefined, ANCHOR),
      ANCHOR,
      'closed_day_clipped',
    );
    expect(isoWindow(day.selected)).toEqual([
      '2026-09-06T15:00:00.000Z',
      '2026-09-07T15:00:00.000Z',
    ]);
    expect(isoWindow(day.previousSelected)).toEqual([
      '2026-09-05T15:00:00.000Z',
      '2026-09-06T15:00:00.000Z',
    ]);

    const week = resolveDashboardPeriod(
      buildDashboardContext('week', undefined, undefined, ANCHOR),
      ANCHOR,
      'closed_day_clipped',
    );
    expect(isoWindow(week.selected)).toEqual([
      '2026-08-31T15:00:00.000Z',
      '2026-09-07T15:00:00.000Z',
    ]);
    expect(isoWindow(week.previousSelected)).toEqual([
      '2026-08-24T15:00:00.000Z',
      '2026-08-31T15:00:00.000Z',
    ]);

    const custom = resolveDashboardPeriod(
      buildDashboardContext('custom', '2026-09-01', '2026-09-07', ANCHOR),
      ANCHOR,
      'closed_day_clipped',
    );
    expect(isoWindow(custom.selected)).toEqual([
      '2026-08-31T15:00:00.000Z',
      '2026-09-07T15:00:00.000Z',
    ]);
    expect(isoWindow(custom.previousSelected)).toEqual([
      '2026-08-24T15:00:00.000Z',
      '2026-08-31T15:00:00.000Z',
    ]);
  });

  it('takes its calendar from the injected anchor, not the wall clock', () => {
    const historical = new Date('2026-03-04T00:30:00.000Z');
    const period = resolveDashboardPeriod(
      buildDashboardContext('month', undefined, undefined, historical),
      historical,
      'closed_day_clipped',
    );
    expect(isoWindow(period.month)).toEqual([
      '2026-02-28T15:00:00.000Z',
      '2026-03-03T15:00:00.000Z',
    ]);
    expect(period.month.knownThrough).toBe('2026-03-03');
  });

  it('clips a preset month forward to the last completed KST day', () => {
    const anchor = new Date('2026-09-08T03:00:00.000Z');
    const period = resolveDashboardPeriod(
      buildDashboardContext('month', undefined, undefined, anchor),
      anchor,
      'closed_day_clipped',
    );
    expect(isoWindow(period.month)).toEqual([
      '2026-08-31T15:00:00.000Z',
      '2026-09-07T15:00:00.000Z',
    ]);
  });

  it('rewrites a day preset to yesterday and the day before it', () => {
    const anchor = new Date('2026-09-08T03:00:00.000Z');
    const period = resolveDashboardPeriod(
      buildDashboardContext('day', undefined, undefined, anchor),
      anchor,
      'closed_day_clipped',
    );
    expect(isoWindow(period.selected)).toEqual([
      '2026-09-06T15:00:00.000Z',
      '2026-09-07T15:00:00.000Z',
    ]);
    expect(isoWindow(period.previousSelected)).toEqual([
      '2026-09-05T15:00:00.000Z',
      '2026-09-06T15:00:00.000Z',
    ]);
  });

  it('leaves a custom range exact so uncovered dates stay visible', () => {
    const ctx = buildDashboardContext('custom', '2026-09-01', '2026-09-30', ANCHOR);
    const period = resolveDashboardPeriod(ctx, ANCHOR, 'closed_day_clipped');
    expect(period.selected.queryWindow).toEqual({
      from: ctx.dateRange.start,
      to: ctx.dateRange.end,
    });
    expect(period.selected.selectedDates.at(-1)).toBe('2026-09-30');
  });

  it('keeps an all-current-day preset month empty rather than admitting today', () => {
    // 2026-09-01 09:00 KST: the month has no completed day yet.
    const anchor = new Date('2026-09-01T00:00:00.000Z');
    const period = resolveDashboardPeriod(
      buildDashboardContext('month', undefined, undefined, anchor),
      anchor,
      'closed_day_clipped',
    );
    expect(period.month.queryWindow.from).toEqual(period.month.queryWindow.to);
    expect(period.month.selectedDates).toEqual([]);
  });

  // ADR 0001: the month window is the anchor's calendar month clipped forward
  // to the last closed KST business day, so it grows one day at a time from an
  // empty 1st.
  it.each([
    { day: '2026-09-01', dates: [] },
    { day: '2026-09-02', dates: ['2026-09-01'] },
    { day: '2026-09-03', dates: ['2026-09-01', '2026-09-02'] },
  ])('covers the closed days of the anchor month on $day', ({ day, dates }) => {
    const anchor = new Date(`${day}T03:00:00.000Z`); // 12:00 KST
    const period = resolveDashboardPeriod(
      buildDashboardContext('month', undefined, undefined, anchor),
      anchor,
      'closed_day_clipped',
    );
    expect(period.month.selectedDates).toEqual(dates);
  });

  it('anchors the month on the anchor, never on the month containing yesterday', () => {
    // 2026-09-01 12:00 KST. Anchoring on yesterday read all of August here,
    // which `/api/dashboard/sales` then published under a September heading.
    const anchor = new Date('2026-09-01T03:00:00.000Z');
    const period = resolveDashboardPeriod(
      buildDashboardContext('month', undefined, undefined, anchor),
      anchor,
      'closed_day_clipped',
    );
    expect(isoWindow(period.month)).toEqual([
      '2026-08-31T15:00:00.000Z',
      '2026-08-31T15:00:00.000Z',
    ]);
    // A month selection resolves its own window the same way.
    expect(period.selected.selectedDates).toEqual([]);
    // August stays reachable, but only as the previous month.
    expect(isoWindow(period.previousMonth)).toEqual([
      '2026-07-31T15:00:00.000Z',
      '2026-08-31T15:00:00.000Z',
    ]);
    expect(period.previousMonth.selectedDates).toHaveLength(31);
  });
});

describe('resolveDashboardPeriod — order_timestamps', () => {
  it('keeps the selected calendar window verbatim, in-progress day included', () => {
    const ctx = buildDashboardContext('month', undefined, undefined, ANCHOR);
    const period = resolveDashboardPeriod(ctx, ANCHOR, 'order_timestamps');

    expect(period.month.queryWindow).toEqual({ from: ctx.monthStart, to: ctx.monthEnd });
    expect(period.previousMonth.queryWindow).toEqual({
      from: ctx.prevMonthDate,
      to: ctx.monthStart,
    });
    expect(period.selected.queryWindow).toEqual({
      from: ctx.dateRange.start,
      to: ctx.dateRange.end,
    });
    expect(period.previousSelected.queryWindow).toEqual({
      from: ctx.dateRange.prevStart,
      to: ctx.dateRange.prevEnd,
    });
  });
});

describe('resolved date sets', () => {
  it('publishes contiguous, sorted, unique KST business dates for the window', () => {
    const anchor = new Date('2026-09-08T03:00:00.000Z');
    const period = resolveDashboardPeriod(
      buildDashboardContext('week', undefined, undefined, anchor),
      anchor,
      'closed_day_clipped',
    );
    expect(period.selected.selectedDates).toEqual([
      '2026-09-01', '2026-09-02', '2026-09-03',
      '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07',
    ]);
    expect(new Set(period.selected.selectedDates).size)
      .toBe(period.selected.selectedDates.length);
  });

  it('excludes the end date of a day-aligned half-open window', () => {
    expect(businessDatesInWindow(
      new Date('2026-06-30T15:00:00.000Z'),
      new Date('2026-07-03T15:00:00.000Z'),
    )).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  });

  it('is empty for an empty or inverted window', () => {
    const instant = new Date('2026-07-01T00:00:00.000Z');
    expect(businessDatesInWindow(instant, instant)).toEqual([]);
    expect(businessDatesInWindow(new Date('2026-07-02T00:00:00.000Z'), instant)).toEqual([]);
  });
});

describe('resolveWingMonthlyTrendPeriod', () => {
  it('closes the anchor month but leaves older months exact', () => {
    const current = resolveWingMonthlyTrendPeriod(
      new Date('2026-08-31T15:00:00.000Z'),
      new Date('2026-09-30T15:00:00.000Z'),
      ANCHOR,
    );
    expect(isoWindow(current)).toEqual([
      '2026-08-31T15:00:00.000Z',
      '2026-09-07T15:00:00.000Z',
    ]);

    const older = resolveWingMonthlyTrendPeriod(
      new Date('2026-07-31T15:00:00.000Z'),
      new Date('2026-08-31T15:00:00.000Z'),
      ANCHOR,
    );
    expect(isoWindow(older)).toEqual([
      '2026-07-31T15:00:00.000Z',
      '2026-08-31T15:00:00.000Z',
    ]);
  });

  it('empties the anchor month on the 1st and still reads the month before it', () => {
    const anchor = new Date('2026-09-01T03:00:00.000Z');
    const september = resolveWingMonthlyTrendPeriod(
      new Date('2026-08-31T15:00:00.000Z'),
      new Date('2026-09-30T15:00:00.000Z'),
      anchor,
    );
    expect(september.selectedDates).toEqual([]);

    const august = resolveWingMonthlyTrendPeriod(
      new Date('2026-07-31T15:00:00.000Z'),
      new Date('2026-08-31T15:00:00.000Z'),
      anchor,
    );
    expect(august.selectedDates).toHaveLength(31);
  });
});
