import { describe, expect, it, vi } from 'vitest';
import { SellpiaMasterProductProfitFactReader } from './sellpia-master-product-profit-fact.reader';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const RANGE = {
  from: new Date('2026-05-16T00:00:00.000Z'),
  to: new Date('2026-07-15T00:00:00.000Z'),
};

function makeReader(sales: unknown[], generation: unknown = {
  id: '00000000-0000-4000-8000-000000000010',
  mappingGeneration: 3n,
  importedAt: new Date('2026-07-16T00:00:00.000Z'),
}) {
  const prisma = {
    sourceImportRun: { findFirst: vi.fn().mockResolvedValue(generation) },
    sellpiaProductMonthlySales: { findMany: vi.fn().mockResolvedValue(sales) },
  };
  return {
    reader: new SellpiaMasterProductProfitFactReader(prisma as never),
    prisma,
  };
}

function sourceFact(overrides: Partial<{
  masterProductId: string | null;
  productCode: string;
  optionCode: string;
  barcode: string | null;
  yearMonth: string;
  orderAmount: number;
  inAmount: number;
  coverageStartDate: Date | null;
  coverageEndDate: Date | null;
  capturedAt: Date;
}> = {}) {
  return {
    masterProductId: 'master-1',
    productCode: 'SELLPIA-1',
    optionCode: '',
    barcode: null,
    yearMonth: '2026-05',
    orderAmount: 1_000,
    inAmount: 400,
    coverageStartDate: new Date('2026-05-16T00:00:00.000Z'),
    coverageEndDate: new Date('2026-05-31T00:00:00.000Z'),
    capturedAt: new Date('2026-07-16T00:00:00.000Z'),
    ...overrides,
  };
}

describe('SellpiaMasterProductProfitFactReader', () => {
  it('reads only the exact newest COMPLETE generation and its frozen mapping', async () => {
    const { reader, prisma } = makeReader([
      sourceFact(),
      sourceFact({ optionCode: 'ALT', orderAmount: 250, inAmount: 100 }),
    ]);

    await expect(reader.readProfitFacts({
      organizationId: ORGANIZATION_ID,
      masterProductIds: ['master-1', 'master-unmapped'],
      range: RANGE,
    })).resolves.toMatchObject({
      evidence: [
        {
          masterProductId: 'master-1',
          mappingStatus: 'MAPPED',
          mappingInventoryGeneration: '3',
          monthlyFacts: [{
            revenue: 1_250,
            sellpiaInAmount: 500,
            coveredDays: 16,
          }],
        },
        {
          masterProductId: 'master-unmapped',
          mappingStatus: 'UNMAPPED',
          monthlyFacts: [],
        },
      ],
      orphanFacts: [],
    });
    expect(prisma.sellpiaProductMonthlySales.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORGANIZATION_ID,
          sourceImportRunId: '00000000-0000-4000-8000-000000000010',
          yearMonth: { in: ['2026-05', '2026-06', '2026-07'] },
        },
      }),
    );
    expect(prisma).not.toHaveProperty('sellpiaInventorySku');
  });

  it('does not read staged facts when no COMPLETE generation exists', async () => {
    const { reader, prisma } = makeReader([sourceFact()], null);
    await expect(reader.readProfitFacts({
      organizationId: ORGANIZATION_ID,
      masterProductIds: ['master-1'],
      range: RANGE,
    })).resolves.toMatchObject({
      evidence: [{ masterProductId: 'master-1', mappingStatus: 'UNMAPPED', monthlyFacts: [] }],
      orphanFacts: [],
    });
    expect(prisma.sellpiaProductMonthlySales.findMany).not.toHaveBeenCalled();
  });

  it('keeps unmapped rows and mixed coverage out of published product aggregates', async () => {
    const { reader } = makeReader([
      sourceFact({ masterProductId: null, productCode: 'NO-MATCH' }),
      sourceFact(),
      sourceFact({
        optionCode: 'ALT',
        coverageStartDate: new Date('2026-05-01T00:00:00.000Z'),
      }),
    ]);
    const result = await reader.readProfitFacts({
      organizationId: ORGANIZATION_ID,
      masterProductIds: ['master-1'],
      range: RANGE,
    });

    expect(result.evidence[0]).toMatchObject({
      masterProductId: 'master-1',
      mappingStatus: 'MAPPED',
      monthlyFacts: [],
    });
    expect(result.orphanFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ productCode: 'NO-MATCH', reason: 'SOURCE_UNMAPPED' }),
      expect.objectContaining({ productCode: 'SELLPIA-1', reason: 'COVERAGE_MISMATCH' }),
    ]));
  });
});
