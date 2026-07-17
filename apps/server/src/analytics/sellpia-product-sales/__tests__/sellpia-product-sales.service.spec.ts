import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SellpiaProductSalesService } from '../sellpia-product-sales.service';
import type { SellpiaProductSalesIngestBodyDto } from '../dto/sellpia-product-sales.dto';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function makePrisma() {
  const upsert = vi.fn(async () => ({}));
  const createMany = vi.fn((args: unknown) => Promise.resolve({ count: (args as { data: unknown[] }).data.length }));
  const deleteMany = vi.fn(() => Promise.resolve({ count: 0 }));
  const findMany = vi.fn(async () => [] as unknown[]);
  const inventoryFindMany = vi.fn(async () => [] as unknown[]);
  const prisma = {
    sellpiaProductMonthlySales: { upsert, createMany, deleteMany, findMany },
    sellpiaInventorySku: { findMany: inventoryFindMany },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma, upsert, createMany, deleteMany, findMany, inventoryFindMany };
}

function row(o: {
  productCode: string;
  optionCode?: string;
  yearMonth: string;
  orderQty: number;
  productName?: string;
  providerName?: string;
  capturedAt?: string;
}) {
  return {
    productCode: o.productCode,
    optionCode: o.optionCode ?? '1',
    yearMonth: o.yearMonth,
    orderQty: o.orderQty,
    productName: o.productName ?? '상품',
    optionName: null,
    providerName: o.providerName ?? '해피프렌즈',
    salePrice: 1100,
    buyPrice: 580,
    barcode: '880',
    capturedAt: new Date(o.capturedAt ?? '2026-07-16T01:00:00.000Z'),
  };
}

describe('SellpiaProductSalesService.ingest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('조직 범위 전체를 원자적으로 교체(deleteMany + 벌크 createMany)한다', async () => {
    const { prisma, deleteMany, createMany } = makePrisma();
    const service = new SellpiaProductSalesService(prisma as never);
    const body: SellpiaProductSalesIngestBodyDto = {
      range: { from: '2026-05-16', to: '2026-07-15' },
      products: [
        {
          productCode: '9882',
          optionCode: '1',
          productName: '2000바풍투톤슬라임',
          salePrice: 1100,
          buyPrice: 580,
          barcode: '8806384802382',
          months: [
            { yearMonth: '2026-06', orderQty: 13030, orderAmount: 11909813, inQty: 0, inAmount: 0 },
            { yearMonth: '2026-07', orderQty: 8903, orderAmount: 8114828, inQty: 0, inAmount: 0 },
          ],
        },
      ],
    };
    const result = await service.ingest(ORGANIZATION_ID, body);
    expect(result).toEqual({ upserted: 2, productCount: 1, months: ['2026-06', '2026-07'] });
    // 페이로드에 담긴 연월만 삭제(과거 월 히스토리 보존) 후 벌크 insert (단일 트랜잭션)
    expect(deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORGANIZATION_ID, yearMonth: { in: ['2026-06', '2026-07'] } },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const inserted = createMany.mock.calls.flatMap((c) => (c[0] as { data: unknown[] }).data);
    expect(inserted).toHaveLength(2);
    expect(inserted).toContainEqual(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        productCode: '9882',
        optionCode: '1',
        yearMonth: '2026-06',
        orderQty: 13030,
        productName: '2000바풍투톤슬라임',
      }),
    );
  });

  it('페이로드 내 (상품·옵션·연월) 중복은 마지막 값으로 병합한다', async () => {
    const { prisma, createMany } = makePrisma();
    const service = new SellpiaProductSalesService(prisma as never);
    await service.ingest(ORGANIZATION_ID, {
      range: { from: '2026-06-01', to: '2026-06-30' },
      products: [
        { productCode: '1', optionCode: '', productName: 'A', salePrice: 0, buyPrice: 0, months: [{ yearMonth: '2026-06', orderQty: 5, orderAmount: 0, inQty: 0, inAmount: 0 }] },
        { productCode: '1', optionCode: '', productName: 'A', salePrice: 0, buyPrice: 0, months: [{ yearMonth: '2026-06', orderQty: 9, orderAmount: 0, inQty: 0, inAmount: 0 }] },
      ],
    });
    const inserted = prisma.$transaction.mock.calls.length ? createMany.mock.calls.flatMap((c) => (c[0] as { data: { orderQty: number }[] }).data) : [];
    expect(inserted).toHaveLength(1); // 중복 병합
    expect(inserted[0].orderQty).toBe(9); // 마지막 값
  });
});

