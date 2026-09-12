import { describe, expect, it, vi } from 'vitest';
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
        sellpia: { ready: false, actualCutoff: null },
        advertising: { ready: false, actualCutoff: null },
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
      'sale-age:raw',
    ]);
  });
});
