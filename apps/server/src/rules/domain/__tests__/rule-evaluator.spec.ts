import { describe, expect, it } from 'vitest';
import { evaluateProductRules } from '../rule-evaluator';

describe('evaluateProductRules', () => {
  it('evaluates stored rules and deducts only the highest severity per field', () => {
    const result = evaluateProductRules(
      {
        masterId: 'product-1',
        values: { profitRate: -5, currentStock: 0, reviewCount: null },
      },
      [
        rule({ name: 'loss', field: 'profitRate', operator: 'lt', threshold: { value: 0 }, severity: 'critical' }),
        rule({ name: 'low-profit', field: 'profitRate', operator: 'lte', threshold: { value: 3 }, severity: 'warning' }),
        rule({ name: 'out-of-stock', field: 'currentStock', operator: 'lte', threshold: { value: 0 }, severity: 'critical' }),
        rule({ name: 'no-review', field: 'reviewCount', operator: 'lte', threshold: { value: 0 }, severity: 'info' }),
      ],
    );

    expect(result).toEqual({
      masterId: 'product-1',
      healthScore: 50,
      violations: [
        expect.objectContaining({ ruleName: 'loss', field: 'profitRate', value: -5 }),
        expect.objectContaining({ ruleName: 'out-of-stock', field: 'currentStock', value: 0 }),
      ],
    });
  });

  it('supports compound conditions and fails closed for an unsupported operator', () => {
    expect(evaluateProductRules(
      { masterId: 'product-1', values: { abcGrade: 'A', adRate: 20 } },
      [rule({
        name: 'a-grade-ad',
        field: 'adRate',
        operator: 'gt',
        threshold: { value: 10 },
        severity: 'warning',
        conditions: [{ field: 'abcGrade', operator: 'eq', value: 'A' }],
      })],
    )).toMatchObject({ healthScore: 90, violations: [{ ruleName: 'a-grade-ad' }] });

    expect(() => evaluateProductRules(
      { masterId: 'product-1', values: { profitRate: 1 } },
      [rule({ name: 'unsafe', field: 'profitRate', operator: 'custom', threshold: { value: 0 } })],
    )).toThrow('RULES_EVALUATION_OPERATOR_UNSUPPORTED');
  });
});

function rule(overrides: Partial<{
  name: string;
  displayName: string;
  category: string;
  severity: string;
  field: string;
  operator: string;
  threshold: unknown;
  messageTemplate: string;
  actionType: string | null;
  conditions: unknown;
  sortOrder: number;
}> = {}) {
  return {
    name: 'rule',
    displayName: 'Rule',
    category: 'profitability',
    severity: 'warning',
    field: 'profitRate',
    operator: 'lt',
    threshold: { value: 0 },
    messageTemplate: '{{value}}',
    actionType: null,
    conditions: null,
    sortOrder: 0,
    ...overrides,
  };
}