describe('SellpiaProductSalesService.getSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T01:00:00.000Z')); // KST 2026-07-16 → currentYm=2026-07
  });
  afterEach(() => vi.useRealTimers());

  it('완결 월 기준 1개월/2개월/월평균 소진량 + 월별 추이를 산정한다(현재월 제외)', async () => {
    const { prisma, findMany } = makePrisma();
    findMany.mockResolvedValueOnce([
      row({ productCode: '9882', yearMonth: '2026-05', orderQty: 133 }),
      row({ productCode: '9882', yearMonth: '2026-06', orderQty: 13030 }),
      row({ productCode: '9882', yearMonth: '2026-07', orderQty: 8903 }), // 현재월(진행중) → 평균 제외
      row({ productCode: '3189', yearMonth: '2026-05', orderQty: 500, productName: '지도' }),
      row({ productCode: '3189', yearMonth: '2026-06', orderQty: 453, productName: '지도' }),
    ]);

    const service = new SellpiaProductSalesService(prisma as never);
    const out = await service.getSummary(ORGANIZATION_ID);

    expect(out.months).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(out.completeMonths).toEqual(['2026-05', '2026-06']); // 07 제외
    expect(out.hasData).toBe(true);

    // 정렬: avg2m desc → 9882 먼저
    const p1 = out.products[0];
    expect(p1.productCode).toBe('9882');
    expect(p1.qty1m).toBe(13030); // 최근 완결 월(2026-06)
    expect(p1.qty2m).toBe(133 + 13030); // 2026-05 + 2026-06
    expect(p1.avg2m).toBe(Math.round((133 + 13030) / 2));
    expect(p1.totalQty).toBe(133 + 13030 + 8903); // 전체(07 포함)
    expect(p1.monthly).toEqual([
      { yearMonth: '2026-05', orderQty: 133 },
      { yearMonth: '2026-06', orderQty: 13030 },
      { yearMonth: '2026-07', orderQty: 8903 },
    ]);

    const p2 = out.products[1];
    expect(p2.productCode).toBe('3189');
    expect(p2.qty1m).toBe(453);
    expect(p2.avg2m).toBe(Math.round((500 + 453) / 2));
    // 3189 는 2026-07 데이터 없음 → monthly 에 0 채움
    expect(p2.monthly[2]).toEqual({ yearMonth: '2026-07', orderQty: 0 });
  });

  it('재고관리 파생 지표(ABC/현재고 미수집/요약 카운트)를 채운다', async () => {
    const { prisma, findMany } = makePrisma();
    findMany.mockResolvedValueOnce([
      row({ productCode: '9882', yearMonth: '2026-05', orderQty: 133 }),
      row({ productCode: '9882', yearMonth: '2026-06', orderQty: 13030 }), // 지배적 → A
      row({ productCode: '3189', yearMonth: '2026-05', orderQty: 500, productName: '지도' }),
      row({ productCode: '3189', yearMonth: '2026-06', orderQty: 453, productName: '지도' }),
    ]);

    const service = new SellpiaProductSalesService(prisma as never);
    const out = await service.getSummary(ORGANIZATION_ID);

    // 재고 미수집 → 전 상품 현재고 null, 발주 없음
    expect(out.hasStock).toBe(false);
    expect(out.stockCapturedAt).toBeNull();
    expect(out.reorderCount).toBe(0);
    expect(out.leadTimeMonths).toBe(1);
    for (const p of out.products) {
      expect(p.currentStock).toBeNull();
      expect(p.needsReorder).toBe(false);
      expect(p.reorderPoint).toBeNull();
    }

    // ABC: 9882 가 총 소진량 지배 → A, 3189 → C
    const byCode = Object.fromEntries(out.products.map((p) => [p.productCode, p]));
    expect(byCode['9882'].abcGrade).toBe('A');
    expect(byCode['3189'].abcGrade).toBe('C');
    expect(out.abcCounts).toEqual({ a: 1, b: 0, c: 1 });

    // 완결 월 2개(<8) → 시즌 판단 보류
    expect(byCode['9882'].seasonTag).toBeNull();
  });

  it('재고 수집 시 현재고 조인 + 발주 알림을 산정한다', async () => {
    const { prisma, findMany, inventoryFindMany } = makePrisma();
    findMany.mockResolvedValueOnce([
      row({ productCode: '9882', yearMonth: '2026-05', orderQty: 400 }),
      row({ productCode: '9882', yearMonth: '2026-06', orderQty: 400 }), // 월평균 400 → 발주점 600
      row({ productCode: '3189', yearMonth: '2026-05', orderQty: 400, productName: '지도' }),
      row({ productCode: '3189', yearMonth: '2026-06', orderQty: 400, productName: '지도' }),
    ]);
    inventoryFindMany.mockResolvedValueOnce([
      { code: '9882', barcode: '880-9882', currentStock: 200, lastImportRun: { lastVerifiedAt: new Date('2026-07-16T00:00:00Z') } }, // 200 ≤ 600 → 발주
      { code: '3189', barcode: '880-3189', currentStock: 5000, lastImportRun: { lastVerifiedAt: new Date('2026-07-16T01:00:00Z') } }, // 충분
    ]);

    const service = new SellpiaProductSalesService(prisma as never);
    const out = await service.getSummary(ORGANIZATION_ID);
    expect(out.hasStock).toBe(true);
    expect(out.stockCapturedAt).toBe('2026-07-16T01:00:00.000Z');
    expect(inventoryFindMany).toHaveBeenCalledWith({
      where: { organizationId: ORGANIZATION_ID, isActive: true },
      select: {
        code: true,
        barcode: true,
        currentStock: true,
        lastImportRun: { select: { lastVerifiedAt: true } },
      },
    });
    const byCode = Object.fromEntries(out.products.map((p) => [p.productCode, p]));
    expect(byCode['9882'].currentStock).toBe(200);
    expect(byCode['9882'].reorderPoint).toBe(600);
    expect(byCode['9882'].needsReorder).toBe(true);
    expect(byCode['9882'].monthsOfStockLeft).toBe(0.5);
    expect(byCode['3189'].currentStock).toBe(5000);
    expect(byCode['3189'].needsReorder).toBe(false);
    expect(out.reorderCount).toBe(1);
  });

  it('재고 수집됐지만 매칭 없는 상품은 현재고 0(품절)', async () => {
    const { prisma, findMany, inventoryFindMany } = makePrisma();
    findMany.mockResolvedValueOnce([
      row({ productCode: '9882', yearMonth: '2026-06', orderQty: 100 }),
    ]);
    inventoryFindMany.mockResolvedValueOnce([
      { code: '0000', barcode: null, currentStock: 10, lastImportRun: { lastVerifiedAt: new Date('2026-07-16T00:00:00Z') } },
    ]);
    const service = new SellpiaProductSalesService(prisma as never);
    const out = await service.getSummary(ORGANIZATION_ID);
    expect(out.hasStock).toBe(true);
    expect(out.products[0].currentStock).toBe(0); // 매칭 없음 → 0
  });

  it('데이터 없으면 hasData=false', async () => {
    const { prisma } = makePrisma();
    const service = new SellpiaProductSalesService(prisma as never);
    const out = await service.getSummary(ORGANIZATION_ID);
    expect(out.hasData).toBe(false);
    expect(out.products).toEqual([]);
    expect(out.totalQty).toBe(0);
  });

  it('상품코드 우선, 옵션코드 폴백, 고유 바코드 순으로 현재고를 찾는다', async () => {
    const { prisma, findMany, inventoryFindMany } = makePrisma();
    findMany.mockResolvedValueOnce([
      { ...row({ productCode: 'P-PRIMARY', optionCode: 'OPT-OTHER', yearMonth: '2026-06', orderQty: 10 }), barcode: 'BAR-1' },
      { ...row({ productCode: 'P-MISSING', optionCode: 'OPT-FALLBACK', yearMonth: '2026-06', orderQty: 10 }), barcode: 'BAR-2' },
      { ...row({ productCode: 'P-BARCODE', optionCode: '', yearMonth: '2026-06', orderQty: 10 }), barcode: 'BAR-3' },
      { ...row({ productCode: 'P-DUP-BARCODE', optionCode: '', yearMonth: '2026-06', orderQty: 10 }), barcode: 'BAR-DUP' },
    ]);
    inventoryFindMany.mockResolvedValueOnce([
      { code: 'P-PRIMARY', barcode: 'BAR-X', currentStock: 11, lastImportRun: { lastVerifiedAt: new Date('2026-07-16T00:00:00Z') } },
      { code: 'OPT-OTHER', barcode: 'BAR-1', currentStock: 99, lastImportRun: { lastVerifiedAt: new Date('2026-07-16T00:00:00Z') } },
      { code: 'OPT-FALLBACK', barcode: 'BAR-X2', currentStock: 22, lastImportRun: { lastVerifiedAt: new Date('2026-07-16T00:00:00Z') } },
      { code: 'SKU-BARCODE', barcode: 'BAR-3', currentStock: 33, lastImportRun: { lastVerifiedAt: new Date('2026-07-16T00:00:00Z') } },
      { code: 'SKU-DUP-1', barcode: 'BAR-DUP', currentStock: 44, lastImportRun: { lastVerifiedAt: new Date('2026-07-16T00:00:00Z') } },
      { code: 'SKU-DUP-2', barcode: 'BAR-DUP', currentStock: 55, lastImportRun: { lastVerifiedAt: new Date('2026-07-16T00:00:00Z') } },
    ]);

    const out = await new SellpiaProductSalesService(prisma as never).getSummary(ORGANIZATION_ID);
    const byCode = Object.fromEntries(out.products.map((product) => [product.productCode, product]));

    expect(byCode['P-PRIMARY'].currentStock).toBe(11);
    expect(byCode['P-MISSING'].currentStock).toBe(22);
    expect(byCode['P-BARCODE'].currentStock).toBe(33);
    expect(byCode['P-DUP-BARCODE'].currentStock).toBe(0);
  });
});
