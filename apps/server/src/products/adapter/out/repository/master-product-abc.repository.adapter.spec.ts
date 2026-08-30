import { describe, expect, it, vi } from 'vitest';
import { MasterProductAbcRepositoryAdapter } from './master-product-abc.repository.adapter';

describe('MasterProductAbcRepositoryAdapter', () => {
  it('acquires the organization advisory lock before rejecting a stale formula publication', async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async () => { calls.push('lock'); }),
      masterProductAbcFormulaState: {
        findUnique: vi.fn(async () => {
          calls.push('formula-state');
          return { revision: 2, activeFormulaVersionId: 'formula-2' };
        }),
      },
      masterProduct: { findMany: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async (work) => work(tx)) };
    const repository = new MasterProductAbcRepositoryAdapter(prisma as never);

    await expect(repository.publishEvaluations({
      organizationId: 'org-1',
      expectedFormulaStateRevision: 1,
      formulaVersionId: 'formula-1',
      evaluations: new Map(),
      reason: 'AUTOMATIC_PROFITABILITY_RECALCULATION',
    })).resolves.toEqual({ changedProductCount: 0, stale: true });

    expect(calls).toEqual(['lock', 'formula-state']);
    expect(tx.masterProduct.findMany).not.toHaveBeenCalled();
  });

  it('publishes with the Operations-owned transaction instead of opening a nested transaction', async () => {
    const tx = {
      $queryRaw: vi.fn(),
      masterProductAbcFormulaState: {
        findUnique: vi.fn().mockResolvedValue({
          revision: 2,
          activeFormulaVersionId: 'formula-2',
        }),
      },
    };
    const prisma = { $transaction: vi.fn() };
    const repository = new MasterProductAbcRepositoryAdapter(prisma as never);

    await expect(repository.publishEvaluationsInAttempt(tx, {
      organizationId: 'org-1',
      expectedFormulaStateRevision: 1,
      formulaVersionId: 'formula-1',
      evaluations: new Map(),
      reason: 'AUTOMATIC_PROFITABILITY_RECALCULATION',
    })).resolves.toEqual({ changedProductCount: 0, stale: true });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
