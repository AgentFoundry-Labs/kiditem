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
      requestedThrough: '2026-08-31',
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
  it('pairs only generations ending on the same day inside the cutoff month', async () => {
    const sellpiaGeneration = (sourceImportRunId: string, publicationSequence: string, to: string) => ({
      sourceImportRunId,
      publicationSequence,
      mappingGeneration: '0',
      coverage: {
        from: '2026-01-01',
        to,
        coveredMonths: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'],
      },
      capturedAt: `${to}T03:00:00.000Z`,
      quality: {
        correctedCostEvidence: true,
        mappingGeneration: '0',
        provenance: { costBasis: 'ORDER_TIME_SUPPLY_COST', vatIncluded: true },
      },
    });
    const advertisingGeneration = (
      sourceImportRunId: string,
      publicationSequence: string,
      coveredThrough: string,
      requestedThrough = coveredThrough,
    ) => ({
      sourceImportRunId,
      publicationSequence,
      mappingGeneration: '0',
      coverageStartDate: '2026-01-01',
      coveredThrough,
      requestedThrough,
      capturedAt: `${coveredThrough}T03:00:00.000Z`,
      adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
      frozenRecipePolicy: {
        mappingGeneration: '0',
        adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
      },
    });
    const loadWith = async (
      sellpiaGenerations: readonly ReturnType<typeof sellpiaGeneration>[],
      advertisingGenerations: readonly ReturnType<typeof advertisingGeneration>[],
      targetCutoff = '2026-09-06',
      advertisingMode?: 'required' | 'excluded',
    ) => {
      const sellpiaByRun = new Map(sellpiaGenerations.map((generation) => [generation.sourceImportRunId, generation]));
      const advertisingByRun = new Map(advertisingGenerations.map((generation) => [generation.sourceImportRunId, generation]));
      const sellpia = {
        readGenerationCatalog: vi.fn().mockResolvedValue({
          latestAttempt: null,
          completeGenerations: sellpiaGenerations,
        }),
        readGenerationFacts: vi.fn(async ({ sourceImportRunId }: { sourceImportRunId: string }) => ({
          generation: sellpiaByRun.get(sourceImportRunId),
          facts: [],
        })),
      };
      const advertising = {
        readSourceSnapshot: vi.fn().mockResolvedValue({
          latestAttempt: null,
          latestComplete: advertisingGenerations[0] ?? null,
          completeGenerations: advertisingGenerations,
          ready: false,
        }),
        readGeneration: vi.fn(async ({ sourceImportRunId }: { sourceImportRunId: string }) => ({
          summary: advertisingByRun.get(sourceImportRunId),
          allocations: [],
        })),
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
      return new MasterProductProfitabilityReadService(
        sellpia as never,
        advertising as never,
        prisma as never,
      ).load({ organizationId: 'organization-1', targetCutoff, advertising: advertisingMode });
    };
    const sellpiaThrough5 = sellpiaGeneration('00000000-0000-4000-8000-000000000031', '11', '2026-09-05');
    const sellpiaThrough6 = sellpiaGeneration('00000000-0000-4000-8000-000000000033', '12', '2026-09-06');
    const advertisingThrough5 = advertisingGeneration('00000000-0000-4000-8000-000000000032', '21', '2026-09-05');
    const advertisingThrough6 = advertisingGeneration('00000000-0000-4000-8000-000000000034', '22', '2026-09-06');

    // Sellpia runs past the advertising end: the Sellpia generation ending on it pairs.
    // Readiness still judges each source by its newest generation, not the paired one.
    await expect(loadWith([sellpiaThrough6, sellpiaThrough5], [advertisingThrough5])).resolves.toMatchObject({
      actualCutoff: '2026-09-05',
      sourceVector: {
        sellpia: { sourceImportRunId: sellpiaThrough5.sourceImportRunId },
        advertising: { sourceImportRunId: advertisingThrough5.sourceImportRunId },
      },
      sources: {
        sellpia: { ready: true, actualCutoff: '2026-09-06' },
        advertising: { ready: false, requiredCutoff: '2026-09-06', actualCutoff: '2026-09-05' },
      },
    });
    // An advertising generation that requested 2026-09-06 and held it as unreported is due only through 2026-09-05.
    const advertisingHeldThrough5 = advertisingGeneration(
      '00000000-0000-4000-8000-000000000037',
      '24',
      '2026-09-05',
      '2026-09-06',
    );
    await expect(loadWith([sellpiaThrough6, sellpiaThrough5], [advertisingHeldThrough5])).resolves.toMatchObject({
      actualCutoff: '2026-09-05',
      sourceVector: {
        sellpia: { sourceImportRunId: sellpiaThrough5.sourceImportRunId },
        advertising: { sourceImportRunId: advertisingHeldThrough5.sourceImportRunId },
      },
      sources: {
        sellpia: { ready: true, requiredCutoff: '2026-09-06', actualCutoff: '2026-09-06' },
        advertising: { ready: true, requiredCutoff: '2026-09-05', actualCutoff: '2026-09-05' },
      },
    });
    // Advertising runs past the Sellpia end: the advertising generation ending on it pairs.
    await expect(loadWith([sellpiaThrough5], [advertisingThrough6, advertisingThrough5])).resolves.toMatchObject({
      actualCutoff: '2026-09-05',
      sourceVector: {
        sellpia: { sourceImportRunId: sellpiaThrough5.sourceImportRunId },
        advertising: { sourceImportRunId: advertisingThrough5.sourceImportRunId },
      },
      sources: {
        sellpia: { ready: false, actualCutoff: '2026-09-05' },
        advertising: { ready: true, actualCutoff: '2026-09-06' },
      },
    });
    // With no generation ending on the other's end there is no pair; the earlier source is not ready.
    await expect(loadWith([sellpiaThrough6], [advertisingThrough5])).resolves.toMatchObject({
      actualCutoff: null,
      sources: { sellpia: { ready: true }, advertising: { ready: false } },
    });
    await expect(loadWith([sellpiaThrough5], [advertisingThrough6])).resolves.toMatchObject({
      actualCutoff: null,
      sources: { sellpia: { ready: false }, advertising: { ready: true } },
    });
    // Ends on either side of a month boundary still pair at the month end.
    await expect(loadWith(
      [sellpiaGeneration('00000000-0000-4000-8000-000000000035', '13', '2026-09-02')],
      [advertisingGeneration('00000000-0000-4000-8000-000000000036', '23', '2026-08-31')],
      '2026-09-02',
    )).resolves.toMatchObject({ actualCutoff: '2026-08-31' });

    // A formula that excludes advertising pairs Sellpia alone — no advertising
    // generation has to exist — while readiness still reports advertising as it is.
    await expect(loadWith([sellpiaThrough6, sellpiaThrough5], [], '2026-09-06', 'excluded')).resolves.toMatchObject({
      actualCutoff: '2026-09-06',
      sourceVector: {
        sellpia: { sourceImportRunId: sellpiaThrough6.sourceImportRunId },
        advertising: { sourceImportRunId: null },
      },
      sources: { sellpia: { ready: true }, advertising: { ready: false } },
    });
    // The same sources under a formula that counts advertising have no pair.
    await expect(loadWith([sellpiaThrough6, sellpiaThrough5], [], '2026-09-06')).resolves.toMatchObject({
      actualCutoff: null,
    });
  });
});
