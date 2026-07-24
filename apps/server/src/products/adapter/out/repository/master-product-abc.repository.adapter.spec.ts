import { describe, expect, it, vi } from 'vitest';
import { MasterProductAbcRepositoryAdapter } from './master-product-abc.repository.adapter';

describe('MasterProductAbcRepositoryAdapter', () => {
  it('acquires the organization advisory transaction lock before a stale policy no-op', async () => {
    const calls: string[] = [];
    const persistedPolicy = {
      metric: 'SALES_AMOUNT', periodDays: 90,
      aCumulativeThreshold: 60, bCumulativeThreshold: 85,
      lastCalculatedAt: null, sourceCapturedAt: null, revision: 1,
    };
    const tx = {
      $queryRaw: vi.fn().mockImplementation(async () => { calls.push('lock'); }),
      masterProductAbcPolicy: {
        findUnique: vi.fn().mockImplementation(async () => { calls.push('policy'); return persistedPolicy; }),
      },
      masterProduct: { findMany: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async (work) => work(tx)) };
    const repository = new MasterProductAbcRepositoryAdapter(prisma as never);

    await expect(repository.publishGrades({
      organizationId: 'org-1',
      policy: {
        ...persistedPolicy,
        metric: 'SALES_QUANTITY',
        periodDays: 30,
      },
      sourceCapturedAt: null,
      grades: new Map([['product-1', 'A']]),
      metricValues: new Map([['product-1', 1]]),
      allowPolicyReplacement: false,
    })).resolves.toMatchObject({ changedProductCount: 0, stale: true });

    expect(calls).toEqual(['lock', 'policy']);
    expect(tx.masterProduct.findMany).not.toHaveBeenCalled();
  });

  it('rejects an older publication revision even when policy settings match', async () => {
    const persistedPolicy = {
      metric: 'SALES_QUANTITY', periodDays: 30,
      aCumulativeThreshold: 70, bCumulativeThreshold: 90,
      lastCalculatedAt: new Date('2026-07-24T00:00:00Z'),
      sourceCapturedAt: new Date('2026-07-23T00:00:00Z'),
      revision: 2,
    };
    const tx = {
      $queryRaw: vi.fn(),
      masterProductAbcPolicy: {
        findUnique: vi.fn().mockResolvedValue(persistedPolicy),
      },
      masterProduct: { findMany: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async (work) => work(tx)) };
    const repository = new MasterProductAbcRepositoryAdapter(prisma as never);

    await expect(repository.publishGrades({
      organizationId: 'org-1',
      policy: { ...persistedPolicy, revision: 1 },
      sourceCapturedAt: persistedPolicy.sourceCapturedAt,
      grades: new Map([['product-1', 'B']]),
      metricValues: new Map([['product-1', 1]]),
    })).resolves.toMatchObject({ changedProductCount: 0, stale: true });

    expect(tx.masterProduct.findMany).not.toHaveBeenCalled();
  });
});
