import { describe, expect, it, vi } from 'vitest';

const modulePath = '../data-migrations/v0.1.30/001_upgrade_master_product_abc_profit_policy.js';

async function migrationModule() {
  return import(modulePath);
}

function migrationTx() {
  const policies = [
    {
      organizationId: 'org-1',
      metric: 'SALES_QUANTITY',
      periodDays: 30,
      aCumulativeThreshold: 70,
      bCumulativeThreshold: 90,
      minProvisionalMonths: 3,
      minClassifiedMonths: 6,
      revision: 2,
      lastCalculatedAt: new Date('2026-06-01T00:00:00.000Z'),
      sourceCapturedAt: new Date('2026-06-01T00:00:00.000Z'),
    },
    {
      organizationId: 'org-2',
      metric: 'SALES_AMOUNT',
      periodDays: 90,
      aCumulativeThreshold: 65,
      bCumulativeThreshold: 85,
      minProvisionalMonths: 2,
      minClassifiedMonths: 4,
      revision: 0,
      lastCalculatedAt: null,
      sourceCapturedAt: null,
    },
  ];
  const masterProducts = [
    { id: 'master-1', organizationId: 'org-1', abcGrade: 'A' },
    { id: 'master-2', organizationId: 'org-1', abcGrade: null },
    { id: 'master-3', organizationId: 'org-2', abcGrade: 'C' },
  ];
  const histories: Array<Record<string, unknown>> = [];

  return {
    state: { histories, masterProducts, policies },
    tx: {
      masterProductAbcPolicy: {
        findMany: vi.fn().mockImplementation(async () => policies.map((policy) => ({ ...policy }))),
        updateMany: vi.fn().mockImplementation(async ({ data, where }) => {
          const organizationIds = new Set(where.organizationId.in as string[]);
          let count = 0;
          for (const policy of policies) {
            if (!organizationIds.has(policy.organizationId)) continue;
            Object.assign(policy, {
              ...data,
              revision: policy.revision + (data.revision?.increment ?? 0),
            });
            count += 1;
          }
          return { count };
        }),
      },
      masterProduct: {
        findMany: vi.fn().mockImplementation(async ({ where }) => {
          const organizationIds = new Set(where.organizationId.in as string[]);
          return masterProducts
            .filter((product) => organizationIds.has(product.organizationId) && product.abcGrade !== null)
            .map((product) => ({ ...product }));
        }),
        updateMany: vi.fn().mockImplementation(async ({ where }) => {
          const organizationIds = new Set(where.organizationId.in as string[]);
          let count = 0;
          for (const product of masterProducts) {
            if (!organizationIds.has(product.organizationId) || product.abcGrade === null) continue;
            product.abcGrade = null;
            count += 1;
          }
          return { count };
        }),
      },
      masterProductAbcGradeHistory: {
        createMany: vi.fn().mockImplementation(async ({ data }) => {
          histories.push(...data);
          return { count: data.length };
        }),
      },
    },
  };
}

describe('gross-profit MasterProduct ABC migration', () => {
  it('replaces legacy policies, records grade invalidation, and is idempotent', async () => {
    const { upgradeMasterProductAbcProfitPolicy } = await migrationModule();
    const { tx, state } = migrationTx();

    await expect(upgradeMasterProductAbcProfitPolicy.run(tx as never)).resolves.toMatchObject({
      affectedRows: 6,
      details: {
        upgradedPolicyCount: 2,
        clearedLegacyGradeCount: 2,
        createdGradeHistoryCount: 2,
      },
    });
    expect(state.policies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        organizationId: 'org-1',
        metric: 'GROSS_PROFIT',
        periodDays: 360,
        aCumulativeThreshold: 70,
        bCumulativeThreshold: 90,
        minProvisionalMonths: 3,
        minClassifiedMonths: 6,
        revision: 3,
        lastCalculatedAt: null,
        sourceCapturedAt: null,
      }),
      expect.objectContaining({ organizationId: 'org-2', revision: 1 }),
    ]));
    expect(state.masterProducts.map(({ abcGrade }) => abcGrade)).toEqual([null, null, null]);
    expect(state.histories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        organizationId: 'org-1', masterProductId: 'master-1', oldGrade: 'A', newGrade: null,
        metric: 'SALES_QUANTITY', periodDays: 30, metricValue: null,
      }),
      expect.objectContaining({
        organizationId: 'org-2', masterProductId: 'master-3', oldGrade: 'C', newGrade: null,
        metric: 'SALES_AMOUNT', periodDays: 90, metricValue: null,
      }),
    ]));

    await expect(upgradeMasterProductAbcProfitPolicy.run(tx as never)).resolves.toMatchObject({
      affectedRows: 0,
      details: {
        upgradedPolicyCount: 0,
        clearedLegacyGradeCount: 0,
        createdGradeHistoryCount: 0,
      },
    });
    expect(state.histories).toHaveLength(2);
    expect(state.policies.map(({ revision }) => revision)).toEqual([3, 1]);
  });
});
