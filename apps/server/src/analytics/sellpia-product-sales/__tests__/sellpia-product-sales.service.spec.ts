import { Prisma } from '@prisma/client';
import { PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD } from '@kiditem/shared/product-abc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SellpiaProductSalesService } from '../sellpia-product-sales.service';
import { SellpiaProductInventoryReader } from '../sellpia-product-inventory-reader';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function makePrisma() {
  const findMany = vi.fn(async () => [] as unknown[]);
  const inventoryFindMany = vi.fn(async () => [] as unknown[]);
  const destinationFindMany = vi.fn(async () => [] as unknown[]);
  const inventoryAvailability = vi.fn(async () => ({
    snapshot: { collected: false, generation: null, verifiedAt: null },
    items: [],
  }));
  const prisma = {
    masterProductAbcFormulaState: { findUnique: vi.fn(async () => null) },
    sourceImportRun: {
      findFirst: vi.fn().mockResolvedValue({ id: 'complete-generation' }),
    },
    sellpiaProductMonthlySales: { findMany },
    sellpiaInventorySku: { findMany: inventoryFindMany },
    channelListingOptionInventoryComponent: { findMany: destinationFindMany },
  };
  const inventoryReader = new SellpiaProductInventoryReader(
    prisma as never,
    { findBySkuIds: inventoryAvailability } as never,
    { findDisplayMedia: vi.fn(async () => new Map()) } as never,
    missingEvidence(),
  );
  const Service = SellpiaProductSalesService as unknown as new (
    prisma: unknown,
    inventoryReader: unknown,
  ) => SellpiaProductSalesService;
  const service = new Service(prisma, inventoryReader);
  return {
    prisma,
    service,
    findMany,
    inventoryFindMany,
    destinationFindMany,
    inventoryAvailability,
  };
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
    orderAmount: o.orderQty * 100,
    productName: o.productName ?? '상품',
    optionName: null,
    providerName: o.providerName ?? '해피프렌즈',
    salePrice: 1100,
    buyPrice: 580,
    barcode: '880',
    capturedAt: new Date(o.capturedAt ?? '2026-07-16T01:00:00.000Z'),
  };
}

