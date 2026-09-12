import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { missingDatesOf, periodStatusOf } from '../../../test-helpers/dashboard-basis-assertions';
import { SellpiaSalesSummarySchema } from '@kiditem/shared/dashboard';
import { SellpiaSalesService } from '../sellpia-sales.service';
import { classifySellpiaChannelGroup } from '../domain/channel-group';
import { SELLPIA_SALES_COVERAGE_SELLER_ID } from '../domain/snapshot-coverage';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

type PublishedRow = {
  businessDate: Date;
  sellerId: string;
  sellerName: string;
  channelGroup: string;
  revenueKrw: number;
  qty: number;
  costKrw: number;
  capturedAt: Date;
};

afterEach(() => {
  vi.useRealTimers();
});

function makePublishedSource() {
  const readPublishedRows = vi.fn(async (): Promise<PublishedRow[]> => []);
  return {
    source: { readPublishedRows },
    readPublishedRows,
  };
}

function makeCoupangAds(spend = 0, hasData = false) {
  const aggregateCoupangAds = vi.fn(async () => ({
    spend,
    revenue: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    orders: 0,
    hasData,
    lastObservedAt: null,
  }));
  const fetchDailyAds = vi.fn(async (_organizationId: string, from: Date, to: Date) => {
    if (!hasData || !Number.isFinite(spend)) return [];
    const dates: string[] = [];
    for (
      let cursor = from.getTime() + 9 * 60 * 60 * 1000;
      cursor < to.getTime() + 9 * 60 * 60 * 1000;
      cursor += 24 * 60 * 60 * 1000
    ) {
      dates.push(new Date(cursor).toISOString().slice(0, 10));
    }
    const base = dates.length > 0 ? Math.floor(spend / dates.length) : 0;
    const remainder = dates.length > 0 ? spend - base * dates.length : 0;
    return dates.map((date, index) => ({
      date,
      ad_cost: base + (index === dates.length - 1 ? remainder : 0),
      ad_revenue: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      orders: 0,
      observedAt: '2026-07-18T00:00:00.000Z',
    }));
  });
  return { repo: { aggregateCoupangAds, fetchDailyAds }, aggregateCoupangAds, fetchDailyAds };
}

function snap(row: {
  date: string;
  sellerId: string;
  sellerName: string;
  channelGroup: string;
  revenueKrw: number;
  qty?: number;
  costKrw?: number;
  capturedAt?: string;
}): PublishedRow {
  return {
    businessDate: new Date(`${row.date}T00:00:00.000Z`),
    sellerId: row.sellerId,
    sellerName: row.sellerName,
    channelGroup: row.channelGroup,
    revenueKrw: row.revenueKrw,
    qty: row.qty ?? 0,
    costKrw: row.costKrw ?? 0,
    capturedAt: new Date(row.capturedAt ?? '2026-07-15T01:00:00.000Z'),
  };
}

function dailyValues(points: readonly { date: string; revenue: number; qty: number }[]) {
  return points.map(({ date, revenue, qty }) => ({ date, revenue, qty }));
}

describe('classifySellpiaChannelGroup', () => {
  it('쿠팡-직배송 만 rocket 으로 분류한다', () => {
    expect(classifySellpiaChannelGroup('쿠팡-직배송')).toBe('rocket');
    expect(classifySellpiaChannelGroup('쿠팡 직배송')).toBe('rocket');
  });

  it('쿠팡 윙/쿠팡2/기타몰은 others 로 분류한다', () => {
    expect(classifySellpiaChannelGroup('쿠팡')).toBe('others');
    expect(classifySellpiaChannelGroup('쿠팡2')).toBe('others');
    expect(classifySellpiaChannelGroup('스마트스토어')).toBe('others');
    expect(classifySellpiaChannelGroup('아이스크림몰(외부몰)')).toBe('others');
  });
});

