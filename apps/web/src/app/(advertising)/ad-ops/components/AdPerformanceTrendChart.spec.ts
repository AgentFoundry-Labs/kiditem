import { describe, expect, it } from 'vitest';
import type { AdMeasuredMetrics, AdTrendsData } from '@kiditem/shared/advertising';
import { buildPerformancePoints, toAxisLabel } from './AdPerformanceTrendChart';

// 쿠팡 광고센터 성과 그래프의 X축은 `07/01(수)` 처럼 요일까지 포함한다.
describe('toAxisLabel', () => {
  it('formats a business date as MM/DD(요일)', () => {
    expect(toAxisLabel('2026-07-01')).toBe('07/01(수)');
    expect(toAxisLabel('2026-07-19')).toBe('07/19(일)');
    expect(toAxisLabel('2026-07-20')).toBe('07/20(월)');
  });

  it('zero-pads single digit months and days', () => {
    expect(toAxisLabel('2026-01-05')).toBe('01/05(월)');
  });

  it('returns the raw value when the date is unparseable', () => {
    expect(toAxisLabel('')).toBe('');
    expect(toAxisLabel('not-a-date')).toBe('not-a-date');
  });
});

const measured: AdMeasuredMetrics = {
  spend: 1000,
  revenue: 5000,
  impressions: 100,
  clicks: 10,
  conversions: null,
  roas: 500,
  ctr: 10,
  cvr: null,
};

const measuredIdle: AdMeasuredMetrics = {
  spend: 0,
  revenue: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  roas: null,
  ctr: null,
  cvr: null,
};

function trends(daily: AdTrendsData['daily']): AdTrendsData {
  return {
    knownThrough: '2026-07-19',
    from: '2026-07-17',
    to: '2026-07-19',
    daily,
    summary: {
      source: 'coupang_ads',
      periodDayCount: 2,
      latestBusinessDate: '2026-07-19',
      observedAt: '2026-07-20T00:00:00.000Z',
      metrics: measured,
      orders: 3,
    },
  };
}

describe('buildPerformancePoints', () => {
  it('keeps an unmeasured date on the axis as a null point, never zero', () => {
    const points = buildPerformancePoints(trends([
      { date: '2026-07-17', metrics: measured, orders: 3 },
      { date: '2026-07-18', metrics: null, orders: null },
      { date: '2026-07-19', metrics: measuredIdle, orders: 0 },
    ]));

    expect(points.map((point) => point.businessDate)).toEqual([
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
    ]);
    expect(points[1]).toEqual({
      label: '07/18(토)',
      businessDate: '2026-07-18',
      spend: null,
      revenue: null,
      impressions: null,
      clicks: null,
      conversions: null,
      roas: null,
      ctr: null,
      cvr: null,
    });
    expect(points[0]).toMatchObject({ spend: 1000, roas: 500, conversions: null, cvr: null });
    expect(points[2]).toMatchObject({ spend: 0, revenue: 0, roas: null, ctr: null, cvr: null });
  });

  it('has no points before trends load', () => {
    expect(buildPerformancePoints(null)).toEqual([]);
  });
});
