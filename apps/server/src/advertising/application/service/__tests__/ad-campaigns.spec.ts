import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdCampaignsService } from '../ad-campaigns.service';
import type { AdCampaignRepositoryPort } from '../../port/out/repository/ad-campaign.repository.port';
import type { AdListingRepositoryPort } from '../../port/out/repository/ad-listing.repository.port';
import type { AdAccountKpiRepositoryPort } from '../../port/out/repository/ad-account-kpi.repository.port';
import {
  buildMockAdCampaignRepo,
  buildMockAdListingRepo,
  buildMockAdAccountKpiRepo,
  type MockAdCampaignRepo,
  type MockAdListingRepo,
  type MockAdAccountKpiRepo,
} from '../../../__tests__/test-helpers/build-mock-ports';

describe('AdCampaignsService', () => {
  const channelAccountId = '11111111-1111-4111-8111-111111111111';
  let service: AdCampaignsService;
  let campaignRepo: MockAdCampaignRepo;
  let listingRepo: MockAdListingRepo;
  let accountKpiRepo: MockAdAccountKpiRepo;
  let adConfig: any;

  beforeEach(() => {
    campaignRepo = buildMockAdCampaignRepo();
    listingRepo = buildMockAdListingRepo();
    accountKpiRepo = buildMockAdAccountKpiRepo();
    // Sensible defaults — empty rollups + empty account KPI rows.
    campaignRepo.findCampaignRollups.mockResolvedValue([]);
    campaignRepo.findLatestCompleteCampaignSweeps.mockResolvedValue([]);
    campaignRepo.findAccountlessSyncCampaignSweep.mockResolvedValue(null);
    campaignRepo.findProductTargetRollups.mockResolvedValue([]);
    campaignRepo.findAdTrendDailyRows.mockResolvedValue([]);
    campaignRepo.findGradeBudgetTotals.mockResolvedValue({ A: 0, B: 0, C: 0 });
    listingRepo.findScopedAdListings.mockResolvedValue(new Map());
    accountKpiRepo.findCoupangAdsDaily.mockResolvedValue([]);
    adConfig = { getConfig: vi.fn() };
    service = new AdCampaignsService(
      campaignRepo as unknown as AdCampaignRepositoryPort,
      listingRepo as unknown as AdListingRepositoryPort,
      accountKpiRepo as unknown as AdAccountKpiRepositoryPort,
      adConfig,
    );
  });

  it('marks only an exact identity-complete 31-day window through yesterday KST as fresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T03:00:00.000Z'));
    campaignRepo.findAccountlessSyncCampaignSweep.mockResolvedValue({
      channelAccountId,
      collectionRunId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      collectionAttempt: 1,
      completedAt: new Date('2026-07-25T02:00:00.000Z'),
      campaignDailyCollectionComplete: true,
      campaignDailyWindowDays: 31,
      campaignDailyFrom: '2026-06-24',
      campaignDailyTo: '2026-07-24',
      rosterComplete: true,
      dailyFactsComplete: true,
      campaigns: [
        {
          channelAccountId,
          campaignIdentity: 'campaign:active',
          campaignId: 'active',
          campaignName: '운영 캠페인',
          status: '운영중',
          onOff: 'ON',
        },
      ],
    });

    try {
      await expect(
        service.getCampaignSyncStatus('organization-1'),
      ).resolves.toEqual({
        status: 'fresh',
        lastCompletedAt: new Date('2026-07-25T02:00:00.000Z'),
        campaignCount: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not trust a complete marker when its 31-day facts were not persisted by that run', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T03:00:00.000Z'));
    campaignRepo.findAccountlessSyncCampaignSweep.mockResolvedValue({
      channelAccountId,
      collectionRunId: 'abababab-abab-4bab-8bab-abababababab',
      collectionAttempt: 2,
      completedAt: new Date('2026-07-25T02:00:00.000Z'),
      campaignDailyCollectionComplete: true,
      campaignDailyWindowDays: 31,
      campaignDailyFrom: '2026-06-24',
      campaignDailyTo: '2026-07-24',
      rosterComplete: true,
      dailyFactsComplete: false,
      campaigns: [
        {
          channelAccountId,
          campaignIdentity: 'campaign:detail-backed',
          campaignId: 'detail-backed',
          campaignName: '상세 수집 캠페인',
          status: '운영중',
          onOff: 'ON',
        },
      ],
    });

    try {
      await expect(
        service.getCampaignSyncStatus('organization-1'),
      ).resolves.toEqual({
        status: 'incomplete',
        lastCompletedAt: null,
        campaignCount: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps legacy one-day markers and old 31-day windows out of the latest state', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T03:00:00.000Z'));
    const marker = {
      channelAccountId,
      collectionRunId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      collectionAttempt: 1,
      completedAt: new Date('2026-07-25T02:00:00.000Z'),
      campaignDailyCollectionComplete: false,
      campaignDailyWindowDays: null,
      campaignDailyFrom: null,
      campaignDailyTo: null,
      rosterComplete: true,
      dailyFactsComplete: false,
      campaigns: [],
    };
    campaignRepo.findAccountlessSyncCampaignSweep.mockResolvedValue(marker);

    try {
      await expect(
        service.getCampaignSyncStatus('organization-1'),
      ).resolves.toMatchObject({ status: 'stale' });

      campaignRepo.findAccountlessSyncCampaignSweep.mockResolvedValue({
        ...marker,
        campaignDailyCollectionComplete: true,
        campaignDailyWindowDays: 31,
        campaignDailyFrom: '2026-06-23',
        campaignDailyTo: '2026-07-23',
        dailyFactsComplete: true,
      });
      await expect(
        service.getCampaignSyncStatus('organization-1'),
      ).resolves.toMatchObject({ status: 'stale' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not report a partial identity sweep as complete', async () => {
    campaignRepo.findAccountlessSyncCampaignSweep.mockResolvedValue({
      channelAccountId,
      collectionRunId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      collectionAttempt: 1,
      completedAt: new Date('2026-07-25T02:00:00.000Z'),
      campaignDailyCollectionComplete: true,
      campaignDailyWindowDays: 31,
      campaignDailyFrom: '2026-06-24',
      campaignDailyTo: '2026-07-24',
      rosterComplete: false,
      dailyFactsComplete: false,
      campaigns: [],
    });

    await expect(
      service.getCampaignSyncStatus('organization-1'),
    ).resolves.toEqual({
      status: 'incomplete',
      lastCompletedAt: null,
      campaignCount: 0,
    });
  });

  it('getCampaigns aggregates target-daily rows by targetKey + period (H3)', async () => {
    campaignRepo.findCampaignRollups.mockResolvedValue([
      {
        targetKey: 'campaign:CMP-1',
        channelAccountId,
        campaignIdentity: 'campaign:CMP-1',
        campaignId: 'CMP-1',
        campaignName: 'Campaign One',
        listingId: 'L1',
        spend: 10000,
        revenue: 30000,
        impressions: 1000,
        clicks: 50,
        conversions: 5,
        orders: 5,
      },
    ]);
    listingRepo.findScopedAdListings.mockResolvedValue(
      new Map([
        [
          'L1',
          {
            id: 'L1',
            externalId: 'COUPANG-1',
            channelName: '쿠팡',
            masterProduct: {
              id: 'M1',
              code: 'M-00000001',
              name: '상품1',
              abcGrade: 'A',
              adTier: null,
              healthScore: null,
            },
          },
        ],
      ]),
    );

    const result = await service.getCampaigns('7d', 'organization-1');

    expect(result).toHaveLength(1);
    expect(result[0].listing!.listingId).toBe('L1');
    expect(result[0].listing!.masterProduct.code).toBe('M-00000001');
    expect(result[0].campaignId).toBe('CMP-1');
    expect(result[0].campaignName).toBe('Campaign One');
    expect(result[0].period).toBe('7d');
    expect(result[0].metrics.spend).toBe(10000);
    expect(result[0].metrics.ctr).toBe(5); // 50/1000*100
    expect(result[0].metrics.roas).toBe(300); // 30000/10000*100
  });

  it('getTrends aggregates listing-daily by businessDate + ABC grade (H3)', async () => {
    campaignRepo.findAdTrendDailyRows.mockResolvedValue([
      {
        businessDate: new Date('2026-04-10T00:00:00Z'),
        adSpend: 1000,
        adRevenue: 2000,
        adClicks: 10,
        adImpressions: 500,
        adConversions: 1,
        listingId: 'L1',
      },
      {
        businessDate: new Date('2026-04-11T00:00:00Z'),
        adSpend: 1500,
        adRevenue: 3000,
        adClicks: 15,
        adImpressions: 600,
        adConversions: 2,
        listingId: 'L1',
      },
      {
        businessDate: new Date('2026-04-12T00:00:00Z'),
        adSpend: 2000,
        adRevenue: 5000,
        adClicks: 20,
        adImpressions: 700,
        adConversions: 3,
        listingId: 'L1',
      },
      {
        businessDate: new Date('2026-04-13T00:00:00Z'),
        adSpend: 2500,
        adRevenue: 7500,
        adClicks: 25,
        adImpressions: 800,
        adConversions: 4,
        listingId: 'L1',
      },
    ]);
    campaignRepo.findGradeBudgetTotals.mockResolvedValue({ A: 7000, B: 0, C: 0 });

    const result = await service.getTrends('14d', undefined, 'organization-1');

    expect(result.daily).toHaveLength(4);
    expect(result.daily[0].date).toBe('2026-04-10');
    expect(result.daily[0].metrics.spend).toBe(1000);
    expect(result.firstHalf.spend).toBe(2500);
    expect(result.secondHalf.spend).toBe(4500);
    expect(result.secondHalf.revenue).toBeGreaterThan(result.firstHalf.revenue);
  });

  it('getTrends computes ABC gradeBudget allocation via listing.master.abcGrade', async () => {
    campaignRepo.findAdTrendDailyRows.mockResolvedValue([
      {
        businessDate: new Date('2026-04-10T00:00:00Z'),
        adSpend: 10000,
        adRevenue: 20000,
        adClicks: 10,
        adImpressions: 100,
        adConversions: 1,
        listingId: 'L1',
      },
      {
        businessDate: new Date('2026-04-10T00:00:00Z'),
        adSpend: 5000,
        adRevenue: 8000,
        adClicks: 5,
        adImpressions: 50,
        adConversions: 1,
        listingId: 'L2',
      },
      {
        businessDate: new Date('2026-04-10T00:00:00Z'),
        adSpend: 2000,
        adRevenue: 3000,
        adClicks: 2,
        adImpressions: 20,
        adConversions: 0,
        listingId: 'L3',
      },
      {
        businessDate: new Date('2026-04-10T00:00:00Z'),
        adSpend: 3000,
        adRevenue: 4000,
        adClicks: 3,
        adImpressions: 30,
        adConversions: 0,
        listingId: 'L4',
      },
    ]);
    campaignRepo.findGradeBudgetTotals.mockResolvedValue({
      A: 10000,
      B: 5000,
      C: 2000,
    });

    const result = await service.getTrends('14d', undefined, 'organization-1');

    expect(result.gradeBudget.A).toBe(10000);
    expect(result.gradeBudget.B).toBe(5000);
    expect(result.gradeBudget.C).toBe(2000);
  });

  it('getCampaigns surfaces listing-less rollups (Drive replay shape — campaign source has no productId)', async () => {
    campaignRepo.findCampaignRollups.mockResolvedValue([
      {
        targetKey: 'campaign:매출 TOP 제품',
        channelAccountId,
        campaignIdentity: 'campaign:top-sales',
        campaignId: null,
        campaignName: '매출 TOP 제품',
        listingId: null,
        spend: 30000,
        revenue: 87000,
        impressions: 48000,
        clicks: 110,
        conversions: 5,
        orders: 5,
      },
    ]);

    const result = await service.getCampaigns('14d', 'organization-1');

    expect(result).toHaveLength(1);
    expect(result[0].listing).toBeNull();
    expect(result[0].campaignName).toBe('매출 TOP 제품');
    expect(result[0].metrics.spend).toBe(30000);
    expect(result[0].metrics.roas).toBe(290); // 87000/30000*100
  });

  it('getCampaigns treats legacy conversions=revenue campaign rows as unknown conversion count', async () => {
    campaignRepo.findCampaignRollups.mockResolvedValue([
      {
        targetKey: 'campaign:매출 TOP 제품',
        channelAccountId,
        campaignIdentity: 'campaign:top-sales',
        campaignId: null,
        campaignName: '매출 TOP 제품',
        listingId: null,
        spend: 40002,
        revenue: 232990,
        impressions: 119303,
        clicks: 247,
        conversions: 232990,
        orders: 0,
      },
    ]);

    const result = await service.getCampaigns('7d', 'organization-1');

    expect(result).toHaveLength(1);
    expect(result[0].metrics.revenue).toBe(232990);
    expect(result[0].metrics.conversions).toBe(0);
    expect(result[0].metrics.cvr).toBe(0);
  });

  it('merges an identity-complete current roster without fabricating OFF campaign metrics', async () => {
    campaignRepo.findCampaignRollups.mockResolvedValue([
      {
        targetKey: `${channelAccountId}:campaign:active`,
        channelAccountId,
        campaignIdentity: 'campaign:active',
        campaignId: 'active',
        campaignName: '이전 표시명',
        listingId: null,
        spend: 1000,
        revenue: 3000,
        impressions: 100,
        clicks: 5,
        conversions: 1,
        orders: 1,
        conversionsObserved: true,
      },
    ]);
    campaignRepo.findLatestCompleteCampaignSweeps.mockResolvedValue([
      {
        channelAccountId,
        collectionRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        collectionAttempt: 2,
        completedAt: new Date('2026-07-24T03:00:00.000Z'),
        campaignDailyCollectionComplete: false,
        campaignDailyWindowDays: null,
        campaignDailyFrom: null,
        campaignDailyTo: null,
        rosterComplete: true,
        campaigns: [
          {
            channelAccountId,
            campaignIdentity: 'campaign:active',
            campaignId: 'active',
            campaignName: '현재 표시명',
            status: '운영중',
            onOff: 'ON',
          },
          {
            channelAccountId,
            campaignIdentity: 'campaign:paused',
            campaignId: 'paused',
            campaignName: '중지 캠페인',
            status: '일시정지',
            onOff: 'OFF',
          },
        ],
      },
    ]);

    const result = await service.getCampaigns('14d', 'organization-1');

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      campaignIdentity: 'campaign:active',
      campaignName: '현재 표시명',
      metricsAvailable: true,
      status: '운영중',
      onOff: 'ON',
      metrics: { spend: 1000, revenue: 3000 },
    });
    expect(result[1]).toMatchObject({
      campaignIdentity: 'campaign:paused',
      metricsAvailable: false,
      status: '일시정지',
      onOff: 'OFF',
      conversionsAvailable: false,
      metrics: {
        spend: 0,
        revenue: 0,
        ctr: null,
        roas: null,
        cvr: null,
      },
    });
  });

  it('uses a complete empty roster to remove stale period facts', async () => {
    campaignRepo.findCampaignRollups.mockResolvedValue([
      {
        targetKey: `${channelAccountId}:campaign:deleted`,
        channelAccountId,
        campaignIdentity: 'campaign:deleted',
        campaignId: 'deleted',
        campaignName: '삭제된 캠페인',
        listingId: null,
        spend: 1000,
        revenue: 0,
        impressions: 1,
        clicks: 0,
        conversions: 0,
        orders: 0,
        conversionsObserved: true,
      },
    ]);
    campaignRepo.findLatestCompleteCampaignSweeps.mockResolvedValue([
      {
        channelAccountId,
        collectionRunId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        collectionAttempt: 1,
        completedAt: new Date('2026-07-24T03:00:00.000Z'),
        campaignDailyCollectionComplete: false,
        campaignDailyWindowDays: null,
        campaignDailyFrom: null,
        campaignDailyTo: null,
        rosterComplete: true,
        campaigns: [],
      },
    ]);

    await expect(
      service.getCampaigns('7d', 'organization-1'),
    ).resolves.toEqual([]);
  });

  it('ignores an incomplete marker and preserves the legacy fact projection', async () => {
    campaignRepo.findCampaignRollups.mockResolvedValue([
      {
        targetKey: `${channelAccountId}:campaign:legacy`,
        channelAccountId,
        campaignIdentity: 'campaign:legacy',
        campaignId: 'legacy',
        campaignName: '기존 캠페인',
        listingId: null,
        spend: 500,
        revenue: 1000,
        impressions: 10,
        clicks: 1,
        conversions: 0,
        orders: 0,
        conversionsObserved: false,
      },
    ]);
    campaignRepo.findLatestCompleteCampaignSweeps.mockResolvedValue([
      {
        channelAccountId,
        collectionRunId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        collectionAttempt: 1,
        completedAt: new Date('2026-07-24T03:00:00.000Z'),
        campaignDailyCollectionComplete: false,
        campaignDailyWindowDays: null,
        campaignDailyFrom: null,
        campaignDailyTo: null,
        rosterComplete: false,
        campaigns: [],
      },
    ]);

    const result = await service.getCampaigns('7d', 'organization-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      campaignIdentity: 'campaign:legacy',
      metricsAvailable: true,
      status: null,
      onOff: null,
    });
  });

  it('getProducts reads product target facts with provider descriptors, not raw snapshots', async () => {
    campaignRepo.findProductTargetRollups.mockResolvedValue([
      {
        targetKey: 'product:VENDOR-1',
        channelAccountId,
        campaignIdentity: null,
        campaignId: null,
        campaignName: null,
        listingId: null,
        listingOptionId: null,
        optionId: null,
        externalId: 'product::::VENDOR-1::상품명',
        externalOptionId: 'VENDOR-1',
        keyword: '키워드 보기',
        status: '운영 중',
        onOff: 'ON',
        metaJson: {
          'advertising.raw.target': {
            productName: '감정 잔디 인형',
            imageUrl: 'https://img.example/product.jpg',
            productUrl: 'https://www.coupang.com/vp/products/1?vendorItemId=VENDOR-1',
            saleType: '판매자배송',
          },
        },
        spend: 8349,
        revenue: 37600,
        impressions: 14462,
        clicks: 66,
        conversions: 4,
        orders: 4,
      },
    ]);

    const result = await service.getProducts('14d', 'organization-1');

    expect(result).toHaveLength(1);
    expect(result[0].listing).toBeNull();
    expect(result[0].externalOptionId).toBe('VENDOR-1');
    expect(result[0].productName).toBe('감정 잔디 인형');
    expect(result[0].imageUrl).toBe('https://img.example/product.jpg');
    expect(result[0].onOff).toBe('ON');
    expect(result[0].metrics.spend).toBe(8349);
    expect(result[0].metrics.roas).toBeCloseTo(450.35);
  });

  it('getTrends folds in coupang_ads_daily account KPI when present', async () => {
    accountKpiRepo.findCoupangAdsDaily.mockResolvedValue([
      {
        businessDate: '2026-04-29',
        sums: {
          spend: 279486,
          revenue: 1629780,
          clicks: 1520,
          impressions: 527984,
          conversions: 29,
        },
        orders: 29,
      },
      {
        businessDate: '2026-04-30',
        sums: {
          spend: 40183,
          revenue: 200250,
          clicks: 206,
          impressions: 65731,
          conversions: 18,
        },
        orders: 18,
      },
    ]);

    const result = await service.getTrends('14d', undefined, 'organization-1');

    expect(result.accountSummary).not.toBeNull();
    expect(result.accountSummary?.metrics.spend).toBe(319669); // 279486 + 40183
    expect(result.accountSummary?.metrics.revenue).toBe(1830030);
    // CVR uses orders as the conversion count (provider's `conversions`
    // field carries revenue, not a count — see ad-account-kpi.query.ts).
    expect(result.accountSummary?.metrics.conversions).toBe(47); // 29 + 18
    expect(result.accountSummary?.orders).toBe(47);
    expect(result.accountSummary?.periodDayCount).toBe(2);
    expect(result.accountSummary?.latestBusinessDate).toBe('2026-04-30');
    // Per-listing `daily` stays per-listing — never substituted by account series.
    expect(result.daily).toHaveLength(0);
    // Account series surfaces independently for the UI to render alongside.
    expect(result.accountDaily).toHaveLength(2);
    expect(result.accountDaily[0].metrics.spend).toBe(279486);
  });

  it('getTrends applies the same explicit date range to listing and account facts', async () => {
    const dateRange = {
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-24T00:00:00.000Z'),
    };

    await service.getTrends('14d', undefined, 'organization-1', dateRange);

    expect(campaignRepo.findAdTrendDailyRows).toHaveBeenCalledWith(
      'organization-1',
      dateRange,
    );
    expect(accountKpiRepo.findCoupangAdsDaily).toHaveBeenCalledWith(
      'organization-1',
      '14d',
      dateRange,
    );
  });

  it('getTrends applies an exact seven-day complete window through yesterday', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T03:00:00.000Z'));
    try {
      await service.getTrends('7d', undefined, 'organization-1');

      const completeRange = {
        from: new Date('2026-07-17T00:00:00.000Z'),
        to: new Date('2026-07-23T00:00:00.000Z'),
      };
      expect(campaignRepo.findAdTrendDailyRows).toHaveBeenCalledWith(
        'organization-1',
        completeRange,
      );
      expect(accountKpiRepo.findCoupangAdsDaily).toHaveBeenCalledWith(
        'organization-1',
        '7d',
        completeRange,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  // organizationId propagation + period call-shape tests removed — covered by
  // check:idor / check:tenant-scope scanners and ad-strategy-flow integration.
  it('empty state — no daily rows returns explicit empty (legacy ignored)', async () => {
    const campaigns = await service.getCampaigns('7d', 'organization-1');
    const trends = await service.getTrends('14d', undefined, 'organization-1');

    expect(campaigns).toEqual([]);
    expect(trends.daily).toEqual([]);
    expect(trends.firstHalf.spend).toBe(0);
    expect(trends.secondHalf.spend).toBe(0);
  });
});