describe('SellpiaProductSalesService.getSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T01:00:00.000Z')); // KST 2026-07-16 → currentYm=2026-07
  });
  afterEach(() => vi.useRealTimers());

  it('완결 월 기준 1개월/2개월/월평균 소진량 + 월별 추이를 산정한다(현재월 제외)', async () => {
    const { service, findMany } = makePrisma();
    findMany.mockResolvedValueOnce([
      row({ productCode: '9882', yearMonth: '2026-05', orderQty: 133 }),
      row({ productCode: '9882', yearMonth: '2026-06', orderQty: 13030 }),
      row({ productCode: '9882', yearMonth: '2026-07', orderQty: 8903 }), // 현재월(진행중) → 평균 제외
      row({ productCode: '3189', yearMonth: '2026-05', orderQty: 500, productName: '지도' }),
      row({ productCode: '3189', yearMonth: '2026-06', orderQty: 453, productName: '지도' }),
    ]);

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

  it('동적 행 등급 없이 현재고 미수집 상태와 운영상품 등급 요약을 채운다', async () => {
    const { service, findMany } = makePrisma();
    findMany.mockResolvedValueOnce([
      row({ productCode: '9882', yearMonth: '2026-05', orderQty: 133 }),
      row({ productCode: '9882', yearMonth: '2026-06', orderQty: 13030 }),
      row({ productCode: '3189', yearMonth: '2026-05', orderQty: 500, productName: '지도' }),
      row({ productCode: '3189', yearMonth: '2026-06', orderQty: 453, productName: '지도' }),
    ]);

    const out = await service.getSummary(ORGANIZATION_ID);

    // 재고 미수집 → 명시적 not_collected, 발주 없음
    expect(out.hasStock).toBe(false);
    expect(out.stockCapturedAt).toBeNull();
    expect(out.stockGeneration).toBeNull();
    expect(out.reorderCount).toBe(0);
    expect(out.leadTimeMonths).toBe(1);
    for (const p of out.products) {
      expect(p.inventoryResolution).toEqual({ status: 'not_collected' });
      expect(p.needsReorder).toBe(false);
      expect(p.reorderPoint).toBeNull();
    }

    const byCode = Object.fromEntries(out.products.map((p) => [p.productCode, p]));
    expect(byCode['9882']).not.toHaveProperty('abcGrade');
    expect(byCode['3189']).not.toHaveProperty('abcGrade');
    expect(out.abcCounts).toEqual({ A: 0, B: 0, C: 0 });
    expect(out.classifiedProductCount).toBe(0);
    expect(out.unclassifiedProductCount).toBe(0);

    // 완결 월 2개(<8) → 시즌 판단 보류
    expect(byCode['9882'].seasonTag).toBeNull();
  });

  it('재고 수집 시 현재고 조인 + 발주 알림을 산정한다', async () => {
    const {
      service,
      findMany,
      inventoryFindMany,
      inventoryAvailability,
    } = makePrisma();
    findMany.mockResolvedValueOnce([
      row({ productCode: '9882', yearMonth: '2026-05', orderQty: 400 }),
      row({ productCode: '9882', yearMonth: '2026-06', orderQty: 400 }), // 월평균 400 → 발주점 600
      row({ productCode: '3189', yearMonth: '2026-05', orderQty: 400, productName: '지도' }),
      row({ productCode: '3189', yearMonth: '2026-06', orderQty: 400, productName: '지도' }),
    ]);
    const inventoryRows = [
      inventoryRow(1, '9882', 200, '880-9882'),
      inventoryRow(2, '3189', 5000, '880-3189'),
    ];
    inventoryFindMany.mockResolvedValueOnce(inventoryRows);
    inventoryAvailability.mockResolvedValueOnce(collectedInventory(inventoryRows));

    const out = await service.getSummary(ORGANIZATION_ID);
    expect(out.hasStock).toBe(true);
    expect(out.stockCapturedAt).toBe('2026-07-16T01:00:00.000Z');
    expect(out.stockGeneration).toBe('12');
    expect(inventoryFindMany).toHaveBeenCalledWith({
      where: { organizationId: ORGANIZATION_ID },
      select: {
        id: true,
        code: true,
        barcode: true,
        isActive: true,
        masterProduct: {
          select: {
            id: true,
            code: true,
            name: true,
            createdAt: true,
            abcEvaluation: { include: { formulaVersion: true } },
          },
        },
      },
    });
    expect(inventoryAvailability).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sellpiaInventorySkuIds: inventoryRows.map(({ id }) => id),
    });
    const byCode = Object.fromEntries(out.products.map((p) => [p.productCode, p]));
    expect(byCode['9882'].inventoryResolution).toMatchObject({
      status: 'matched',
      currentStock: 200,
      availableStock: 200,
    });
    expect(byCode['9882'].reorderPoint).toBe(600);
    expect(byCode['9882'].needsReorder).toBe(true);
    expect(byCode['9882'].monthsOfAvailableStockLeft).toBe(0.5);
    expect(byCode['3189'].inventoryResolution).toMatchObject({
      status: 'matched',
      currentStock: 5000,
      availableStock: 5000,
    });
    expect(byCode['3189'].needsReorder).toBe(false);
    expect(out.reorderCount).toBe(1);
  });

  it('재고상품의 canonical MasterProduct 등급을 채널 연결 수와 무관하게 집계한다', async () => {
    const {
      service,
      findMany,
      inventoryFindMany,
      inventoryAvailability,
      destinationFindMany,
    } = makePrisma();
    findMany.mockResolvedValueOnce([
      row({ productCode: 'SKU-1', yearMonth: '2026-06', orderQty: 10 }),
      row({ productCode: 'SKU-2', yearMonth: '2026-06', orderQty: 20 }),
    ]);
    const inventoryRows = [
      {
        ...inventoryRow(1, 'SKU-1', 100, null),
        masterProduct: inventoryMasterProduct('master-a', 'A'),
      },
      {
        ...inventoryRow(2, 'SKU-2', 100, null),
        masterProduct: inventoryMasterProduct('master-c', 'C'),
      },
    ];
    inventoryFindMany.mockResolvedValueOnce(inventoryRows);
    inventoryAvailability.mockResolvedValueOnce(collectedInventory(inventoryRows));
    destinationFindMany.mockResolvedValueOnce([
      destinationRow(inventoryRows[0].id, 'variant-a1', 'master-a', 'A'),
      destinationRow(inventoryRows[0].id, 'variant-a2', 'master-a', 'A'),
      destinationRow(inventoryRows[1].id, 'variant-a3', 'master-a', 'A'),
      destinationRow(inventoryRows[1].id, 'variant-c', 'master-c', 'C'),
      destinationRow(inventoryRows[1].id, 'variant-null', 'master-null', null),
    ]);

    const out = await service.getSummary(ORGANIZATION_ID);

    expect(out.abcCounts).toEqual({ A: 1, B: 0, C: 1 });
    expect(out.classifiedProductCount).toBe(2);
    expect(out.unclassifiedProductCount).toBe(0);
    expect(out.products.flatMap((product) =>
      product.inventoryResolution.status === 'matched'
        ? product.inventoryResolution.destinations
        : [])).toEqual(expect.arrayContaining([
      expect.objectContaining({ masterProductId: 'master-a', abc: expect.objectContaining({ abcGrade: 'A' }) }),
      expect.objectContaining({ masterProductId: 'master-c', abc: expect.objectContaining({ abcGrade: 'C' }) }),
    ]));
  });

  it('재고 수집됐지만 매칭 없는 상품은 품절로 만들지 않고 검토 대상으로 남긴다', async () => {
    const {
      service,
      findMany,
      inventoryFindMany,
      inventoryAvailability,
    } = makePrisma();
    findMany.mockResolvedValueOnce([
      row({ productCode: '9882', yearMonth: '2026-06', orderQty: 100 }),
    ]);
    inventoryFindMany.mockResolvedValueOnce([
      inventoryRow(1, '0000', 10, null),
    ]);
    inventoryAvailability.mockResolvedValueOnce(collectedInventory([]));
    const out = await service.getSummary(ORGANIZATION_ID);
    expect(out.hasStock).toBe(true);
    expect(out.products[0].inventoryResolution).toEqual({
      status: 'mapping_required',
      reason: 'not_found',
      candidateCount: 0,
    });
    expect(out.products[0].reorderPoint).toBeNull();
    expect(out.products[0].needsReorder).toBe(false);
  });

  it('데이터 없으면 hasData=false', async () => {
    const { service } = makePrisma();
    const out = await service.getSummary(ORGANIZATION_ID);
    expect(out.hasData).toBe(false);
    expect(out.products).toEqual([]);
    expect(out.totalQty).toBe(0);
  });

  it('상품코드 우선, 옵션코드 폴백, 고유 바코드 순으로 현재고를 찾는다', async () => {
    const {
      service,
      findMany,
      inventoryFindMany,
      inventoryAvailability,
    } = makePrisma();
    findMany.mockResolvedValueOnce([
      { ...row({ productCode: 'P-PRIMARY', optionCode: 'OPT-OTHER', yearMonth: '2026-06', orderQty: 10 }), barcode: 'BAR-1' },
      { ...row({ productCode: 'P-MISSING', optionCode: 'OPT-FALLBACK', yearMonth: '2026-06', orderQty: 10 }), barcode: 'BAR-2' },
      { ...row({ productCode: 'P-BARCODE', optionCode: '', yearMonth: '2026-06', orderQty: 10 }), barcode: 'BAR-3' },
      { ...row({ productCode: 'P-DUP-BARCODE', optionCode: '', yearMonth: '2026-06', orderQty: 10 }), barcode: 'BAR-DUP' },
    ]);
    const inventoryRows = [
      inventoryRow(1, 'P-PRIMARY', 11, 'BAR-X'),
      inventoryRow(2, 'OPT-OTHER', 99, 'BAR-1'),
      inventoryRow(3, 'OPT-FALLBACK', 22, 'BAR-X2'),
      inventoryRow(4, 'SKU-BARCODE', 33, 'BAR-3'),
      inventoryRow(5, 'SKU-DUP-1', 44, 'BAR-DUP'),
      inventoryRow(6, 'SKU-DUP-2', 55, 'BAR-DUP'),
    ];
    inventoryFindMany.mockResolvedValueOnce(inventoryRows);
    inventoryAvailability.mockResolvedValueOnce(collectedInventory(inventoryRows));

    const out = await service.getSummary(ORGANIZATION_ID);
    const byCode = Object.fromEntries(out.products.map((product) => [product.productCode, product]));

    expect(byCode['P-PRIMARY'].inventoryResolution).toMatchObject({ currentStock: 11 });
    expect(byCode['P-MISSING'].inventoryResolution).toMatchObject({ currentStock: 22 });
    expect(byCode['P-BARCODE'].inventoryResolution).toMatchObject({ currentStock: 33 });
    expect(byCode['P-DUP-BARCODE'].inventoryResolution).toEqual({
      status: 'mapping_required',
      reason: 'ambiguous_barcode',
      candidateCount: 2,
    });
  });

  it('판매·재고 상품코드가 `{상품코드}-{옵션번호}` 결합형이면 exact 키로 현재고를 조인한다', async () => {
    const {
      service,
      findMany,
      inventoryFindMany,
      inventoryAvailability,
    } = makePrisma();
    findMany.mockResolvedValueOnce([
      { ...row({ productCode: '9734-1', optionCode: '1', yearMonth: '2026-06', orderQty: 10 }), barcode: 'NO-MATCH' },
    ]);
    // 판매·재고 엑셀 상품코드 = 9734-1 (product_code-option_code 결합).
    const inventoryRows = [inventoryRow(1, '9734-1', 42, null)];
    inventoryFindMany.mockResolvedValueOnce(inventoryRows);
    inventoryAvailability.mockResolvedValueOnce(collectedInventory(inventoryRows));

    const out = await service.getSummary(ORGANIZATION_ID);

    // 결합형 코드를 exact 상품코드로 매칭해 공통 현재고를 읽는다.
    expect(out.products[0].inventoryResolution).toMatchObject({
      status: 'matched',
      currentStock: 42,
    });
  });
});

