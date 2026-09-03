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
        status: 'MISSING',
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
        sellpia: { status: 'MISSING' },
        advertising: { status: 'MISSING' },
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
});
