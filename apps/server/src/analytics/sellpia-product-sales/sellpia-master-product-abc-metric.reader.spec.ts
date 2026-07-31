import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SellpiaMasterProductAbcMetricReader } from './sellpia-master-product-abc-metric.reader';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const CREATED_AT = new Date('2026-04-01T00:00:00.000Z');

function makeReader(input?: {
  masters?: unknown[];
  variants?: unknown[];
  skus?: unknown[];
  sales?: unknown[];
}) {
  const salesFindMany = vi.fn().mockResolvedValue(input?.sales ?? []);
  const skuFindMany = vi.fn().mockResolvedValue(input?.skus ?? []);
  const masterFindMany = vi.fn().mockResolvedValue((input?.masters ?? []).map((master) => ({
    createdAt: CREATED_AT,
    ...master as object,
  })));
  const variantFindMany = vi.fn().mockResolvedValue(input?.variants ?? []);
  const prisma = {
    sellpiaProductMonthlySales: { findMany: salesFindMany },
    sellpiaInventorySku: { findMany: skuFindMany },
    masterProduct: { findMany: masterFindMany },
    productVariant: { findMany: variantFindMany },
  };
  const Reader = SellpiaMasterProductAbcMetricReader as unknown as new (
    prisma: unknown,
  ) => SellpiaMasterProductAbcMetricReader;
  return { reader: new Reader(prisma), salesFindMany };
}

function sale(input: {
  productCode: string;
  optionCode?: string;
  yearMonth: string;
  orderQty: number;
  orderAmount?: number;
  inAmount?: number;
  costBasis?: string;
  vatIncluded?: boolean | null;
  barcode?: string | null;
  salePrice?: number;
  capturedAt?: string;
}) {
  return {
    productCode: input.productCode,
    optionCode: input.optionCode ?? '',
    yearMonth: input.yearMonth,
    orderQty: input.orderQty,
    orderAmount: input.orderAmount ?? input.orderQty * 100,
    inAmount: input.inAmount ?? input.orderQty * 40,
    costBasis: input.costBasis ?? 'ORDER_TIME_SUPPLY_COST',
    vatIncluded: input.vatIncluded ?? true,
    barcode: input.barcode ?? null,
    salePrice: input.salePrice ?? 1_000,
    capturedAt: new Date(input.capturedAt ?? '2026-07-01T00:00:00.000Z'),
  };
}

