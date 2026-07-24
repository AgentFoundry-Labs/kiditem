import { describe, expect, it } from 'vitest';

const modulePath = './product-abc.js';

async function contracts() {
  return import(modulePath);
}

describe('master product ABC contracts', () => {
  it('parses the supported policy and nullable grade publication result', async () => {
    const {
      MasterProductAbcPolicySchema,
      MasterProductAbcRecalculationResultSchema,
    } = await contracts();
    const policy = MasterProductAbcPolicySchema.parse({
      metric: 'SALES_QUANTITY',
      periodDays: 90,
      aCumulativeThreshold: 70,
      bCumulativeThreshold: 90,
    });
    expect(policy).toMatchObject({ metric: 'SALES_QUANTITY', periodDays: 90 });
    expect(MasterProductAbcRecalculationResultSchema.parse({
      changedProductCount: 2,
      classifiedProductCount: 1,
      unclassifiedProductCount: 1,
      grades: [{
        masterProductId: '00000000-0000-4000-8000-000000000001',
        abcGrade: null,
      }],
    }).grades[0]?.abcGrade).toBeNull();
  });

  it('rejects unsupported metrics, incomplete-month windows, and invalid thresholds', async () => {
    const { MasterProductAbcPolicySchema } = await contracts();
    expect(() => MasterProductAbcPolicySchema.parse({
      metric: 'DEPLETION_RATE',
      periodDays: 30,
      aCumulativeThreshold: 70,
      bCumulativeThreshold: 90,
    })).toThrow();
    expect(() => MasterProductAbcPolicySchema.parse({
      metric: 'SALES_AMOUNT',
      periodDays: 7,
      aCumulativeThreshold: 70,
      bCumulativeThreshold: 90,
    })).toThrow();
    expect(() => MasterProductAbcPolicySchema.parse({
      metric: 'SALES_AMOUNT',
      periodDays: 30,
      aCumulativeThreshold: 90,
      bCumulativeThreshold: 70,
    })).toThrow();
  });
});
