import { describe, expect, it } from 'vitest';
import {
  KEY_PRODUCT_LIMIT,
  findReorderSuggestions,
  findSalesDecline,
} from './dashboard-findings';
import type {
  SellpiaProductSalesRow,
  SellpiaProductSalesSummary,
} from '@kiditem/shared/dashboard';

const COMPLETE = ['2026-05', '2026-06', '2026-07', '2026-08'];
const MASTER_ID = '11111111-1111-4111-8111-111111111111';

type Matched = Extract<SellpiaProductSalesRow['inventoryResolution'], { status: 'matched' }>;

function matched(overrides: Partial<Matched> = {}): Matched {
  return {
    status: 'matched',
    masterProductId: MASTER_ID,
    currentStock: 40,
    salesRowCount: 1,
    inventoryProduct: null,
    destinations: [],
    ...overrides,
  };
}

function row(
  code: string,
  quantities: readonly number[],
  overrides: Partial<SellpiaProductSalesRow> = {},
): SellpiaProductSalesRow {
  return {
    productCode: code,
    optionCode: '',
    productName: `상품 ${code}`,
    optionName: null,
    providerName: null,
    barcode: null,
    monthly: [...COMPLETE, '2026-09'].map((yearMonth, index) => ({
      yearMonth,
      orderQty: quantities[index] ?? 0,
    })),
    qty1m: 0,
    qty2m: 0,
    avg2m: 0,
    totalQty: 0,
    trend: 'flat',
    deadStock: false,
    deadStockReason: null,
    seasonTag: null,
    inventoryResolution: { status: 'not_collected' },
    // 같은 SKU 로 해소된 판매행들이 나눠 갖는 SKU 비율. 따로 주지 않으면 그 행의
    // avg2m 과 같다고 본다.
    monthlyOutflow: overrides.avg2m ?? 0,
    outflowMonthCount: 2,
    monthsOfAvailableStockLeft: null,
    reorderPoint: null,
    needsReorder: false,
    ...overrides,
  };
}

function summary(
  products: SellpiaProductSalesRow[],
  overrides: Partial<SellpiaProductSalesSummary> = {},
): SellpiaProductSalesSummary {
  return {
    range: { from: '2026-05', to: '2026-09' },
    months: [...COMPLETE, '2026-09'],
    completeMonths: COMPLETE,
    products,
    productCount: products.length,
    totalQty: 0,
    lastCapturedAt: '2026-09-17T14:00:00.000Z',
    hasData: true,
    hasStock: true,
    stockCapturedAt: '2026-09-17T14:00:00.000Z',
    stockGeneration: '1',
    inventoryResolutionCounts: {
      matchedSalesRows: 0,
      mappingRequiredSalesRows: 0,
      matchedSkus: 0,
      unlinkedSkus: 0,
    },
    reorderCount: 0,
    deadStockCount: 0,
    abcCounts: { A: 0, B: 0, C: 0 },
    abcStatusCounts: {
      READY: 0,
      INSUFFICIENT_EVIDENCE: 0,
      SOURCE_UNMAPPED: 0,
      SELLPIA_SOURCE_STALE: 0,
      AD_SOURCE_STALE: 0,
    },
    abcContributionProfitByGrade: { A: 0, B: 0, C: 0 },
    classifiedProductCount: 0,
    unclassifiedProductCount: 0,
    leadTimeMonths: 1,
    ...overrides,
  };
}

describe('findSalesDecline', () => {
  it('counts key products whose depletion trend is down, largest loss first', () => {
    const result = findSalesDecline(summary([
      row('A', [100, 100, 100, 40], { trend: 'down' }),
      row('B', [300, 300, 300, 150], { trend: 'down' }),
      row('C', [200, 200, 200, 210], { trend: 'flat' }),
    ]));

    expect(result.month).toBe('2026-08');
    expect(result.count).toBe(2);
    expect(result.items.map((item) => item.productCode)).toEqual(['B', 'A']);
    expect(result.items[0]).toMatchObject({ recentQty: 150, baselineQty: 300, changePercent: -50 });
  });

  it('limits key products by prior complete monthly quantity', () => {
    const cheapBulk = Array.from({ length: KEY_PRODUCT_LIMIT }, (_, index) =>
      row(`big-${index}`, [1_000, 1_000, 1_000, 1_000], { trend: 'flat' }));
    // This large decline is outside the key-product population because its
    // baseline quantity is below each of the first thirty products.
    const tail = row('tail', [100, 100, 100, 0], { trend: 'down' });

    const result = findSalesDecline(summary([...cheapBulk, tail]));

    expect(result.count).toBe(0);
    expect(result.items).toEqual([]);
  });

  it('uses the latest complete month when the range also includes a partial month', () => {
    const result = findSalesDecline(summary([
      row('A', [100, 100, 100, 30], {
        trend: 'down',
        monthly: [
          { yearMonth: '2026-05', orderQty: 100 },
          { yearMonth: '2026-06', orderQty: 100 },
          { yearMonth: '2026-07', orderQty: 100 },
          { yearMonth: '2026-08', orderQty: 30 },
          { yearMonth: '2026-09', orderQty: 5_000 },
        ],
      }),
    ]));

    expect(result.items[0]).toMatchObject({ baselineQty: 100, recentQty: 30 });
  });

  it('is unknown, not zero, without two complete months or any collection', () => {
    expect(findSalesDecline(summary([], { completeMonths: ['2026-08'] })).count).toBeNull();
    expect(findSalesDecline(summary([], { hasData: false })).count).toBeNull();
    expect(findSalesDecline(summary([])).count).toBe(0);
  });
});

