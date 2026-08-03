import { describe, expect, it, vi } from 'vitest';
import { SellpiaMasterProductProfitFactReader } from './sellpia-master-product-profit-fact.reader';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const RANGE = { from: new Date('2026-05-16T00:00:00.000Z'), to: new Date('2026-07-15T00:00:00.000Z') };

function makeReader(input: {
  components?: unknown[];
  skus?: unknown[];
  sales?: unknown[];
} = {}) {
  const prisma = {
    channelListingOptionInventoryComponent: {
      findMany: vi.fn().mockResolvedValue(input.components ?? []),
    },
    sellpiaInventorySku: { findMany: vi.fn().mockResolvedValue(input.skus ?? []) },
    sellpiaProductMonthlySales: { findMany: vi.fn().mockResolvedValue(input.sales ?? []) },
  };
  const Reader = SellpiaMasterProductProfitFactReader as unknown as new (prisma: unknown) =>
    SellpiaMasterProductProfitFactReader;
  return { reader: new Reader(prisma), prisma };
}

function sourceFact(overrides: Partial<{
  productCode: string; optionCode: string; barcode: string | null; yearMonth: string;
  orderAmount: number; inAmount: number; coverageStartDate: Date | null; coverageEndDate: Date | null;
  capturedAt: Date;
}> = {}) {
  return {
    productCode: 'SELLPIA-1', optionCode: '', barcode: null, yearMonth: '2026-05',
    orderAmount: 1_000, inAmount: 400,
    coverageStartDate: new Date('2026-05-16T00:00:00.000Z'),
    coverageEndDate: new Date('2026-05-31T00:00:00.000Z'),
    capturedAt: new Date('2026-07-16T00:00:00.000Z'),
    ...overrides,
  };
}

describe('SellpiaMasterProductProfitFactReader', () => {
  it('aggregates exactly covered, resolved source rows once per master product and month', async () => {
    const { reader, prisma } = makeReader({
      components: [{
        sellpiaInventorySkuId: 'sku-1',
        channelListingOption: { listing: { masterProductId: 'master-1' } },
      }],
      skus: [{ id: 'sku-1', code: 'SELLPIA-1', barcode: null, isActive: true }],
      sales: [sourceFact(), sourceFact({ optionCode: 'ALT-OPTION', orderAmount: 250, inAmount: 100 })],
    });

    await expect(reader.readProfitFacts({
      organizationId: ORGANIZATION_ID, masterProductIds: ['master-1', 'master-unmapped'], range: RANGE,
    })).resolves.toMatchObject({
      evidence: [
        {
          masterProductId: 'master-1', mappingStatus: 'MAPPED',
          monthlyFacts: [{
            masterProductId: 'master-1', yearMonth: '2026-05',
            coverageStartDate: new Date('2026-05-16T00:00:00.000Z'),
            coverageEndDate: new Date('2026-05-31T00:00:00.000Z'),
            coveredDays: 16, revenue: 1_250, sellpiaInAmount: 500,
            sourceProductCodes: ['SELLPIA-1'], sourceOptionCodes: ['', 'ALT-OPTION'],
            capturedAt: new Date('2026-07-16T00:00:00.000Z'),
          }],
        },
        { masterProductId: 'master-unmapped', mappingStatus: 'UNMAPPED', monthlyFacts: [] },
      ],
      orphanFacts: [],
    });
    expect(prisma.sellpiaProductMonthlySales.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: ORGANIZATION_ID, yearMonth: { in: ['2026-05', '2026-06', '2026-07'] } },
    }));
  });

  it('keeps unmapped, ambiguous, and legacy rows in the audit collection rather than creating numeric facts', async () => {
    const { reader } = makeReader({
      components: [
        { sellpiaInventorySkuId: 'shared-sku', channelListingOption: { listing: { masterProductId: 'master-a' } } },
        { sellpiaInventorySkuId: 'shared-sku', channelListingOption: { listing: { masterProductId: 'master-b' } } },
        { sellpiaInventorySkuId: 'legacy-sku', channelListingOption: { listing: { masterProductId: 'master-c' } } },
      ],
      skus: [
        { id: 'shared-sku', code: 'SHARED', barcode: null, isActive: true },
        { id: 'legacy-sku', code: 'LEGACY', barcode: null, isActive: true },
      ],
      sales: [
        sourceFact({ productCode: 'SHARED' }),
        sourceFact({ productCode: 'LEGACY', coverageStartDate: null, coverageEndDate: null }),
        sourceFact({ productCode: 'NO-MATCH' }),
      ],
    });

    const result = await reader.readProfitFacts({
      organizationId: ORGANIZATION_ID,
      masterProductIds: ['master-a', 'master-b', 'master-c'],
      range: RANGE,
    });

    expect(result.evidence).toMatchObject([
      { masterProductId: 'master-a', mappingStatus: 'UNMAPPED', monthlyFacts: [] },
      { masterProductId: 'master-b', mappingStatus: 'UNMAPPED', monthlyFacts: [] },
      { masterProductId: 'master-c', mappingStatus: 'MAPPED', monthlyFacts: [] },
    ]);
    expect(result.orphanFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ productCode: 'SHARED', reason: 'AMBIGUOUS_MASTER_PRODUCT' }),
      expect.objectContaining({ productCode: 'LEGACY', reason: 'LEGACY_COVERAGE_MISSING' }),
      expect.objectContaining({ productCode: 'NO-MATCH', reason: 'SOURCE_UNMAPPED' }),
    ]));
  });

  it('rejects a mixed coverage aggregate instead of publishing an invented full-month fact', async () => {
    const { reader } = makeReader({
      components: [{
        sellpiaInventorySkuId: 'sku-1',
        channelListingOption: { listing: { masterProductId: 'master-1' } },
      }],
      skus: [{ id: 'sku-1', code: 'SELLPIA-1', barcode: null, isActive: true }],
      sales: [
        sourceFact(),
        sourceFact({ optionCode: 'ALT', coverageStartDate: new Date('2026-05-01T00:00:00.000Z') }),
      ],
    });

    const result = await reader.readProfitFacts({
      organizationId: ORGANIZATION_ID, masterProductIds: ['master-1'], range: RANGE,
    });
    expect(result.evidence[0]).toMatchObject({
      masterProductId: 'master-1', mappingStatus: 'MAPPED', monthlyFacts: [],
    });
    expect(result.orphanFacts).toHaveLength(2);
    expect(result.orphanFacts.every((fact) => fact.reason === 'COVERAGE_MISMATCH')).toBe(true);
  });
});
