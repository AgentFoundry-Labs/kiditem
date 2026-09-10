import { describe, expect, it } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD } from '@kiditem/shared/product-abc';
import {
  evaluateMasterProductAbc,
  type MasterProductAbcFormulaReadyFacts,
} from './master-product-abc';

describe('absolute ABC QA regressions', () => {
  it('uses the canonical shared current payload reference', () => {
    expect(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD).toMatchObject({
      formulaKey: 'PRODUCT_ABC_ABSOLUTE',
      version: 2,
      halfLifeDays: 90,
      weights: { profit: 0.5, margin: 0.3, consistency: 0.2 },
      minimumSaleAgeDays: 30,
      requiresCompleteEvaluationPeriod: true,
    });
  });

  it('has no cohort input or persistence side effect in its public evaluator', () => {
    const input: MasterProductAbcFormulaReadyFacts = {
      masterProductId: 'product-a',
      cutoffDate: '2026-07-31',
      saleStartDate: '2026-06-01',
      evaluationPeriodComplete: true,
      monthlyFacts: [{
        yearMonth: '2026-07',
        coverageStartDate: '2026-07-01',
        coverageEndDate: '2026-07-31',
        coveredDays: 31,
        recognizedRevenue: 1_000_000,
        orderTimeSupplyCost: 100_000,
        advertisingSpend: 0,
        provenance: {
          costBasis: 'ORDER_TIME_SUPPLY_COST',
          vatIncluded: true,
          advertisingEvidence: 'CONFIRMED_ZERO',
        },
      }],
    };
    const candidate = evaluateMasterProductAbc({
      facts: input,
      formula: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
    });

    expect(candidate).toHaveProperty('abcGrade');
    expect(candidate).not.toHaveProperty('rank');
    expect(candidate).not.toHaveProperty('cohort');
    expect(candidate).not.toHaveProperty('repository');
  });
});
