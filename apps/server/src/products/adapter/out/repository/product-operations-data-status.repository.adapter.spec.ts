import {
  PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
} from '@kiditem/shared/product-abc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductOperationsDataStatusRepositoryAdapter } from './product-operations-data-status.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000009';

describe('ProductOperationsDataStatusRepositoryAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T00:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('reads source metadata and reports the conservative live cutoff without loading facts', async () => {
    const prisma = makePrisma();
    const adapter = new ProductOperationsDataStatusRepositoryAdapter(prisma as never);

    await expect(adapter.read(ORGANIZATION_ID, 30)).resolves.toEqual({
      displayDataAsOf: '2026-08-31',
      traffic: {
        status: 'READY',
        actualCutoff: '2026-09-03',
        capturedAt: '2026-09-04T00:00:00.000Z',
        latestAttemptState: null,
        errorCode: null,
      },
      actualCutoff: '2026-08-31',
      sellpia: {
        status: 'READY',
        actualCutoff: '2026-08-31',
        capturedAt: '2026-09-01T00:00:00.000Z',
        latestAttemptState: 'COMPLETE',
        errorCode: null,
      },
      advertising: {
        status: 'READY',
        actualCutoff: '2026-08-31',
        capturedAt: '2026-09-01T00:01:00.000Z',
        latestAttemptState: 'COMPLETE',
        errorCode: null,
      },
      sourceVector: {
        sellpia: {
          sourceImportRunId: '00000000-0000-4000-8000-000000000011',
          generation: '4',
          mappingGeneration: '8',
          coverageStartDate: '2026-01-01',
          coverageEndDate: '2026-08-31',
          coveredMonths: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'],
          capturedAt: '2026-09-01T00:00:00.000Z',
        },
        advertising: {
          sourceImportRunId: '00000000-0000-4000-8000-000000000012',
          generation: '5',
          mappingGeneration: '8',
          coverageStartDate: '2026-01-01',
          coverageEndDate: '2026-08-31',
          coveredMonths: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'],
          capturedAt: '2026-09-01T00:01:00.000Z',
        },
      },
      formulaState: {
        formulaRevision: 2,
        publicationRevision: 4,
        officialCutoff: '2026-07-31',
        publishedAt: '2026-08-01T01:00:00.000Z',
        mappingGeneration: '8',
      },
      products: [
        {
          masterProductId: '00000000-0000-4000-8000-000000000001',
          abcGrade: 'B',
          mappingValid: true,
        },
        {
          masterProductId: '00000000-0000-4000-8000-000000000002',
          abcGrade: null,
          mappingValid: true,
        },
      ],
    });
    expect(prisma.channelListingDailySnapshot.aggregate).toHaveBeenCalledTimes(1);
    expect(prisma.channelListing.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.masterProduct.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: ORGANIZATION_ID,
        id: { in: [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
        ] },
      },
    }));
    expect(prisma).not.toHaveProperty('sellpiaProductMonthlySales');
    expect(prisma).not.toHaveProperty('operationRun');
  });

  it('keeps a COMPLETE run from another mapping generation as a stale fallback', async () => {
    const prisma = makePrisma({ sourceMappingGeneration: 7n });
    const adapter = new ProductOperationsDataStatusRepositoryAdapter(prisma as never);

    await expect(adapter.read(ORGANIZATION_ID, 30)).resolves.toMatchObject({
      sellpia: { status: 'STALE', actualCutoff: '2026-08-31' },
      advertising: { status: 'STALE', actualCutoff: '2026-08-31' },
    });
  });

  it('does not call advertising READY when its immutable policy hash is wrong', async () => {
    const prisma = makePrisma({ adSourcePolicyHash: 'outdated-policy' });
    const adapter = new ProductOperationsDataStatusRepositoryAdapter(prisma as never);

    await expect(adapter.read(ORGANIZATION_ID, 30)).resolves.toMatchObject({
      advertising: { status: 'STALE', actualCutoff: '2026-08-31' },
    });
  });
});

function makePrisma(options: {
  sourceMappingGeneration?: bigint;
  adSourcePolicyHash?: string;
} = {}) {
  const sourceMappingGeneration = options.sourceMappingGeneration ?? 8n;
  return {
    channelListing: {
      findMany: vi.fn().mockResolvedValue([
        sellingListing('00000000-0000-4000-8000-000000000001'),
        sellingListing('00000000-0000-4000-8000-000000000002'),
      ]),
    },
    channelListingDailySnapshot: {
      aggregate: vi.fn().mockResolvedValue({
        _max: {
          businessDate: new Date('2026-09-03T00:00:00.000Z'),
          trafficObservedAt: new Date('2026-09-04T00:00:00.000Z'),
          lastObservedAt: new Date('2026-09-04T00:00:00.000Z'),
        },
      }),
    },
    masterProductAbcFormulaState: {
      findUnique: vi.fn().mockResolvedValue({
        formulaRevision: 2,
        publicationRevision: 4,
        officialCutoffDate: new Date('2026-07-31T00:00:00.000Z'),
        publishedAt: new Date('2026-08-01T01:00:00.000Z'),
        mappingGeneration: 8n,
      }),
    },
    sourceImportRun: {
      findFirst: vi.fn().mockImplementation(({ where }) => {
        const advertising = where.sourceType === 'coupang_ad_profitability';
        return Promise.resolve({
          id: advertising
            ? '00000000-0000-4000-8000-000000000012'
            : '00000000-0000-4000-8000-000000000011',
          status: 'completed',
          publicationSequence: advertising ? 5n : 4n,
          coverageStartDate: new Date('2026-01-01T00:00:00.000Z'),
          coverageEndDate: new Date('2026-08-31T00:00:00.000Z'),
          coveredMonths: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'],
          importedAt: new Date(advertising
            ? '2026-09-01T00:01:00.000Z'
            : '2026-09-01T00:00:00.000Z'),
          updatedAt: new Date('2026-09-01T00:02:00.000Z'),
          expiresAt: null,
          errorCode: null,
          mappingGeneration: sourceMappingGeneration,
          adSourcePolicyHash: advertising
            ? options.adSourcePolicyHash ?? PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH
            : null,
        });
      }),
    },
    masterProduct: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: '00000000-0000-4000-8000-000000000001',
          abcGrade: 'B',
          _count: { inventorySkus: 1 },
        },
        {
          id: '00000000-0000-4000-8000-000000000002',
          abcGrade: null,
          _count: { inventorySkus: 1 },
        },
      ]),
    },
  };
}

function sellingListing(masterProductId: string) {
  return {
    isActive: true,
    status: 'active',
    rawJson: { saleStatus: 'selling' },
    channelListingDailySnapshots: [],
    options: [{
      status: 'active',
      inventoryComponents: [{
        sellpiaInventorySku: {
          isActive: true,
          currentStock: 1,
          masterProductId,
          masterProduct: { isActive: true },
        },
      }],
    }],
  };
}
