import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SellpiaSalesService } from '../sellpia-sales.service';
import { classifySellpiaChannelGroup } from '../domain/channel-group';
import { SELLPIA_SALES_COVERAGE_SELLER_ID } from '../domain/snapshot-coverage';
import type { SellpiaSalesIngestBodyDto } from '../dto/sellpia-sales.dto';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const CAPTURED_AT = '2026-07-18T02:00:00.000Z';
const EXPLICIT_EMPTY_PROVENANCE = {
  source: 'sellpia_sale_summary' as const,
  mode: 'selldate' as const,
  sellerScope: 'all' as const,
  responseShape: 'empty_object' as const,
  explicitEmpty: true as const,
};

afterEach(() => {
  vi.useRealTimers();
});

function makePrisma() {
  const deleteMany = vi.fn(async () => ({ count: 0 }));
  const createMany = vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  const findMany = vi.fn(async () => [] as unknown[]);
  const groupDates = vi.fn(
    async () => [] as Array<{
      businessDate: Date;
      _max: { capturedAt: Date | null };
    }>,
  );
  const findCoverage = vi.fn(
    async () => [] as Array<{ businessDate: Date }>,
  );
  const queryRaw = vi.fn(async () => [{ pg_advisory_xact_lock: null }]);
  const transactionDelegate = {
    sellpiaSalesDailySnapshot: {
      deleteMany,
      createMany,
      findMany: findCoverage,
      groupBy: groupDates,
    },
    $queryRaw: queryRaw,
  };
  const prisma = {
    sellpiaSalesDailySnapshot: { findMany },
    $transaction: vi.fn(
      async (operation: (tx: typeof transactionDelegate) => Promise<unknown>) =>
        operation(transactionDelegate),
    ),
  };
  return {
    prisma,
    deleteMany,
    createMany,
    findMany,
    findCoverage,
    groupDates,
    queryRaw,
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
  return { repo: { aggregateCoupangAds }, aggregateCoupangAds };
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

  it('요청 범위를 organizationId 로 원자 교체하고 날짜별 수집 완료 행을 저장한다', async () => {
    const { prisma, deleteMany, createMany, queryRaw } = makePrisma();
    const service = new SellpiaSalesService(prisma as never, makeCoupangAds().repo as never);

    const body: SellpiaSalesIngestBodyDto = {
      range: { from: '2026-07-14', to: '2026-07-15' },
      capturedAt: CAPTURED_AT,
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
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 30_000,
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        businessDate: {
          in: [
            new Date('2026-07-14T00:00:00.000Z'),
            new Date('2026-07-15T00:00:00.000Z'),
          ],
        },
      },
    });
    expect(createMany).toHaveBeenCalledTimes(1);
    const persisted = createMany.mock.calls[0]![0].data as Array<Record<string, unknown>>;
    expect(persisted).toHaveLength(5); // 실제 fact 3 + 날짜 coverage 2
    expect(persisted).toContainEqual(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      businessDate: new Date('2026-07-15T00:00:00.000Z'),
      sellerId: '129',
      channelGroup: 'rocket',
      revenueKrw: 12011288,
      qty: 14654,
      costKrw: 8593490,
    }));
    expect(persisted).toContainEqual(
      expect.objectContaining({ sellerId: '118', channelGroup: 'others' }),
    );
    expect(
      persisted.filter((row) => row.sellerId === '__kiditem_sellpia_sales_coverage__'),
    ).toHaveLength(2);
  });

  it('음수/NaN 매출은 0 으로 클램프한다', async () => {
    const { prisma, createMany } = makePrisma();
    const service = new SellpiaSalesService(prisma as never, makeCoupangAds().repo as never);
    await service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-07-15', to: '2026-07-15' },
      capturedAt: CAPTURED_AT,
      sellers: [
        {
          sellerId: '60',
          sellerName: '예스통상',
          days: [{ date: '2026-07-15', price: -100, amount: Number.NaN, buyPrice: 0 }],
        },
      ],
    });
    const persisted = createMany.mock.calls[0]![0].data as Array<Record<string, unknown>>;
    expect(persisted).toContainEqual(
      expect.objectContaining({ sellerId: '60', revenueKrw: 0, qty: 0, costKrw: 0 }),
    );
  });

  it('93일 다판매처 payload도 최대 1,000행 단위 createMany로 제한한다', async () => {
    const { prisma, createMany } = makePrisma();
    const service = new SellpiaSalesService(prisma as never, makeCoupangAds().repo as never);
    const dates = Array.from({ length: 93 }, (_, index) =>
      new Date(Date.UTC(2026, 3, 17 + index)).toISOString().slice(0, 10),
    );

    await service.ingest(ORGANIZATION_ID, {
      range: { from: dates[0]!, to: dates.at(-1)! },
      capturedAt: CAPTURED_AT,
      sellers: Array.from({ length: 20 }, (_, sellerIndex) => ({
        sellerId: String(sellerIndex + 1),
        sellerName: `판매처 ${sellerIndex + 1}`,
        days: dates.map((date) => ({ date, price: 100, amount: 1, buyPrice: 50 })),
      })),
    });

    expect(createMany).toHaveBeenCalledTimes(2);
    expect(createMany.mock.calls.map(([input]) => input.data.length)).toEqual([1_000, 953]);
  });

  it('중복 판매처×일자는 마지막 값 한 건만 저장한다', async () => {
    const { prisma, createMany } = makePrisma();
    const service = new SellpiaSalesService(prisma as never, makeCoupangAds().repo as never);

    const result = await service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-07-15', to: '2026-07-15' },
      capturedAt: CAPTURED_AT,
      sellers: [{
        sellerId: '129',
        sellerName: '쿠팡-직배송',
        days: [
          { date: '2026-07-15', price: 100, amount: 1, buyPrice: 50 },
          { date: '2026-07-15', price: 300, amount: 3, buyPrice: 150 },
        ],
      }],
    });

    expect(result.upserted).toBe(1);
    const persisted = createMany.mock.calls[0]![0].data as Array<Record<string, unknown>>;
    expect(persisted).toContainEqual(
      expect.objectContaining({ sellerId: '129', revenueKrw: 300 }),
    );
  });

  it('판매가 없는 정상 수집일도 coverage 행으로 완료 상태를 남긴다', async () => {
    const { prisma, createMany } = makePrisma();
    const service = new SellpiaSalesService(prisma as never, makeCoupangAds().repo as never);

    const result = await service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-07-15', to: '2026-07-15' },
      capturedAt: CAPTURED_AT,
      sellers: [],
      provenance: EXPLICIT_EMPTY_PROVENANCE,
    });

    expect(result).toEqual({ upserted: 0, businessDates: ['2026-07-15'], sellerCount: 0 });
    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        businessDate: new Date('2026-07-15T00:00:00.000Z'),
        sellerId: '__kiditem_sellpia_sales_coverage__',
        revenueKrw: 0,
      })],
    });
  });

  it('더 오래된 확장 캐시는 최신 coverage를 범위 교체하지 않는다', async () => {
    const { prisma, groupDates, findCoverage, deleteMany, createMany } = makePrisma();
    groupDates.mockResolvedValueOnce([{
      businessDate: new Date('2026-07-18T00:00:00.000Z'),
      _max: { capturedAt: new Date('2026-07-18T03:00:00.000Z') },
    }]);
    findCoverage.mockResolvedValueOnce([{
      businessDate: new Date('2026-07-18T00:00:00.000Z'),
    }]);
    const service = new SellpiaSalesService(prisma as never, makeCoupangAds().repo as never);

    const result = await service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-07-18', to: '2026-07-18' },
      sellers: [],
      provenance: EXPLICIT_EMPTY_PROVENANCE,
      capturedAt: '2026-07-18T02:00:00.000Z',
    });

    expect(result).toEqual({
      upserted: 0,
      businessDates: ['2026-07-18'],
      sellerCount: 0,
    });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('부분적으로 겹친 최신 날짜는 보존하고 비어 있는 날짜만 채운다', async () => {
    const { prisma, groupDates, findCoverage, deleteMany, createMany } = makePrisma();
    groupDates.mockResolvedValueOnce([{
      businessDate: new Date('2026-07-18T00:00:00.000Z'),
      _max: { capturedAt: new Date('2026-07-18T03:00:00.000Z') },
    }]);
    findCoverage.mockResolvedValueOnce([{
      businessDate: new Date('2026-07-18T00:00:00.000Z'),
    }]);
    const service = new SellpiaSalesService(prisma as never, makeCoupangAds().repo as never);

    const result = await service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-07-17', to: '2026-07-18' },
      sellers: [{
        sellerId: '129',
        sellerName: '쿠팡-직배송',
        days: [
          { date: '2026-07-17', price: 100, amount: 1, buyPrice: 50 },
          { date: '2026-07-18', price: 200, amount: 2, buyPrice: 100 },
        ],
      }],
      capturedAt: '2026-07-18T02:00:00.000Z',
    });

    expect(result.upserted).toBe(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        businessDate: { in: [new Date('2026-07-17T00:00:00.000Z')] },
      },
    });
    const persisted = createMany.mock.calls[0]![0].data as Array<Record<string, unknown>>;
    expect(persisted).toHaveLength(2); // 7/17 fact + coverage
    expect(persisted).not.toContainEqual(
      expect.objectContaining({ businessDate: new Date('2026-07-18T00:00:00.000Z') }),
    );
  });

  it('잘못된 범위·무효 날짜·범위 밖 행은 DB 변경 전에 거부한다', async () => {
    const { prisma, deleteMany } = makePrisma();
    const service = new SellpiaSalesService(prisma as never, makeCoupangAds().repo as never);

    await expect(service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-07-15', to: '2026-07-15' },
      sellers: [],
      provenance: EXPLICIT_EMPTY_PROVENANCE,
    } as SellpiaSalesIngestBodyDto)).rejects.toThrow(/capturedAt.*필수/);
    await expect(service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-07-16', to: '2026-07-15' },
      capturedAt: CAPTURED_AT,
      sellers: [],
      provenance: EXPLICIT_EMPTY_PROVENANCE,
    })).rejects.toThrow(/이후/);
    await expect(service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-06-01', to: '2026-06-30' },
      capturedAt: CAPTURED_AT,
      sellers: [{
        sellerId: '129',
        sellerName: '쿠팡-직배송',
        days: [{ date: '2026-06-31', price: 100, amount: 1, buyPrice: 50 }],
      }],
    })).rejects.toThrow(/유효하지 않은 매출 일자/);
    await expect(service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-07-15', to: '2026-07-15' },
      capturedAt: CAPTURED_AT,
      sellers: [{
        sellerId: '129',
        sellerName: '쿠팡-직배송',
        days: [{ date: '2026-07-14', price: 100, amount: 1, buyPrice: 50 }],
      }],
    })).rejects.toThrow(/범위/);
    await expect(service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-01-01', to: '2026-04-11' },
      capturedAt: CAPTURED_AT,
      sellers: [],
      provenance: EXPLICIT_EMPTY_PROVENANCE,
    })).rejects.toThrow(/최대 100일/);

    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('증명 없는 빈 결과와 판매처의 부분 결과는 DB 범위 교체 전에 거부한다', async () => {
    const { prisma, deleteMany, createMany } = makePrisma();
    const service = new SellpiaSalesService(prisma as never, makeCoupangAds().repo as never);

    await expect(service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-07-18', to: '2026-07-18' },
      capturedAt: CAPTURED_AT,
      sellers: [],
    })).rejects.toThrow(/명시적 빈 결과 증명/);

    await expect(service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-07-18', to: '2026-07-18' },
      capturedAt: CAPTURED_AT,
      sellers: [{ sellerId: '118', sellerName: '스마트스토어', days: [] }],
    })).rejects.toThrow(/일자별 매출이 비어/);

    await expect(service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-07-18', to: '2026-07-18' },
      capturedAt: CAPTURED_AT,
      sellers: [{
        sellerId: '118',
        sellerName: '스마트스토어',
        days: [{ date: '2026-07-18', price: 1, amount: 1, buyPrice: 1 }],
      }],
      provenance: EXPLICIT_EMPTY_PROVENANCE,
    })).rejects.toThrow(/판매처가 없을 때만/);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
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
      snap({ date: '2026-07-14', sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID, sellerName: 'KidItem 수집 완료', channelGroup: 'others', revenueKrw: 0 }),
      snap({ date: '2026-07-15', sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID, sellerName: 'KidItem 수집 완료', channelGroup: 'others', revenueKrw: 0 }),
    ]);

    const coupangAds = makeCoupangAds(100_000, true);
    const service = new SellpiaSalesService(prisma as never, coupangAds.repo as never);
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
    expect(out.totalCost).toBe(212820 + 8593490 + 40000 + 66700 + 20000);
    expect(out.adCost).toBe(100_000);
    expect(out.netProfit).toBe(out.totalRevenue - out.totalCost - 100_000);
    expect(out.profitRate).toBe(28.5);
    expect(out.hasData).toBe(true);
    expect(out.range).toEqual({ from: '2026-07-14', to: '2026-07-15' });
    expect(coupangAds.aggregateCoupangAds).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      new Date('2026-07-13T15:00:00.000Z'),
      new Date('2026-07-15T15:00:00.000Z'),
    );
  });

  it('데이터가 없으면 hasData=false', async () => {
    const { prisma } = makePrisma();
    const service = new SellpiaSalesService(prisma as never, makeCoupangAds().repo as never);
    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-01', '2026-07-15');
    expect(out.hasData).toBe(false);
    expect(out.totalRevenue).toBe(0);
    expect(out.totalCost).toBe(0);
    expect(out.adCost).toBe(0);
    expect(out.netProfit).toBe(0);
    expect(out.profitRate).toBe(0);
    expect(out.rocket.malls).toEqual([]);
    expect(out.others.malls).toEqual([]);
  });

  it('조회 기간 일부 날짜만 coverage되면 부분 합계를 홈 KPI로 채택하지 않는다', async () => {
    const { prisma, findMany } = makePrisma();
    findMany.mockResolvedValueOnce([
      snap({ date: '2026-07-14', sellerId: '129', sellerName: '쿠팡-직배송', channelGroup: 'rocket', revenueKrw: 1_000 }),
      snap({ date: '2026-07-14', sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID, sellerName: 'KidItem 수집 완료', channelGroup: 'others', revenueKrw: 0 }),
    ]);
    const service = new SellpiaSalesService(prisma as never, makeCoupangAds().repo as never);

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-14', '2026-07-15');

    expect(out.totalRevenue).toBe(1_000);
    expect(out.hasData).toBe(false);
  });

  it('어제까지 완료된 월·주 범위는 오늘 coverage 전에도 준비된 합계로 판정한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T10:00:00.000Z'));
    const { prisma, findMany } = makePrisma();
    findMany.mockResolvedValueOnce([
      snap({
        date: '2026-07-17',
        sellerId: '118',
        sellerName: '스마트스토어',
        channelGroup: 'others',
        revenueKrw: 1_000,
      }),
      snap({
        date: '2026-07-17',
        sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        sellerName: 'KidItem 수집 완료',
        channelGroup: 'others',
        revenueKrw: 0,
      }),
    ]);
    const service = new SellpiaSalesService(prisma as never, makeCoupangAds().repo as never);

    const closedRange = await service.getSummary(
      ORGANIZATION_ID,
      '2026-07-17',
      '2026-07-18',
    );
    const todayOnly = await service.getSummary(
      ORGANIZATION_ID,
      '2026-07-18',
      '2026-07-18',
    );

    expect(closedRange.hasData).toBe(true);
    expect(closedRange.totalRevenue).toBe(1_000);
    expect(closedRange.others.daily).toEqual([
      { date: '2026-07-17', revenue: 1_000, qty: 0 },
    ]);
    expect(todayOnly.hasData).toBe(false);
  });

  it('sentinel 없는 legacy fact는 검증된 합계와 마지막 수집시각에서 제외한다', async () => {
    const { prisma, findMany } = makePrisma();
    findMany.mockResolvedValueOnce([
      snap({
        date: '2026-07-15',
        sellerId: '118',
        sellerName: '스마트스토어',
        channelGroup: 'others',
        revenueKrw: 9_999,
      }),
    ]);
    const service = new SellpiaSalesService(prisma as never, makeCoupangAds().repo as never);

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-15', '2026-07-15');

    expect(out.hasData).toBe(false);
    expect(out.totalRevenue).toBe(0);
    expect(out.lastCapturedAt).toBeNull();
  });

  it('coverage-only 일자는 수집된 0원 매출로 반환하고 몰 집계에서는 숨긴다', async () => {
    const { prisma, findMany } = makePrisma();
    findMany.mockResolvedValueOnce([
      snap({
        date: '2026-07-15',
        sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        sellerName: 'KidItem 수집 완료',
        channelGroup: 'others',
        revenueKrw: 0,
      }),
    ]);
    const service = new SellpiaSalesService(prisma as never, makeCoupangAds().repo as never);

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-15', '2026-07-15');

    expect(out.hasData).toBe(true);
    expect(out.totalRevenue).toBe(0);
    expect(out.profitRate).toBe(0);
    expect(out.rocket.daily).toEqual([{ date: '2026-07-15', revenue: 0, qty: 0 }]);
    expect(out.others.daily).toEqual([{ date: '2026-07-15', revenue: 0, qty: 0 }]);
    expect(out.rocket.malls).toEqual([]);
    expect(out.others.malls).toEqual([]);
    expect(out.lastCapturedAt).toBe('2026-07-15T01:00:00.000Z');
  });

  it('수집 광고비까지 차감한 순이익이 적자면 이익률도 음수로 계산한다', async () => {
    const { prisma, findMany } = makePrisma();
    findMany.mockResolvedValueOnce([
      snap({
        date: '2026-07-15',
        sellerId: '118',
        sellerName: '스마트스토어',
        channelGroup: 'others',
        revenueKrw: 100_000,
        costKrw: 80_000,
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
      prisma as never,
      makeCoupangAds(50_000, true).repo as never,
    );

    const out = await service.getSummary(ORGANIZATION_ID, '2026-07-15', '2026-07-15');

    expect(out.netProfit).toBe(-30_000);
    expect(out.profitRate).toBe(-30);
  });
});
