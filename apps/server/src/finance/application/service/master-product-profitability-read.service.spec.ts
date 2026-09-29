import { ProductTransactionalReadRepositoryAdapter } from '../../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { describe, expect, it, vi } from 'vitest';
import { MasterProductProfitabilityReadService } from './master-product-profitability-read.service';

describe('MasterProductProfitabilityReadService', () => {
  it('exposes one side-effect-free load seam for a missing Sellpia generation', async () => {
    const sellpia = {
      readGenerationCatalog: vi.fn().mockResolvedValue({
        latestAttempt: null,
        completeGenerations: [],
      }),
      readGenerationFacts: vi.fn(),
    };
    const transaction = vi.fn();
    const prisma = {
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'product-1',
          code: 'P-1',
          name: 'Product 1',
          optionName: null,
          barcode: null,
          purchasePrice: null,
          imageUrls: [],
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
      prisma as never,
     new ProductTransactionalReadRepositoryAdapter());

    await expect(service.load({
      organizationId: 'organization-1',
      targetCutoff: '2026-08-31',
    })).resolves.toMatchObject({
      targetCutoff: '2026-08-31',
      actualCutoff: null,
      sources: {
        sellpia: { ready: false, requiredCutoff: '2026-08-31', actualCutoff: null },
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
  });

  it('keeps a valid completed generation ready while a newer attempt has failed', async () => {
    const sellpiaGeneration = {
      operationId: '00000000-0000-4000-8000-000000000031',
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
    const prisma = {
      masterProduct: { findMany: vi.fn().mockResolvedValue([{
        id: 'product-1',
        code: 'P-1',
        name: 'Product 1',
        optionName: null,
        barcode: null,
        purchasePrice: null,
        imageUrls: [],
      }]) },
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
      prisma as never,
     new ProductTransactionalReadRepositoryAdapter());

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
    // ABC grades on Sellpia alone (KID-373): the evidence names no advertising source.
    expect(Object.keys(result.sources)).toEqual(['sellpia']);
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
        findMany: vi.fn().mockResolvedValue([{
          id: 'product-1',
          code: 'P-1',
          name: 'Product 1',
          optionName: null,
          barcode: null,
          purchasePrice: null,
          imageUrls: [],
        }]),
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
    const service = new MasterProductProfitabilityReadService(
      sellpia as never,
      prisma as never,
     new ProductTransactionalReadRepositoryAdapter());

    const load = service.load({
      organizationId: 'organization-1',
      targetCutoff: '2026-08-31',
    });
    await vi.waitFor(() => expect(order).toContain('state:start'));

    releaseState({ mappingGeneration: 0n });
    await expect(load).resolves.toMatchObject({ actualCutoff: null });
    expect(order).toEqual([
      'state:start',
      'state:end',
      'sale-age:listings',
    ]);
  });
  it('selects the newest Sellpia generation that ends on the cutoff or closes its month', async () => {
    const sellpiaGeneration = (operationId: string, publicationSequence: string, to: string) => ({
      operationId,
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
    const loadWith = async (
      sellpiaGenerations: readonly ReturnType<typeof sellpiaGeneration>[],
      targetCutoff: string,
    ) => {
      const sellpiaByRun = new Map(sellpiaGenerations.map((generation) => [generation.operationId, generation]));
      const sellpia = {
        readGenerationCatalog: vi.fn().mockResolvedValue({
          latestAttempt: null,
          completeGenerations: sellpiaGenerations,
        }),
        readGenerationFacts: vi.fn(async ({ operationId }: { operationId: string }) => ({
          generation: sellpiaByRun.get(operationId),
          facts: [],
        })),
      };
      const prisma = {
        masterProduct: { findMany: vi.fn().mockResolvedValue([{
          id: 'product-1',
          code: 'P-1',
          name: 'Product 1',
          optionName: null,
          barcode: null,
          purchasePrice: null,
          imageUrls: [],
        }]) },
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
        prisma as never,
        new ProductTransactionalReadRepositoryAdapter(),
      ).load({ organizationId: 'organization-1', targetCutoff });
    };
    const sellpiaThrough5 = sellpiaGeneration('00000000-0000-4000-8000-000000000031', '11', '2026-09-05');
    const sellpiaThrough6 = sellpiaGeneration('00000000-0000-4000-8000-000000000033', '12', '2026-09-06');

    await expect(loadWith([sellpiaThrough6, sellpiaThrough5], '2026-09-06')).resolves.toMatchObject({
      actualCutoff: '2026-09-06',
      sourceVector: { sellpia: { operationId: sellpiaThrough6.operationId } },
      sources: { sellpia: { ready: true, actualCutoff: '2026-09-06' } },
    });
    // A generation running past a cutoff inside its month cannot be cut back to it;
    // the one ending on the cutoff is read instead.
    await expect(loadWith([sellpiaThrough6, sellpiaThrough5], '2026-09-05')).resolves.toMatchObject({
      actualCutoff: '2026-09-05',
      sourceVector: { sellpia: { operationId: sellpiaThrough5.operationId } },
    });
    await expect(loadWith([sellpiaThrough6], '2026-09-05')).resolves.toMatchObject({ actualCutoff: null });
    // A cutoff that closes its month reads any generation running past it.
    await expect(loadWith([sellpiaThrough6], '2026-08-31')).resolves.toMatchObject({ actualCutoff: '2026-08-31' });
  });
});