function destinationRow(
  sellpiaInventorySkuId: string,
  variantId: string,
  masterProductId: string,
  abcGrade: 'A' | 'B' | 'C' | null,
) {
  return {
    sellpiaInventorySkuId,
    quantity: 1,
    channelListingOption: {
      id: variantId,
      externalOptionId: variantId,
      itemName: variantId,
      listing: {
        id: `listing-${variantId}`,
        externalId: variantId,
        masterProduct: {
          id: masterProductId,
          code: masterProductId,
          name: masterProductId,
          abcGrade,
          abcEvaluation: null,
        },
        channelAccount: { channel: 'coupang', isPrimary: true },
      },
    },
  };
}

function inventoryRow(
  index: number,
  code: string,
  currentStock: number,
  barcode: string | null,
) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    code,
    barcode,
    currentStock,
    isActive: true,
  };
}

function inventoryMasterProduct(
  id: string,
  abcGrade: 'A' | 'B' | 'C' | null,
) {
  return {
    id,
    code: id,
    name: id,
    abcGrade,
    createdAt: new Date('2026-01-01'),
    abcEvaluation: abcGrade ? storedEvaluation(abcGrade) : null,
  };
}

function collectedInventory(
  rows: Array<ReturnType<typeof inventoryRow>>,
) {
  return {
    snapshot: {
      collected: true as const,
      generation: '12',
      verifiedAt: '2026-07-16T01:00:00.000Z',
    },
    items: rows.map((row) => ({
      sellpiaInventorySkuId: row.id,
      currentStock: row.currentStock,
      availableStock: row.currentStock,
      isActive: row.isActive,
      generation: '12',
    })),
  };
}