describe('findReorderSuggestions', () => {
  it('suggests reorder-needed SKUs that still have stock, this week before next', () => {
    const result = findReorderSuggestions(summary([
      row('slow-now', [], {
        needsReorder: true, avg2m: 10, monthsOfAvailableStockLeft: 0.1, reorderPoint: 15,
        inventoryResolution: matched({ masterProductId: 'a0000000-0000-4000-8000-000000000001', currentStock: 1 }),
      }),
      row('best-seller-now', [], {
        needsReorder: true, avg2m: 900, monthsOfAvailableStockLeft: 0.2, reorderPoint: 1_350,
        inventoryResolution: matched({
          masterProductId: 'a0000000-0000-4000-8000-000000000002',
          currentStock: 180,
        }),
      }),
      row('next-month', [], {
        needsReorder: true, avg2m: 5_000, monthsOfAvailableStockLeft: 1.2, reorderPoint: 7_500,
        inventoryResolution: matched({ masterProductId: 'a0000000-0000-4000-8000-000000000003', currentStock: 6_000 }),
      }),
    ]));

    expect(result?.map((item) => item.productCode)).toEqual(['best-seller-now', 'slow-now', 'next-month']);
    expect(result?.[0]).toMatchObject({
      daysLeft: 6,
      availableStock: 180,
      monthlyOutflow: 900,
      masterProductId: 'a0000000-0000-4000-8000-000000000002',
    });
  });

  it('leaves a SKU that already ran out to the 품절 count', () => {
    const result = findReorderSuggestions(summary([
      row('empty', [], {
        needsReorder: true, avg2m: 100, monthsOfAvailableStockLeft: 0,
        inventoryResolution: matched({ currentStock: 0 }),
      }),
    ]));

    expect(result).toEqual([]);
  });

  it('한 SKU 로 해소된 판매행들은 SKU 가 발표한 비율 하나로 센다', () => {
    // 행마다 반올림된 avg2m 을 더하면 Σ round(x/2) 가 되어, 같은 카드의 daysLeft 가 쓰는
    // round(Σx/2) 와 어긋난다. 그래서 소유자가 발표한 SKU 비율을 그대로 쓴다.
    const shared = matched({ masterProductId: 'b0000000-0000-4000-8000-000000000001', currentStock: 50, salesRowCount: 2 });
    const result = findReorderSuggestions(summary([
      row('X', [], { optionCode: '1', needsReorder: true, avg2m: 60, monthlyOutflow: 100, monthsOfAvailableStockLeft: 0.5, inventoryResolution: shared }),
      row('X', [], { optionCode: '2', needsReorder: true, avg2m: 40, monthlyOutflow: 100, monthsOfAvailableStockLeft: 0.5, inventoryResolution: shared }),
    ]));

    expect(result).toHaveLength(1);
    expect(result?.[0]).toMatchObject({ monthlyOutflow: 100, daysLeft: 15 });
  });

  it('행마다 반올림된 평균을 더하지 않는다 — 옆 칸 daysLeft 와 어긋난다', () => {
    // 2개월 수량이 각각 3인 판매행 둘. 행 평균은 round(1.5)=2 씩이라 더하면 4 가 되지만,
    // SKU 비율은 round(6/2)=3 이다.
    const shared = matched({ masterProductId: 'b0000000-0000-4000-8000-000000000002', currentStock: 9, salesRowCount: 2 });
    const result = findReorderSuggestions(summary([
      row('Y', [], { optionCode: '1', needsReorder: true, avg2m: 2, monthlyOutflow: 3, monthsOfAvailableStockLeft: 3, inventoryResolution: shared }),
      row('Y', [], { optionCode: '2', needsReorder: true, avg2m: 2, monthlyOutflow: 3, monthsOfAvailableStockLeft: 3, inventoryResolution: shared }),
    ]));

    expect(result?.[0]?.monthlyOutflow).toBe(3);
  });

  it('is unknown when stock was never collected', () => {
    expect(findReorderSuggestions(summary([], { hasStock: false }))).toBeNull();
    expect(findReorderSuggestions(summary([], { hasData: false }))).toBeNull();
  });
});