describe('SellpiaSalesService.getSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads published owner rows for rocket/others and mall drill-down aggregation', async () => {
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValueOnce([
      snap({ date: '2026-07-14', sellerId: '129', sellerName: '쿠팡-직배송', channelGroup: 'rocket', revenueKrw: 347505, qty: 336, costKrw: 212820 }),
      snap({ date: '2026-07-15', sellerId: '129', sellerName: '쿠팡-직배송', channelGroup: 'rocket', revenueKrw: 12011288, qty: 14654, costKrw: 8593490 }),
      snap({ date: '2026-07-14', sellerId: '118', sellerName: '스마트스토어', channelGroup: 'others', revenueKrw: 100000, qty: 50, costKrw: 40000 }),
      snap({ date: '2026-07-15', sellerId: '118', sellerName: '스마트스토어', channelGroup: 'others', revenueKrw: 120680, qty: 106, costKrw: 66700 }),
      snap({ date: '2026-07-15', sellerId: '113', sellerName: '쿠팡', channelGroup: 'others', revenueKrw: 50000, qty: 30, costKrw: 20000 }),
      snap({ date: '2026-07-14', sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID, sellerName: 'KidItem 수집 완료', channelGroup: 'others', revenueKrw: 0 }),
      snap({ date: '2026-07-15', sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID, sellerName: 'KidItem 수집 완료', channelGroup: 'others', revenueKrw: 0 }),
    ]);
    const coupangAds = makeCoupangAds(100_000, true);
    const service = new SellpiaSalesService(
      coupangAds.repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-14', '2026-07-15');

    expect(published.readPublishedRows).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      '2026-07-14',
      '2026-07-15',
    );
    expect(out.rocket.revenue).toBe(347505 + 12011288);
    expect(out.rocket.malls).toHaveLength(1);
    expect(dailyValues(out.rocket.daily)).toEqual([
      { date: '2026-07-14', revenue: 347505, qty: 336 },
      { date: '2026-07-15', revenue: 12011288, qty: 14654 },
    ]);
    expect(out.others.revenue).toBe(100000 + 120680 + 50000);
    expect(out.others.malls.map((m) => m.sellerId)).toEqual(['118', '113']);
    expect(dailyValues(out.others.malls[0].daily)).toEqual([
      { date: '2026-07-14', revenue: 100000, qty: 50 },
      { date: '2026-07-15', revenue: 120680, qty: 106 },
    ]);
    expect(dailyValues(out.others.daily)).toEqual([
      { date: '2026-07-14', revenue: 100000, qty: 50 },
      { date: '2026-07-15', revenue: 170680, qty: 136 },
    ]);
    expect(out.totalRevenue).toBe(347505 + 12011288 + 100000 + 120680 + 50000);
    expect(out.totalCost).toBe(212820 + 8593490 + 40000 + 66700 + 20000);
    expect(out.adCost).toBe(100_000);
    expect(out.netProfit).toBe(out.totalRevenue - out.totalCost - 100_000);
    expect(out.profitRate).toBe(28.5);
    expect(out.hasData).toBe(true);
    expect(out.range).toEqual({ from: '2026-07-14', to: '2026-07-15' });
    expect(() => SellpiaSalesSummarySchema.parse(out)).not.toThrow();
  });

  it('keeps observed sales facts while withholding profit when ad coverage is incomplete', async () => {
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValueOnce([
      snap({
        date: '2026-07-15',
        sellerId: '118',
        sellerName: '스마트스토어',
        channelGroup: 'others',
        revenueKrw: 100_000,
        qty: 4,
        costKrw: 60_000,
      }),
      snap({
        date: '2026-07-15',
        sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        sellerName: 'KidItem 수집 완료',
        channelGroup: 'others',
        revenueKrw: 0,
      }),
    ]);
    const service = new SellpiaSalesService(
      makeCoupangAds(12_000, false).repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-15', '2026-07-15');

    expect(out.hasData).toBe(true);
    expect(out.totalRevenue).toBe(100_000);
    expect(out.totalCost).toBe(60_000);
    expect(out.others.qty).toBe(4);
    expect(out.adCost).toBeNull();
    expect(out.netProfit).toBeNull();
    expect(out.profitRate).toBeNull();
  });

  it('preserves an explicit zero advertising cost for a complete ad range', async () => {
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValueOnce([
      snap({
        date: '2026-07-15',
        sellerId: '118',
        sellerName: '스마트스토어',
        channelGroup: 'others',
        revenueKrw: 100_000,
        qty: 4,
        costKrw: 60_000,
      }),
      snap({
        date: '2026-07-15',
        sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        sellerName: 'KidItem 수집 완료',
        channelGroup: 'others',
        revenueKrw: 0,
      }),
    ]);
    const service = new SellpiaSalesService(
      makeCoupangAds(0, true).repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-15', '2026-07-15');

    expect(out.adCost).toBe(0);
    expect(out.netProfit).toBe(40_000);
    expect(out.profitRate).toBe(40);
  });

  it('does not use nonfinite ad spend as an implicit zero', async () => {
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValueOnce([
      snap({
        date: '2026-07-15',
        sellerId: '118',
        sellerName: '스마트스토어',
        channelGroup: 'others',
        revenueKrw: 100_000,
        costKrw: 60_000,
      }),
      snap({
        date: '2026-07-15',
        sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        sellerName: 'KidItem 수집 완료',
        channelGroup: 'others',
        revenueKrw: 0,
      }),
    ]);
    const coupangAds = makeCoupangAds(Number.NaN, true);
    const service = new SellpiaSalesService(
      coupangAds.repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-15', '2026-07-15');

    expect(out.totalRevenue).toBe(100_000);
    expect(out.totalCost).toBe(60_000);
    expect(out.adCost).toBeNull();
    expect(out.netProfit).toBeNull();
    expect(out.profitRate).toBeNull();
  });

  it('returns hasData=false when the owner has no published rows', async () => {
    const published = makePublishedSource();
    const service = new SellpiaSalesService(
      makeCoupangAds().repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-01', '2026-07-15');

    expect(out.hasData).toBe(false);
    expect(out.totalRevenue).toBe(0);
    expect(out.totalCost).toBe(0);
    expect(out.adCost).toBeNull();
    expect(out.netProfit).toBeNull();
    expect(out.profitRate).toBeNull();
    expect(out.rocket.malls).toEqual([]);
    expect(out.others.malls).toEqual([]);
  });

  it('keeps a partially covered period usable and exposes the partial basis', async () => {
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValueOnce([
      snap({ date: '2026-07-14', sellerId: '129', sellerName: '쿠팡-직배송', channelGroup: 'rocket', revenueKrw: 1_000 }),
      snap({ date: '2026-07-14', sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID, sellerName: 'KidItem 수집 완료', channelGroup: 'others', revenueKrw: 0 }),
    ]);
    const service = new SellpiaSalesService(
      makeCoupangAds().repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-14', '2026-07-15');

    expect(out.totalRevenue).toBe(1_000);
    expect(out.hasData).toBe(true);
    expect(periodStatusOf(out.metricBasis.totalRevenue)).toBe('partial');
    expect(out.metricBasis.totalRevenue.includedDates).toEqual(['2026-07-14']);
    expect(missingDatesOf(out.metricBasis.totalRevenue)).toEqual(['2026-07-15']);
    expect(out.adCost).toBeNull();
    expect(out.netProfit).toBeNull();
    expect(out.profitRate).toBeNull();
  });

  it('accepts closed dates before today without requiring today coverage', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T10:00:00.000Z'));
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValue([
      snap({ date: '2026-07-17', sellerId: '118', sellerName: '스마트스토어', channelGroup: 'others', revenueKrw: 1_000 }),
      snap({ date: '2026-07-17', sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID, sellerName: 'KidItem 수집 완료', channelGroup: 'others', revenueKrw: 0 }),
    ]);
    const service = new SellpiaSalesService(
      makeCoupangAds().repo as never,
      published.source as never,
    );

    const closedRange = await service.getSummary(ORGANIZATION_ID, '2026-07-17', '2026-07-18');
    const todayOnly = await service.getSummary(ORGANIZATION_ID, '2026-07-18', '2026-07-18');

    expect(closedRange.hasData).toBe(true);
    expect(closedRange.totalRevenue).toBe(1_000);
    expect(dailyValues(closedRange.others.daily)).toEqual([{ date: '2026-07-17', revenue: 1_000, qty: 0 }]);
    expect(todayOnly.hasData).toBe(false);
  });

  it('does not treat owner rows without coverage as published sales', async () => {
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValueOnce([
      snap({ date: '2026-07-15', sellerId: '118', sellerName: '스마트스토어', channelGroup: 'others', revenueKrw: 9_999 }),
    ]);
    const service = new SellpiaSalesService(
      makeCoupangAds().repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-15', '2026-07-15');

    expect(out.hasData).toBe(false);
    expect(out.totalRevenue).toBe(0);
    expect(out.lastCapturedAt).toBeNull();
  });

  it('keeps the sales coverage state independent when the ad range is complete', async () => {
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValueOnce([
      snap({
        date: '2026-07-15',
        sellerId: '118',
        sellerName: '스마트스토어',
        channelGroup: 'others',
        revenueKrw: 9_999,
        qty: 2,
        costKrw: 6_000,
      }),
    ]);
    const service = new SellpiaSalesService(
      makeCoupangAds(0, true).repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-15', '2026-07-15');

    expect(out.hasData).toBe(false);
    expect(out.totalRevenue).toBe(0);
    expect(out.totalCost).toBe(0);
    expect(out.others.qty).toBe(0);
    expect(out.adCost).toBeNull();
    expect(out.netProfit).toBeNull();
    expect(out.profitRate).toBeNull();
    expect(out.profitInputs).toBeNull();
  });

  it('renders coverage-only dates as confirmed zero without mall rows', async () => {
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValueOnce([
      snap({ date: '2026-07-15', sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID, sellerName: 'KidItem 수집 완료', channelGroup: 'others', revenueKrw: 0 }),
    ]);
    const service = new SellpiaSalesService(
      makeCoupangAds().repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-15', '2026-07-15');

    expect(out.hasData).toBe(true);
    expect(out.totalRevenue).toBe(0);
    expect(out.profitRate).toBeNull();
    expect(dailyValues(out.rocket.daily)).toEqual([{ date: '2026-07-15', revenue: 0, qty: 0 }]);
    expect(dailyValues(out.others.daily)).toEqual([{ date: '2026-07-15', revenue: 0, qty: 0 }]);
    expect(out.rocket.malls).toEqual([]);
    expect(out.others.malls).toEqual([]);
    expect(out.lastCapturedAt).toBe('2026-07-15T01:00:00.000Z');
  });

  it('uses global all-seller coverage to distinguish a known mall zero from an absent day', async () => {
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValueOnce([
      snap({
        date: '2026-07-14',
        sellerId: '118',
        sellerName: '스마트스토어',
        channelGroup: 'others',
        revenueKrw: 100,
        qty: 2,
        costKrw: 40,
      }),
      // The seller has no fact on 2026-07-15, but the all-seller sentinel
      // proves that date was checked and had no sales for this known seller.
      snap({
        date: '2026-07-14',
        sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        sellerName: 'KidItem 수집 완료',
        channelGroup: 'others',
        revenueKrw: 0,
      }),
      snap({
        date: '2026-07-15',
        sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        sellerName: 'KidItem 수집 완료',
        channelGroup: 'others',
        revenueKrw: 0,
      }),
    ]);
    const service = new SellpiaSalesService(
      makeCoupangAds().repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-14', '2026-07-15');

    expect(dailyValues(out.others.daily)).toEqual([
      { date: '2026-07-14', revenue: 100, qty: 2 },
      { date: '2026-07-15', revenue: 0, qty: 0 },
    ]);
    expect(out.others.malls).toHaveLength(1);
    expect(dailyValues(out.others.malls[0].daily)).toEqual([
      { date: '2026-07-14', revenue: 100, qty: 2 },
      { date: '2026-07-15', revenue: 0, qty: 0 },
    ]);
    expect(out.others.malls[0].daily[1]).toMatchObject({
      metricBasis: { revenue: { includedDates: ['2026-07-15'] } },
    });
    expect(periodStatusOf(out.others.malls[0].daily[1]?.metricBasis?.revenue)).toBe('complete');
  });

  it('does not fill group or mall daily dates without global coverage proof', async () => {
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValueOnce([
      snap({
        date: '2026-07-15',
        sellerId: '118',
        sellerName: '스마트스토어',
        channelGroup: 'others',
        revenueKrw: 100,
        qty: 2,
        costKrw: 40,
      }),
    ]);
    const service = new SellpiaSalesService(
      makeCoupangAds().repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-15', '2026-07-15');

    expect(out.hasData).toBe(false);
    expect(out.others.daily).toEqual([]);
    expect(out.others.malls).toEqual([]);
    expect(out.metricBasis['others.daily']).toMatchObject({ includedDates: [] });
    expect(periodStatusOf(out.metricBasis['others.daily'])).toBe('empty');
    expect(missingDatesOf(out.metricBasis['others.daily'])).toEqual(['2026-07-15']);
    expect(out.metricBasis['others.daily.2026-07-15']).toBeUndefined();
  });

  it('does not mark a date included when a duplicate sentinel row is malformed', async () => {
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValueOnce([
      snap({
        date: '2026-07-15',
        sellerId: '118',
        sellerName: '스마트스토어',
        channelGroup: 'others',
        revenueKrw: 100,
        qty: 2,
        costKrw: 40,
      }),
      snap({
        date: '2026-07-15',
        sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        sellerName: 'KidItem 수집 완료',
        channelGroup: 'others',
        revenueKrw: 0,
      }),
      snap({
        date: '2026-07-15',
        sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        sellerName: 'KidItem 수집 완료',
        channelGroup: 'others',
        revenueKrw: Number.NaN,
      }),
      snap({
        date: '2026-07-15',
        sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        sellerName: 'KidItem 수집 완료',
        channelGroup: 'others',
        revenueKrw: 1,
      }),
    ]);
    const service = new SellpiaSalesService(
      makeCoupangAds().repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-15', '2026-07-15');

    expect(out.hasData).toBe(false);
    expect(out.totalRevenue).toBe(0);
    expect(out.metricBasis.totalRevenue).toMatchObject({
      includedDates: [],
      invalidDates: ['2026-07-15'],
    });
    expect(periodStatusOf(out.metricBasis.totalRevenue)).toBe('empty');
    expect(missingDatesOf(out.metricBasis.totalRevenue)).toEqual(['2026-07-15']);
    expect(out.others.daily).toEqual([]);
    expect(out.others.malls).toEqual([]);
  });

  it('subtracts collected advertising cost and keeps a negative profit rate', async () => {
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValueOnce([
      snap({ date: '2026-07-15', sellerId: '118', sellerName: '스마트스토어', channelGroup: 'others', revenueKrw: 100_000, costKrw: 80_000 }),
      snap({ date: '2026-07-15', sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID, sellerName: 'KidItem 수집 완료', channelGroup: 'others', revenueKrw: 0 }),
    ]);
    const service = new SellpiaSalesService(
      makeCoupangAds(50_000, true).repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-15', '2026-07-15');

    expect(out.netProfit).toBe(-30_000);
    expect(out.profitRate).toBe(-30);
  });

  it('uses the exact Sellpia/Ads date intersection for profit while retaining maximal totals', async () => {
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValueOnce([
      snap({ date: '2026-07-14', sellerId: '118', sellerName: '스마트스토어', channelGroup: 'others', revenueKrw: 100, qty: 1, costKrw: 40 }),
      snap({ date: '2026-07-15', sellerId: '118', sellerName: '스마트스토어', channelGroup: 'others', revenueKrw: 200, qty: 2, costKrw: 80 }),
      snap({ date: '2026-07-16', sellerId: '118', sellerName: '스마트스토어', channelGroup: 'others', revenueKrw: 300, qty: 3, costKrw: 120 }),
      snap({ date: '2026-07-14', sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID, sellerName: 'KidItem 수집 완료', channelGroup: 'others', revenueKrw: 0 }),
      snap({ date: '2026-07-15', sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID, sellerName: 'KidItem 수집 완료', channelGroup: 'others', revenueKrw: 0 }),
      snap({ date: '2026-07-16', sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID, sellerName: 'KidItem 수집 완료', channelGroup: 'others', revenueKrw: 0 }),
    ]);
    const coupangAds = makeCoupangAds(40, true);
    coupangAds.fetchDailyAds.mockResolvedValueOnce([
      {
        date: '2026-07-14',
        ad_cost: 10,
        ad_revenue: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        orders: 0,
        observedAt: '2026-07-17T01:00:00.000Z',
      },
      // 2026-07-15 is an internal Ads hole and must not be treated as zero.
      {
        date: '2026-07-16',
        ad_cost: 30,
        ad_revenue: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        orders: 0,
        observedAt: '2026-07-17T01:00:00.000Z',
      },
    ]);
    const service = new SellpiaSalesService(
      coupangAds.repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-14', '2026-07-16');

    expect(out.totalRevenue).toBe(600);
    expect(out.totalCost).toBe(240);
    expect(dailyValues(out.others.daily)).toEqual([
      { date: '2026-07-14', revenue: 100, qty: 1 },
      { date: '2026-07-15', revenue: 200, qty: 2 },
      { date: '2026-07-16', revenue: 300, qty: 3 },
    ]);
    expect(out.profitInputs).toMatchObject({ revenue: 400, cost: 160, adCost: 40, qty: 4 });
    expect(out.profitInputs?.basis.includedDates).toEqual(['2026-07-14', '2026-07-16']);
    expect(missingDatesOf(out.profitInputs?.basis)).toEqual(['2026-07-15']);
    expect(periodStatusOf(out.profitInputs?.basis)).toBe('partial');
    expect(out.adCost).toBe(40);
    expect(out.netProfit).toBe(200);
    expect(out.profitRate).toBe(50);
    expect(periodStatusOf(out.metricBasis.totalRevenue)).toBe('complete');
    expect(out.others.daily[1]).toMatchObject({
      metricBasis: {
        revenue: { includedDates: ['2026-07-15'] },
      },
    });
  });

  it('keeps sales totals when there is no common valid Ads date and leaves profit unavailable', async () => {
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValueOnce([
      snap({ date: '2026-07-14', sellerId: '118', sellerName: '스마트스토어', channelGroup: 'others', revenueKrw: 100, costKrw: 40 }),
      snap({ date: '2026-07-14', sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID, sellerName: 'KidItem 수집 완료', channelGroup: 'others', revenueKrw: 0 }),
    ]);
    const coupangAds = makeCoupangAds(30, true);
    coupangAds.fetchDailyAds.mockResolvedValueOnce([
      {
        date: '2026-07-15',
        ad_cost: 30,
        ad_revenue: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        orders: 0,
        observedAt: '2026-07-16T01:00:00.000Z',
      },
    ]);
    const service = new SellpiaSalesService(
      coupangAds.repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-14', '2026-07-15');

    expect(out.hasData).toBe(true);
    expect(out.totalRevenue).toBe(100);
    expect(out.profitInputs).toBeNull();
    expect(out.adCost).toBeNull();
    expect(out.netProfit).toBeNull();
    expect(out.profitRate).toBeNull();
    expect(periodStatusOf(out.metricBasis.profitInputs)).toBe('empty');
    expect(out.metricBasis.profitInputs.includedDates).toEqual([]);
  });

  it('keeps Sellpia totals when the daily Ads read fails and marks profit unverified', async () => {
    const published = makePublishedSource();
    published.readPublishedRows.mockResolvedValueOnce([
      snap({
        date: '2026-07-14',
        sellerId: '118',
        sellerName: '스마트스토어',
        channelGroup: 'others',
        revenueKrw: 100,
        costKrw: 40,
      }),
      snap({
        date: '2026-07-14',
        sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        sellerName: 'KidItem 수집 완료',
        channelGroup: 'others',
        revenueKrw: 0,
      }),
    ]);
    const coupangAds = makeCoupangAds(0, true);
    coupangAds.fetchDailyAds.mockRejectedValueOnce(new Error('ads read failed'));
    const service = new SellpiaSalesService(
      coupangAds.repo as never,
      published.source as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-14', '2026-07-14');

    expect(out.hasData).toBe(true);
    expect(out.totalRevenue).toBe(100);
    expect(out.totalCost).toBe(40);
    expect(out.adCost).toBeNull();
    expect(out.netProfit).toBeNull();
    expect(out.profitRate).toBeNull();
    expect(out.profitInputs).toBeNull();
    expect(out.metricBasis.profitInputs).toMatchObject({
      includedDates: [],
      invalidDates: [],
      queryFailedSources: ['coupang_ads'],
    });
    expect(periodStatusOf(out.metricBasis.profitInputs)).toBe('unverified');
    expect(missingDatesOf(out.metricBasis.profitInputs)).toEqual(['2026-07-14']);
  });
});
