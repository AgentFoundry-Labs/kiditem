import { describe, expect, it, vi } from 'vitest';
import { TrendCollectionRepositoryAdapter } from '../trend-collection.repository.adapter';
import type { PrismaService } from '../../../../../prisma/prisma.service';

/**
 * The adapter reads a window of the last N days from the clock, so a fixed
 * date in a fixture stops being inside it the moment the calendar moves past
 * it — these three specs passed on the day they were written and returned
 * empty arrays the next. The fixture names a day inside the window instead.
 */
function recentBusinessDay(): { businessDate: Date; capturedAt: Date; dateKey: string } {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateKey = kst.toISOString().slice(0, 10);
  return {
    businessDate: new Date(`${dateKey}T00:00:00.000Z`),
    capturedAt: new Date(`${dateKey}T02:00:00.000Z`),
    dateKey,
  };
}

describe('TrendCollectionRepositoryAdapter', () => {
  it('reads Naver keyword history from the newest complete run for each date', async () => {
    const { businessDate, capturedAt, dateKey } = recentBusinessDay();
    const findMany = vi.fn().mockResolvedValue([{
      attemptPlan: { businessDate: dateKey, boardKeys: [] },
      sourceWindowStartAt: businessDate,
      sourceWindowEndAt: capturedAt,
      naverKeywordDailySnapshots: [{
        keyword: '학용품',
        businessDate,
        monthlyTotalSearchCount: 1200,
        monthlyPcSearchCount: 200,
        monthlyMobileSearchCount: 1000,
        competitionIndex: '높음',
        averageAdRank: 3,
        trendRatio: 91,
        trendDelta: 4,
        capturedAt,
      }],
    }]);
    const prisma = {
      sourcingEvidenceIngestionRun: { findMany },
    } as unknown as PrismaService;
    const adapter = new TrendCollectionRepositoryAdapter(prisma);

    const rows = await adapter.findNaverKeywordHistory({
      organizationId: 'organization-1',
      days: 7,
    });

    expect(rows).toEqual([{
      keyword: '학용품',
      businessDate,
      monthlyTotalSearchCount: 1200,
      monthlyPcSearchCount: 200,
      monthlyMobileSearchCount: 1000,
      competitionIndex: '높음',
      averageAdRank: 3,
      trendRatio: 91,
      trendDelta: 4,
      capturedAt,
    }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'organization-1',
        sourceKey: 'naver.trend',
        scopeKey: 'default',
        status: 'COMPLETE',
        OR: expect.any(Array),
      }),
      orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }, { id: 'desc' }],
    }));
  });

  it('keeps one 1688 observation per offer and source keyword', async () => {
    const { businessDate, capturedAt, dateKey } = recentBusinessDay();
    const findMany = vi.fn().mockResolvedValue([{
      targetKey: 'all',
      attemptPlan: { source: '1688.hot_product' },
      sourceWindowStartAt: null,
      sourceWindowEndAt: capturedAt,
      offerKeywordObservations: [
        {
          businessDate,
          capturedAt,
          externalOfferId: 'offer-1',
          sourceKeywordNormalized: '필통',
          rank: 1,
          title: '캐릭터 필통',
          priceCny: { toString: () => '12.5' },
          monthlySales: 100,
          rawOffer: { repurchaseRate: '20%', tradeScore: '4.8' },
          supplierName: '공급사',
          imageUrl: 'https://img.example/offer-1.jpg',
          sourceUrl: 'https://detail.1688.com/offer/1.html',
        },
        {
          businessDate,
          capturedAt,
          externalOfferId: 'offer-1',
          sourceKeywordNormalized: '문구',
          rank: 5,
          title: '캐릭터 필통',
          priceCny: null,
          monthlySales: null,
          rawOffer: {},
          supplierName: null,
          imageUrl: null,
          sourceUrl: 'https://detail.1688.com/offer/1.html',
        },
      ],
    }]);
    const prisma = {
      sourcingEvidenceIngestionRun: { findMany },
    } as unknown as PrismaService;
    const adapter = new TrendCollectionRepositoryAdapter(prisma);

    const rows = await adapter.find1688HotHistory({
      organizationId: 'organization-1',
      days: 7,
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.sourceKeyword)).toEqual(['필통', '문구']);
    expect(rows[0]).toMatchObject({
      offerId: 'offer-1',
      priceCny: 12.5,
      repurchaseRate: '20%',
      tradeScore: '4.8',
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'organization-1',
        sourceKey: '1688.hot_product',
        status: 'COMPLETE',
        OR: expect.any(Array),
      }),
      orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }, { id: 'desc' }],
    }));
  });

  it('reads TikTok history from complete runs across historical dates', async () => {
    const { businessDate, capturedAt, dateKey } = recentBusinessDay();
    const findMany = vi.fn().mockResolvedValue([{
      targetKey: 'all',
      attemptPlan: { source: 'tiktok.creative' },
      sourceWindowStartAt: null,
      sourceWindowEndAt: capturedAt,
      tiktokCreativeTrendDailySnapshots: [{
        businessDate,
        capturedAt,
        region: 'US',
        trendType: 'hashtag',
        entityKey: 'school-supplies',
        rank: 1,
        label: 'School supplies',
        industry: null,
        sourceKeyword: null,
        postCount: null,
        viewCount: null,
        growthPct: null,
        thumbnailUrl: null,
        sourceUrl: null,
      }],
    }]);
    const prisma = {
      sourcingEvidenceIngestionRun: { findMany },
    } as unknown as PrismaService;
    const adapter = new TrendCollectionRepositoryAdapter(prisma);

    await expect(adapter.findTiktokCcHistory({ organizationId: 'organization-1', days: 7 }))
      .resolves.toEqual([expect.objectContaining({
        region: 'US',
        trendType: 'hashtag',
        entityKey: 'school-supplies',
      })]);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'organization-1',
        sourceKey: 'tiktok.creative',
        scopeKey: 'default',
        targetKey: 'all',
        status: 'COMPLETE',
        OR: expect.any(Array),
      }),
      orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }, { id: 'desc' }],
    }));
  });
});
