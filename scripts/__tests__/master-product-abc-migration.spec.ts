import { describe, expect, it, vi } from 'vitest';

const modulePath = '../data-migrations/v0.1.26/001_initialize_master_product_abc_policy.js';

async function migrationModule() {
  return import(modulePath);
}

function migrationTx() {
  const policies: Array<Record<string, unknown>> = [];
  const legacyGrades = new Map([
    ['master-1', 'A'],
    ['master-2', null],
  ]);
  const organizations = [{ id: 'org-1' }, { id: 'org-2' }];
  return {
    state: { policies, legacyGrades },
    tx: {
      organization: { findMany: vi.fn().mockResolvedValue(organizations) },
      masterProductAbcPolicy: {
        findMany: vi.fn().mockImplementation(async () => policies),
        createMany: vi.fn().mockImplementation(async ({ data }) => {
          let count = 0;
          for (const policy of data as Array<Record<string, unknown>>) {
            if (!policies.some((existing) => existing.organizationId === policy.organizationId)) {
              policies.push(policy);
              count += 1;
            }
          }
          return { count };
        }),
      },
      masterProduct: {
        updateMany: vi.fn().mockImplementation(async () => {
          const count = [...legacyGrades.values()].filter((grade) => grade !== null).length;
          for (const id of legacyGrades.keys()) legacyGrades.set(id, null);
          return { count };
        }),
      },
    },
  };
}

describe('master product ABC foundation migration', () => {
  it('creates default policies and clears legacy manual grades idempotently', async () => {
    const { initializeMasterProductAbcPolicy } = await migrationModule();
    const { tx, state } = migrationTx();

    await expect(initializeMasterProductAbcPolicy.run(tx as never)).resolves.toMatchObject({
      affectedRows: 3,
      details: { createdPolicyCount: 2, clearedLegacyGradeCount: 1 },
    });
    expect(state.policies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        organizationId: 'org-1', metric: 'SALES_QUANTITY', periodDays: 30,
        aCumulativeThreshold: 70, bCumulativeThreshold: 90,
      }),
    ]));
    await expect(initializeMasterProductAbcPolicy.run(tx as never)).resolves.toMatchObject({
      affectedRows: 0,
    });
  });
});
