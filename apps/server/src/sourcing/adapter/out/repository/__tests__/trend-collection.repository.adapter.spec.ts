import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import { TrendCollectionRepositoryAdapter } from '../trend-collection.repository.adapter';

describe('TrendCollectionRepositoryAdapter', () => {
  it('reads Naver keyword history from the typed daily projection', async () => {
    const businessDate = new Date('2026-07-29T00:00:00.000Z');
    const capturedAt = new Date('2026-07-29T02:00:00.000Z');
    const findMany = vi.fn().mockResolvedValue([{
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
    const prisma = {
      naverKeywordDailySnapshot: { findMany },
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
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization-1',
        businessDate: { gte: expect.any(Date) },
      },
      orderBy: [{ keyword: 'asc' }, { businessDate: 'asc' }],
    });
  });

  it('keeps one 1688 observation per offer and source keyword', async () => {
    const businessDate = new Date('2026-07-29T00:00:00.000Z');
    const capturedAt = new Date('2026-07-29T02:00:00.000Z');
    const findMany = vi.fn().mockResolvedValue([
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
    ]);
    const prisma = {
      sourcing1688OfferKeywordObservation: { findMany },
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
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization-1',
        businessDate: { gte: expect.any(Date) },
      },
      orderBy: [{ businessDate: 'asc' }, { rank: 'asc' }],
    });
  });
});
