import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdCampaignsService } from '../ad-campaigns.service';
import {
  buildMockAdCampaignRepo,
  buildMockAdActionRepo,
  buildMockAdListingRepo,
  type MockAdCampaignRepo,
  type MockAdListingRepo,
} from '../../../__tests__/test-helpers/build-mock-ports';
import type { AdCampaignRepositoryPort } from '../../port/out/repository/ad-campaign.repository.port';
import type { AdListingRepositoryPort } from '../../port/out/repository/ad-listing.repository.port';

describe('AdCampaignsService', () => {
  const channelAccountId = '11111111-1111-4111-8111-111111111111';
  let service: AdCampaignsService;
  let campaignRepo: MockAdCampaignRepo;
  let listingRepo: MockAdListingRepo;
  let adConfig: any;
  let rollups: Awaited<ReturnType<AdCampaignRepositoryPort['findCampaignSnapshot']>>['rollups'];
  let currentSweeps: Awaited<ReturnType<AdCampaignRepositoryPort['findCampaignSnapshot']>>['currentSweeps'];

  beforeEach(() => {
    campaignRepo = buildMockAdCampaignRepo();
    listingRepo = buildMockAdListingRepo();
    // Sensible defaults — empty rollups and no measured ad day.
    rollups = [];
    currentSweeps = [];
    campaignRepo.findCampaignSnapshot.mockImplementation(async () => ({ rollups, currentSweeps }));
    campaignRepo.findProductTargetRollups.mockResolvedValue([]);
    campaignRepo.findAdWindowDays.mockResolvedValue({ days: [], observedAt: null });
    listingRepo.findScopedAdListings.mockResolvedValue(new Map());
    adConfig = { getConfig: vi.fn() };
    service = new AdCampaignsService(
      campaignRepo as unknown as AdCampaignRepositoryPort,
      listingRepo as unknown as AdListingRepositoryPort,
      buildMockAdActionRepo(),
      adConfig,
    );
  });

  it('getCampaigns aggregates target-daily rows by targetKey + period (H3)', async () => {
    rollups = [
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
    ];
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

  it('getCampaigns surfaces listing-less rollups (Drive replay shape — campaign source has no productId)', async () => {
    rollups = [
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
    ];

    const result = await service.getCampaigns('14d', 'organization-1');

    expect(result).toHaveLength(1);
    expect(result[0].listing).toBeNull();
    expect(result[0].campaignName).toBe('매출 TOP 제품');
    expect(result[0].metrics.spend).toBe(30000);
    expect(result[0].metrics.roas).toBe(290); // 87000/30000*100
  });

  it('getCampaigns treats legacy conversions=revenue campaign rows as unknown conversion count', async () => {
    rollups = [
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
    ];

    const result = await service.getCampaigns('7d', 'organization-1');

    expect(result).toHaveLength(1);
    expect(result[0].metrics.revenue).toBe(232990);
    expect(result[0].metrics.conversions).toBe(0);
    expect(result[0].metrics.cvr).toBe(0);
  });

  it('merges an identity-complete current roster without fabricating OFF campaign metrics', async () => {
    rollups = [
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
    ];
    currentSweeps = [
      {
        channelAccountId,
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
    ];

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
    rollups = [
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
    ];
    currentSweeps = [
      {
        channelAccountId,
        rosterComplete: true,
        campaigns: [],
      },
    ];

    await expect(
      service.getCampaigns('7d', 'organization-1'),
    ).resolves.toEqual([]);
  });

  it('ignores an incomplete marker and preserves the legacy fact projection', async () => {
    rollups = [
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
    ];
    currentSweeps = [
      {
        channelAccountId,
        rosterComplete: false,
        campaigns: [],
      },
    ];

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

  it('getTrends reads the inclusive explicit range from the ad window', async () => {
    const dateRange = {
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-24T00:00:00.000Z'),
    };

    const trends = await service.getTrends('14d', undefined, 'organization-1', dateRange);

    expect(campaignRepo.findAdWindowDays).toHaveBeenCalledWith('organization-1', dateRange);
    expect(trends.from).toBe('2026-07-01');
    expect(trends.to).toBe('2026-07-24');
    expect(trends.daily).toHaveLength(24);
  });

  it('getTrends applies an exact seven-day complete window through yesterday', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T03:00:00.000Z'));
    try {
      const result = await service.getTrends('7d', undefined, 'organization-1');

      expect(campaignRepo.findAdWindowDays).toHaveBeenCalledWith('organization-1', {
        from: new Date('2026-07-17T00:00:00.000Z'),
        to: new Date('2026-07-23T00:00:00.000Z'),
      });
      expect(result.knownThrough).toBe('2026-07-23');
      expect(result.daily.map((day) => day.date)).toEqual([
        '2026-07-17', '2026-07-18', '2026-07-19', '2026-07-20',
        '2026-07-21', '2026-07-22', '2026-07-23',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('empty state — nothing measured publishes holes and an unavailable summary, never zeros', async () => {
    const campaigns = await service.getCampaigns('7d', 'organization-1');
    const trends = await service.getTrends('14d', undefined, 'organization-1');

    expect(campaigns).toEqual([]);
    expect(trends.daily.every((day) => day.metrics === null && day.orders === null)).toBe(true);
    expect(trends.summary).toMatchObject({ source: 'unavailable', periodDayCount: 0, metrics: null });
  });
});
