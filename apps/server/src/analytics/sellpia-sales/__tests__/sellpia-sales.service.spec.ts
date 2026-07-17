import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SellpiaSalesService } from '../sellpia-sales.service';
import { classifySellpiaChannelGroup } from '../domain/channel-group';
import type { SellpiaSalesIngestBodyDto } from '../dto/sellpia-sales.dto';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function makePrisma() {
  const upsert = vi.fn(async () => ({}));
  const findMany = vi.fn(async () => [] as unknown[]);
  const prisma = {
    sellpiaSalesDailySnapshot: { upsert, findMany },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma, upsert, findMany };
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
}) {
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

describe('SellpiaSalesService.ingest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('판매처×일자로 organizationId 를 바인딩해 멱등 upsert 한다', async () => {
    const { prisma, upsert } = makePrisma();
    const service = new SellpiaSalesService(prisma as never);

    const body: SellpiaSalesIngestBodyDto = {
      range: { from: '2026-07-14', to: '2026-07-15' },
      sellers: [
        {
          sellerId: '129',
          sellerName: '쿠팡-직배송',
          days: [
            { date: '2026-07-14', price: 347505, amount: 336, buyPrice: 212820 },
            { date: '2026-07-15', price: 12011288, amount: 14654, buyPrice: 8593490 },
          ],
        },
        {
          sellerId: '118',
          sellerName: '스마트스토어',
          days: [{ date: '2026-07-15', price: 120680, amount: 106, buyPrice: 66700 }],
        },
      ],
    };

    const result = await service.ingest(ORGANIZATION_ID, body);

    expect(result).toEqual({
      upserted: 3,
      businessDates: ['2026-07-14', '2026-07-15'],
      sellerCount: 2,
    });
    expect(upsert).toHaveBeenCalledTimes(3);
    // rocket 분류 + tenant 스코프 검증
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_businessDate_sellerId: {
            organizationId: ORGANIZATION_ID,
            businessDate: new Date('2026-07-15T00:00:00.000Z'),
            sellerId: '129',
          },
        },
        create: expect.objectContaining({
          channelGroup: 'rocket',
          revenueKrw: 12011288,
          qty: 14654,
          costKrw: 8593490,
        }),
      }),
    );
    // others 분류
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ sellerId: '118', channelGroup: 'others' }),
      }),
    );
  });

  it('캘린더 무효 날짜(2026-06-31, 2026-13-01)는 스킵한다(잘못된 버킷 방지)', async () => {
    const { prisma, upsert } = makePrisma();
    const service = new SellpiaSalesService(prisma as never);
    const result = await service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-06-01', to: '2026-06-30' },
      sellers: [
        {
          sellerId: '129',
          sellerName: '쿠팡-직배송',
          days: [
            { date: '2026-06-31', price: 100, amount: 1, buyPrice: 50 }, // 6월 31일 없음
            { date: '2026-13-01', price: 200, amount: 2, buyPrice: 90 }, // 13월 없음
            { date: '2026-06-30', price: 300, amount: 3, buyPrice: 100 }, // 유효
          ],
        },
      ],
    });
    expect(result.upserted).toBe(1);
    expect(result.businessDates).toEqual(['2026-06-30']);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_businessDate_sellerId: {
            organizationId: ORGANIZATION_ID,
            businessDate: new Date('2026-06-30T00:00:00.000Z'),
            sellerId: '129',
          },
        },
      }),
    );
  });

  it('음수/NaN 매출은 0 으로 클램프한다', async () => {
    const { prisma, upsert } = makePrisma();
    const service = new SellpiaSalesService(prisma as never);
    await service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-07-15', to: '2026-07-15' },
      sellers: [
        {
          sellerId: '60',
          sellerName: '예스통상',
          days: [{ date: '2026-07-15', price: -100, amount: Number.NaN, buyPrice: 0 }],
        },
      ],
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ revenueKrw: 0, qty: 0, costKrw: 0 }),
      }),
    );
  });
});

describe('SellpiaSalesService.getSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rocket 단독 / others 합산 + 몰별 드릴다운으로 집계한다', async () => {
    const { prisma, findMany } = makePrisma();
    findMany.mockResolvedValueOnce([
      snap({ date: '2026-07-14', sellerId: '129', sellerName: '쿠팡-직배송', channelGroup: 'rocket', revenueKrw: 347505, qty: 336, costKrw: 212820 }),
      snap({ date: '2026-07-15', sellerId: '129', sellerName: '쿠팡-직배송', channelGroup: 'rocket', revenueKrw: 12011288, qty: 14654, costKrw: 8593490 }),
      snap({ date: '2026-07-14', sellerId: '118', sellerName: '스마트스토어', channelGroup: 'others', revenueKrw: 100000, qty: 50, costKrw: 40000 }),
      snap({ date: '2026-07-15', sellerId: '118', sellerName: '스마트스토어', channelGroup: 'others', revenueKrw: 120680, qty: 106, costKrw: 66700 }),
      snap({ date: '2026-07-15', sellerId: '113', sellerName: '쿠팡', channelGroup: 'others', revenueKrw: 50000, qty: 30, costKrw: 20000 }),
    ]);

    const service = new SellpiaSalesService(prisma as never);
    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-14', '2026-07-15');

    // rocket 단독
    expect(out.rocket.revenue).toBe(347505 + 12011288);
    expect(out.rocket.malls).toHaveLength(1);
    expect(out.rocket.daily).toEqual([
      { date: '2026-07-14', revenue: 347505, qty: 336 },
      { date: '2026-07-15', revenue: 12011288, qty: 14654 },
    ]);

    // others 합산
    expect(out.others.revenue).toBe(100000 + 120680 + 50000);
    // 몰별 드릴다운 (revenue desc)
    expect(out.others.malls.map((m) => m.sellerId)).toEqual(['118', '113']);
    expect(out.others.malls[0].daily).toEqual([
      { date: '2026-07-14', revenue: 100000, qty: 50 },
      { date: '2026-07-15', revenue: 120680, qty: 106 },
    ]);
    // others daily 는 몰 합산
    expect(out.others.daily).toEqual([
      { date: '2026-07-14', revenue: 100000, qty: 50 },
      { date: '2026-07-15', revenue: 170680, qty: 136 },
    ]);

    expect(out.totalRevenue).toBe(347505 + 12011288 + 100000 + 120680 + 50000);
    expect(out.hasData).toBe(true);
    expect(out.range).toEqual({ from: '2026-07-14', to: '2026-07-15' });
  });

  it('데이터가 없으면 hasData=false', async () => {
    const { prisma } = makePrisma();
    const service = new SellpiaSalesService(prisma as never);
    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-01', '2026-07-15');
    expect(out.hasData).toBe(false);
    expect(out.totalRevenue).toBe(0);
    expect(out.rocket.malls).toEqual([]);
    expect(out.others.malls).toEqual([]);
  });
});
