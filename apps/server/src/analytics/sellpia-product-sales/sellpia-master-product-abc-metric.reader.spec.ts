import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SellpiaMasterProductAbcMetricReader } from './sellpia-master-product-abc-metric.reader';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

function makeReader(input?: {
  masters?: unknown[];
  variants?: unknown[];
  skus?: unknown[];
  sales?: unknown[];
}) {
  const salesFindMany = vi.fn().mockResolvedValue(input?.sales ?? []);
  const skuFindMany = vi.fn().mockResolvedValue(input?.skus ?? []);
  const masterFindMany = vi.fn().mockResolvedValue(input?.masters ?? []);
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
  return {
    reader: new Reader(prisma),
    salesFindMany,
    skuFindMany,
    masterFindMany,
    variantFindMany,
  };
}

function sale(input: {
  productCode: string;
  optionCode?: string;
  yearMonth: string;
  orderQty: number;
  orderAmount?: number;
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

  it('sums completed-month quantity once per distinct SKU and excludes the current month', async () => {
    const { reader, salesFindMany } = makeReader({
      masters: [
        { id: 'master-1', isActive: true },
        { id: 'master-inactive', isActive: false },
      ],
      variants: [
        { id: 'variant-1', masterProductId: 'master-1', components: [{ sellpiaInventorySkuId: 'sku-1' }] },
        { id: 'variant-2', masterProductId: 'master-1', components: [{ sellpiaInventorySkuId: 'sku-1' }] },
        { id: 'variant-inactive-master', masterProductId: 'master-inactive', components: [{ sellpiaInventorySkuId: 'sku-2' }] },
      ],
      skus: [
        { id: 'sku-1', code: 'SELLPIA-1', barcode: '880-1', isActive: true },
        { id: 'sku-2', code: 'SELLPIA-2', barcode: '880-2', isActive: true },
      ],
      sales: [
        sale({ productCode: 'SELLPIA-1', yearMonth: '2026-04', orderQty: 10, capturedAt: '2026-07-01T00:00:00Z' }),
        sale({ productCode: 'SELLPIA-1', yearMonth: '2026-05', orderQty: 20, capturedAt: '2026-07-02T00:00:00Z' }),
        sale({ productCode: 'SELLPIA-1', yearMonth: '2026-06', orderQty: 30, capturedAt: '2026-07-03T00:00:00Z' }),
        sale({ productCode: 'SELLPIA-1', yearMonth: '2026-07', orderQty: 999, capturedAt: '2026-07-24T00:00:00Z' }),
      ],
    });

    await expect(reader.readMetricSnapshot({
      organizationId: ORGANIZATION_ID,
      metric: 'SALES_QUANTITY',
      periodDays: 90,
    })).resolves.toEqual({
      sourceCapturedAt: new Date('2026-07-03T00:00:00.000Z'),
      evidence: [
        { masterProductId: 'master-1', metricValue: 60, eligible: true },
        { masterProductId: 'master-inactive', metricValue: null, eligible: false },
      ],
    });
    expect(salesFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: ORGANIZATION_ID,
        yearMonth: { in: ['2026-04', '2026-05', '2026-06'] },
      },
    }));
  });

  it('uses order amount and removes months flagged by the existing anomaly policy', async () => {
    const { reader } = makeReader({
      masters: [{ id: 'master-1', isActive: true }],
      variants: [{
        id: 'variant-1',
        masterProductId: 'master-1',
        components: [{ sellpiaInventorySkuId: 'sku-1' }],
      }],
      skus: [{ id: 'sku-1', code: 'SELLPIA-1', barcode: null, isActive: true }],
      sales: [sale({
        productCode: 'SELLPIA-1',
        yearMonth: '2026-06',
        orderQty: 20_000,
        orderAmount: 5_000_000,
      })],
    });

    await expect(reader.readMetricSnapshot({
      organizationId: ORGANIZATION_ID,
      metric: 'SALES_AMOUNT',
      periodDays: 30,
    })).resolves.toMatchObject({
      evidence: [{ masterProductId: 'master-1', metricValue: 0, eligible: true }],
    });
  });

  it('does not classify partial evidence for a multi-month policy window', async () => {
    const { reader } = makeReader({
      masters: [{ id: 'master-partial', isActive: true }],
      variants: [{
        id: 'variant-partial',
        masterProductId: 'master-partial',
        components: [{ sellpiaInventorySkuId: 'sku-partial' }],
      }],
      skus: [{ id: 'sku-partial', code: 'PARTIAL', barcode: null, isActive: true }],
      sales: [
        sale({ productCode: 'PARTIAL', yearMonth: '2026-04', orderQty: 10 }),
        sale({ productCode: 'PARTIAL', yearMonth: '2026-06', orderQty: 30 }),
      ],
    });

    await expect(reader.readMetricSnapshot({
      organizationId: ORGANIZATION_ID,
      metric: 'SALES_QUANTITY',
      periodDays: 90,
    })).resolves.toMatchObject({
      evidence: [{
        masterProductId: 'master-partial',
        metricValue: null,
        eligible: false,
      }],
    });
  });

  it('marks shared, incomplete, inactive-SKU, and missing sales evidence ineligible', async () => {
    const { reader } = makeReader({
      masters: [
        { id: 'master-good', isActive: true },
        { id: 'master-shared-1', isActive: true },
        { id: 'master-shared-2', isActive: true },
        { id: 'master-empty-recipe', isActive: true },
        { id: 'master-missing-sales', isActive: true },
        { id: 'master-inactive-sku', isActive: true },
      ],
      variants: [
        { id: 'variant-good', masterProductId: 'master-good', components: [{ sellpiaInventorySkuId: 'sku-good' }] },
        { id: 'variant-shared-1', masterProductId: 'master-shared-1', components: [{ sellpiaInventorySkuId: 'sku-shared' }] },
        { id: 'variant-shared-2', masterProductId: 'master-shared-2', components: [{ sellpiaInventorySkuId: 'sku-shared' }] },
        { id: 'variant-empty', masterProductId: 'master-empty-recipe', components: [] },
        { id: 'variant-missing', masterProductId: 'master-missing-sales', components: [{ sellpiaInventorySkuId: 'sku-missing' }] },
        { id: 'variant-inactive-sku', masterProductId: 'master-inactive-sku', components: [{ sellpiaInventorySkuId: 'sku-inactive' }] },
      ],
      skus: [
        { id: 'sku-good', code: 'GOOD', barcode: null, isActive: true },
        { id: 'sku-shared', code: 'SHARED', barcode: null, isActive: true },
        { id: 'sku-missing', code: 'MISSING', barcode: null, isActive: true },
        { id: 'sku-inactive', code: 'INACTIVE', barcode: null, isActive: false },
      ],
      sales: [
        sale({ productCode: 'GOOD', yearMonth: '2026-06', orderQty: 7 }),
        sale({ productCode: 'SHARED', yearMonth: '2026-06', orderQty: 9 }),
        sale({ productCode: 'INACTIVE', yearMonth: '2026-06', orderQty: 11 }),
        sale({ productCode: 'UNKNOWN', yearMonth: '2026-06', orderQty: 100 }),
      ],
    });

    const snapshot = await reader.readMetricSnapshot({
      organizationId: ORGANIZATION_ID,
      metric: 'SALES_QUANTITY',
      periodDays: 30,
    });

    expect(snapshot.evidence).toEqual([
      { masterProductId: 'master-empty-recipe', metricValue: null, eligible: false },
      { masterProductId: 'master-good', metricValue: 7, eligible: true },
      { masterProductId: 'master-inactive-sku', metricValue: null, eligible: false },
      { masterProductId: 'master-missing-sales', metricValue: null, eligible: false },
      { masterProductId: 'master-shared-1', metricValue: null, eligible: false },
      { masterProductId: 'master-shared-2', metricValue: null, eligible: false },
    ]);
  });
});