describe('SellpiaMasterProductAbcMetricReader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T03:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('keeps exact SKU resolution, zero-filled months, and only completed months', async () => {
    const { reader, salesFindMany } = makeReader({
      masters: [{ id: 'master-1', isActive: true }],
      variants: [{ id: 'variant-1', masterProductId: 'master-1', components: [{ sellpiaInventorySkuId: 'sku-1' }] }],
      skus: [{ id: 'sku-1', code: 'SELLPIA-1', barcode: '880-1', isActive: true }],
      sales: [
        sale({ productCode: 'SELLPIA-1', yearMonth: '2026-04', orderQty: 10, capturedAt: '2026-07-01T00:00:00Z' }),
        sale({ productCode: 'SELLPIA-1', yearMonth: '2026-05', orderQty: 20, capturedAt: '2026-07-02T00:00:00Z' }),
        sale({ productCode: 'SELLPIA-1', yearMonth: '2026-06', orderQty: 30, capturedAt: '2026-07-03T00:00:00Z' }),
        sale({ productCode: 'SELLPIA-1', yearMonth: '2026-07', orderQty: 999, capturedAt: '2026-07-24T00:00:00Z' }),
      ],
    });

    await expect(reader.readMetricSnapshot({
      organizationId: ORGANIZATION_ID, metric: 'SALES_QUANTITY', periodDays: 90,
    })).resolves.toMatchObject({
      sourceCapturedAt: new Date('2026-07-03T00:00:00.000Z'),
      evidence: [{
        masterProductId: 'master-1',
        periodMetricValue: 60,
        rankingValue: 60,
        grossRevenue: 6_000,
        grossCost: 2_400,
        grossProfit: 3_600,
        observedCompleteMonths: 3,
        observationStartMonth: '2026-04',
        eligibilityReason: 'ELIGIBLE',
        eligible: true,
      }],
    });
    expect(salesFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: ORGANIZATION_ID, yearMonth: { in: expect.arrayContaining(['2026-04', '2026-06']) } },
    }));
  });

  it('uses authoritative order-time supply cost for gross profit and rejects missing cost', async () => {
    const base = {
      masters: [{ id: 'master-1', isActive: true }],
      variants: [{ id: 'variant-1', masterProductId: 'master-1', components: [{ sellpiaInventorySkuId: 'sku-1' }] }],
      skus: [{ id: 'sku-1', code: 'SELLPIA-1', barcode: null, isActive: true }],
    };
    const valid = makeReader({ ...base, sales: [sale({ productCode: 'SELLPIA-1', yearMonth: '2026-06', orderQty: 10, orderAmount: 1_000, inAmount: 400 })] });
    await expect(valid.reader.readMetricSnapshot({
      organizationId: ORGANIZATION_ID, metric: 'GROSS_PROFIT', periodDays: 30,
    })).resolves.toMatchObject({ evidence: [{
      periodMetricValue: 600, grossRevenue: 1_000, grossCost: 400, grossProfit: 600,
      eligibilityReason: 'ELIGIBLE', eligible: true,
    }] });

    const invalid = makeReader({ ...base, sales: [sale({ productCode: 'SELLPIA-1', yearMonth: '2026-06', orderQty: 10, orderAmount: 1_000, inAmount: 0 })] });
    await expect(invalid.reader.readMetricSnapshot({
      organizationId: ORGANIZATION_ID, metric: 'GROSS_PROFIT', periodDays: 30,
    })).resolves.toMatchObject({ evidence: [{
      periodMetricValue: null, eligibilityReason: 'MISSING_COST', eligible: false,
    }] });
  });

  it('marks a gap after the observation start incomplete rather than treating it as a zero-filled month', async () => {
    const { reader } = makeReader({
      masters: [{ id: 'master-partial', isActive: true }],
      variants: [{ id: 'variant-partial', masterProductId: 'master-partial', components: [{ sellpiaInventorySkuId: 'sku-partial' }] }],
      skus: [{ id: 'sku-partial', code: 'PARTIAL', barcode: null, isActive: true }],
      sales: [
        sale({ productCode: 'PARTIAL', yearMonth: '2026-04', orderQty: 10 }),
        sale({ productCode: 'PARTIAL', yearMonth: '2026-06', orderQty: 30 }),
      ],
    });

    await expect(reader.readMetricSnapshot({
      organizationId: ORGANIZATION_ID, metric: 'SALES_QUANTITY', periodDays: 90,
    })).resolves.toMatchObject({ evidence: [{
      observedCompleteMonths: 2,
      observationStartMonth: '2026-04',
      periodMetricValue: null,
      eligibilityReason: 'INCOMPLETE_MONTHS',
      eligible: false,
    }] });
  });

  it('preserves product, recipe, shared-SKU, and inactive-SKU exclusion reasons', async () => {
    const { reader } = makeReader({
      masters: [
        { id: 'master-inactive', isActive: false },
        { id: 'master-empty', isActive: true },
        { id: 'master-shared-1', isActive: true },
        { id: 'master-shared-2', isActive: true },
        { id: 'master-inactive-sku', isActive: true },
      ],
      variants: [
        { id: 'inactive', masterProductId: 'master-inactive', components: [{ sellpiaInventorySkuId: 'inactive-master' }] },
        { id: 'empty', masterProductId: 'master-empty', components: [] },
        { id: 'shared-1', masterProductId: 'master-shared-1', components: [{ sellpiaInventorySkuId: 'shared' }] },
        { id: 'shared-2', masterProductId: 'master-shared-2', components: [{ sellpiaInventorySkuId: 'shared' }] },
        { id: 'inactive-sku', masterProductId: 'master-inactive-sku', components: [{ sellpiaInventorySkuId: 'inactive-sku' }] },
      ],
      skus: [
        { id: 'inactive-master', code: 'INACTIVE-MASTER', barcode: null, isActive: true },
        { id: 'shared', code: 'SHARED', barcode: null, isActive: true },
        { id: 'inactive-sku', code: 'INACTIVE-SKU', barcode: null, isActive: false },
      ],
      sales: [sale({ productCode: 'SHARED', yearMonth: '2026-06', orderQty: 1 })],
    });

    const snapshot = await reader.readMetricSnapshot({
      organizationId: ORGANIZATION_ID, metric: 'SALES_QUANTITY', periodDays: 30,
    });
    expect(snapshot.evidence.map((row) => [row.masterProductId, row.eligibilityReason])).toEqual([
      ['master-empty', 'MISSING_RECIPE'],
      ['master-inactive', 'INACTIVE_PRODUCT'],
      ['master-inactive-sku', 'INACTIVE_SKU'],
      ['master-shared-1', 'SHARED_SKU'],
      ['master-shared-2', 'SHARED_SKU'],
    ]);
  });
});
