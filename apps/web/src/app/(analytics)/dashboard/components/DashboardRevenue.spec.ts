import { describe, expect, it } from 'vitest';
import { revenuePoints } from './DashboardRevenue';

/**
 * The chart's points follow the server's coverage rule: a day Sellpia did not
 * confirm is unknown, never a zero sale. The cumulative view must keep that —
 * summing an unknown day as 0 would draw a flat step that reads as "sold
 * nothing", and carrying the previous total onto it would draw a day that
 * never happened.
 */
describe('revenuePoints', () => {
  const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
  const series = [
    {
      key: 'coupang',
      daily: new Map([
        ['2026-09-01', 100],
        ['2026-09-02', 0],
        ['2026-09-04', 50],
      ]),
    },
    {
      key: 'nonCoupang',
      daily: new Map([
        ['2026-09-01', 10],
        ['2026-09-03', 20],
      ]),
    },
  ];

  it('plots each confirmed day as it is and leaves an unknown day blank', () => {
    expect(revenuePoints(dates, series, 'daily')).toEqual([
      { date: '2026-09-01', coupang: 100, nonCoupang: 10 },
      { date: '2026-09-02', coupang: 0 },
      { date: '2026-09-03', nonCoupang: 20 },
      { date: '2026-09-04', coupang: 50 },
    ]);
  });

  it('sums confirmed days only, so an unknown day stays blank and the last point is the period total', () => {
    const points = revenuePoints(dates, series, 'cumulative');

    expect(points).toEqual([
      { date: '2026-09-01', coupang: 100, nonCoupang: 10 },
      // A confirmed zero sale holds the running total.
      { date: '2026-09-02', coupang: 100 },
      { date: '2026-09-03', nonCoupang: 30 },
      { date: '2026-09-04', coupang: 150 },
    ]);
  });
});
