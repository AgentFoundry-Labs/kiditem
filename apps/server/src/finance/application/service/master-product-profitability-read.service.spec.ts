import { describe, expect, it, vi } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH } from '@kiditem/shared/product-abc';
import { MasterProductProfitabilityReadService } from './master-product-profitability-read.service';

describe('MasterProductProfitabilityReadService', () => {
  it('exposes one side-effect-free load seam for a missing source pair', async () => {
    const sellpia = {
      readGenerationCatalog: vi.fn().mockResolvedValue({
        latestAttempt: null,
        completeGenerations: [],
      }),
      readGenerationFacts: vi.fn(),
    };
    const advertising = {
      readSourceSnapshot: vi.fn().mockResolvedValue({
        latestAttempt: null,
        latestComplete: null,
        completeGenerations: [],
        ready: false,
      }),
      readGeneration: vi.fn(),
    };
    const transaction = vi.fn();
    const prisma = {
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'product-1',
          isActive: true,
          _count: { inventorySkus: 0 },
        }]),
      },
      channelListing: { findMany: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn().mockResolvedValue([]),
      masterProductAbcFormulaState: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: transaction,
    };
    transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));
    const service = new MasterProductProfitabilityReadService(
      sellpia as never,
      advertising as never,
      prisma as never,
    );

    await expect(service.load({
      organizationId: 'organization-1',
      targetCutoff: '2026-08-31',
    })).resolves.toMatchObject({
      targetCutoff: '2026-08-31',
      actualCutoff: null,
      sources: {
        sellpia: { ready: false, requiredCutoff: '2026-08-31', actualCutoff: null },
        advertising: { ready: false, requiredCutoff: '2026-08-31', actualCutoff: null },
      },
      products: [{
        masterProductId: 'product-1',
        selling: true,
        mappingValid: false,
        validObservationDays: 0,
        formulaReadyFacts: null,
      }],
    });
    expect(sellpia.readGenerationFacts).not.toHaveBeenCalled();
    expect(advertising.readGeneration).not.toHaveBeenCalled();
  });

  it('keeps a valid completed generation ready while a newer attempt has failed', async () => {
    const sellpiaGeneration = {
      sourceImportRunId: '00000000-0000-4000-8000-000000000031',
      publicationSequence: '12',
      mappingGeneration: '0',
      coverage: {
        from: '2026-08-01',
        to: '2026-08-31',
        coveredMonths: ['2026-08'],
      },
      capturedAt: '2026-09-01T00:00:00.000Z',
      quality: {
        correctedCostEvidence: true,
        mappingGeneration: '0',
        provenance: { costBasis: 'ORDER_TIME_SUPPLY_COST', vatIncluded: true },
      },
    };
    const advertisingGeneration = {
      sourceImportRunId: '00000000-0000-4000-8000-000000000032',
      publicationSequence: '13',
      mappingGeneration: '0',
      coverageStartDate: '2026-08-01',
      coveredThrough: '2026-08-31',
      capturedAt: '2026-09-01T00:00:00.000Z',
      adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
      frozenRecipePolicy: {
        mappingGeneration: '0',
        adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
      },
    };
    const sellpia = {
      readGenerationCatalog: vi.fn().mockResolvedValue({
        latestAttempt: {
          attemptId: '00000000-0000-4000-8000-000000000041',
          state: 'FAILED',
          errorCode: 'COLLECTION_FAILED',
        },
        completeGenerations: [sellpiaGeneration],
      }),
      readGenerationFacts: vi.fn().mockResolvedValue({
        generation: sellpiaGeneration,
        facts: [],
      }),
    };
    const advertising = {
      readSourceSnapshot: vi.fn().mockResolvedValue({
        latestAttempt: {
          attemptId: '00000000-0000-4000-8000-000000000042',
          sourceImportRunId: '00000000-0000-4000-8000-000000000042',
          state: 'FAILED',
          errorCode: 'COLLECTION_FAILED',
        },
        latestComplete: advertisingGeneration,
        completeGenerations: [advertisingGeneration],
        ready: false,
      }),
      readGeneration: vi.fn().mockResolvedValue({
        summary: advertisingGeneration,
        facts: [],
        allocations: [],
      }),
    };
    const prisma = {
      masterProduct: { findMany: vi.fn().mockResolvedValue([]) },
      channelListing: { findMany: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn().mockResolvedValue([]),
      masterProductAbcFormulaState: {
        findUnique: vi.fn().mockResolvedValue({ mappingGeneration: 0n }),
      },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));
    const service = new MasterProductProfitabilityReadService(
      sellpia as never,
      advertising as never,
      prisma as never,
    );

    const result = await service.load({
      organizationId: 'organization-1',
      targetCutoff: '2026-08-31',
    });

    expect(result.sources.sellpia).toMatchObject({
      ready: true,
      requiredCutoff: '2026-08-31',
      actualCutoff: '2026-08-31',
      latestAttempt: { state: 'FAILED', errorCode: 'COLLECTION_FAILED' },
      latestComplete: { actualCutoff: '2026-08-31' },
    });
    expect(result.sources.advertising).toMatchObject({
      ready: true,
      latestAttempt: { state: 'FAILED' },
      latestComplete: { actualCutoff: '2026-08-31' },
    });
  });

  it('does not overlap reads on the interactive snapshot transaction client', async () => {
    let releaseState!: (value: { mappingGeneration: bigint }) => void;
    const stateReady = new Promise<{ mappingGeneration: bigint }>((resolve) => {
      releaseState = resolve;
    });
    const order: string[] = [];
    const transaction = vi.fn();
    const prisma = {
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([{ id: 'product-1', isActive: true }]),
      },
      channelListing: {
        findMany: vi.fn(async () => {
          order.push('sale-age:listings');
          return [];
        }),
      },
      $queryRaw: vi.fn(async () => {
        order.push('sale-age:raw');
        return [];
      }),
      masterProductAbcFormulaState: {
        findUnique: vi.fn(async () => {
          order.push('state:start');
          const value = await stateReady;
          order.push('state:end');
          return value;
        }),
      },
      $transaction: transaction,
    };
    transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));
    const sellpia = {
      readGenerationCatalog: vi.fn().mockResolvedValue({ latestAttempt: null, completeGenerations: [] }),
      readGenerationFacts: vi.fn(),
    };
    const advertising = {
      readSourceSnapshot: vi.fn().mockResolvedValue({
        latestAttempt: null,
        latestComplete: null,
        completeGenerations: [],
        ready: false,
      }),
      readGeneration: vi.fn(),
    };
    const service = new MasterProductProfitabilityReadService(
      sellpia as never,
      advertising as never,
      prisma as never,
    );

    const load = service.load({
      organizationId: 'organization-1',
      targetCutoff: '2026-08-31',
    });
    await Promise.resolve();
    expect(order).toEqual(['state:start']);

    releaseState({ mappingGeneration: 0n });
    await expect(load).resolves.toMatchObject({ actualCutoff: null });
    expect(order).toEqual([
      'state:start',
      'state:end',
      'sale-age:listings',
    ]);
  });
});