function missingEvidence() {
  const source = { sourceImportRunId: null, publicationSequence: null, mappingGeneration: null, coverageStartDate: null, coverageEndDate: null, capturedAt: null };
  const status = { status: 'MISSING' as const, actualCutoff: null, latestAttemptState: null, errorCode: null };
  return { load: async () => ({
    targetCutoff: '2026-06-30', actualCutoff: null, mappingGeneration: null, contributionBasis: null,
    sources: { sellpia: status, advertising: status }, sourceVector: { sellpia: source, advertising: source }, products: [],
  }) };
}

function storedEvaluation(abcGrade: 'A' | 'B' | 'C') {
  const decimal = (value: number) => new Prisma.Decimal(value);
  return {
    abcGrade, weightedRevenue: decimal(100), weightedOrderTimeSupplyCost: decimal(10),
    weightedAdvertisingSpend: decimal(0), weightedOperatingProfit: decimal(90),
    operatingProfitVelocity30: decimal(90), operatingMargin: decimal(0.9), lossPersistence: decimal(0),
    profitScore: decimal(80), marginScore: decimal(100), consistencyScore: decimal(100), economicScore: decimal(90),
    validObservationDays: 30, formulaVersion: { formulaJson: PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD },
    formulaRevision: 1, publicationRevision: 1, gradeBasisCutoffDate: new Date('2026-06-30'),
    sellpiaSourceImportRunId: '11111111-1111-4111-8111-111111111112',
    advertisingSourceImportRunId: '11111111-1111-4111-8111-111111111113',
    sellpiaGeneration: 1n, advertisingGeneration: 1n, mappingGeneration: 1n, calculatedAt: new Date('2026-07-01'),
  };
}
