import { describe, it, expect } from 'vitest';
import { compileRule, computeHealthScore, deduplicateByField } from './evaluator';
import { ProductContext, RuleViolation } from './types';

function makeCtx(overrides: Partial<ProductContext> = {}): ProductContext {
  return {
    productId: 'p1',
    productName: 'Test Product',
    companyId: 'c1',
    profitRate: 10,
    netProfit: 5000,
    revenue: 100000,
    costPrice: 3000,
    sellPrice: 5000,
    margin: 40,
    costRate: 60,
    adRate: 5,
    adTier: null,
    adCostRate: 5,
    abcGrade: 'B',
    currentStock: 50,
    reorderPoint: 10,
    avgDailySales: 3,
    daysOfStock: 16,
    reviewCount: 15,
    thumbnailCTR: 3.5,
    orderCount: 30,
    cancelRate: 2,
    returnRate: 2,
    ...overrides,
  };
}

function makeDbRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    companyId: 'c1',
    name: 'test-rule',
    displayName: 'Test Rule',
    description: '',
    category: 'profitability',
    severity: 'critical',
    field: 'profitRate',
    operator: 'lt',
    threshold: { value: 0 },
    messageTemplate: 'profitRate {{value}}%',
    actionType: null,
    autoExecute: false,
    active: true,
    sortOrder: 1,
    conditions: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as any;
}

describe('compileRule (legacy single-field)', () => {
  it('triggers when condition met', () => {
    const rule = compileRule(makeDbRule({ field: 'profitRate', operator: 'lt', threshold: { value: 0 } }));
    const result = rule.evaluate(makeCtx({ profitRate: -5 }));
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('critical');
    expect(result!.value).toBe(-5);
  });

  it('does not trigger when condition not met', () => {
    const rule = compileRule(makeDbRule({ field: 'profitRate', operator: 'lt', threshold: { value: 0 } }));
    expect(rule.evaluate(makeCtx({ profitRate: 10 }))).toBeNull();
  });

  it('skips when field is null (no data)', () => {
    const rule = compileRule(makeDbRule({ field: 'profitRate', operator: 'lt', threshold: { value: 0 } }));
    expect(rule.evaluate(makeCtx({ profitRate: null }))).toBeNull();
  });

  it('skips when field is string (non-number)', () => {
    const rule = compileRule(makeDbRule({ field: 'abcGrade', operator: 'lt', threshold: { value: 0 } }));
    expect(rule.evaluate(makeCtx({ abcGrade: 'A' }))).toBeNull();
  });

  it('handles between operator', () => {
    const rule = compileRule(makeDbRule({ operator: 'between', threshold: { min: -5, max: 3 } }));
    expect(rule.evaluate(makeCtx({ profitRate: 1 }))).not.toBeNull();
    expect(rule.evaluate(makeCtx({ profitRate: 10 }))).toBeNull();
  });
});

describe('deduplicateByField', () => {
  it('keeps highest severity per field', () => {
    const violations: RuleViolation[] = [
      { ruleId: 'r1', ruleName: 'A', field: 'currentStock', severity: 'warning', category: 'inv', message: '', actionType: null, value: 5, threshold: 10 },
      { ruleId: 'r2', ruleName: 'B', field: 'currentStock', severity: 'critical', category: 'inv', message: '', actionType: null, value: 0, threshold: 0 },
      { ruleId: 'r3', ruleName: 'C', field: 'profitRate', severity: 'info', category: 'prof', message: '', actionType: null, value: 1, threshold: 3 },
    ];
    const result = deduplicateByField(violations);
    expect(result).toHaveLength(2);
    const stockViolation = result.find(v => v.field === 'currentStock');
    expect(stockViolation!.severity).toBe('critical');
  });

  it('returns empty for empty input', () => {
    expect(deduplicateByField([])).toHaveLength(0);
  });
});

describe('compileRule (compound conditions)', () => {
  it('triggers when ALL conditions pass', () => {
    const rule = compileRule(makeDbRule({
      name: 'deficit-with-ad',
      conditions: [
        { field: 'profitRate', op: 'lt', value: 0 },
        { field: 'adCostRate', op: 'gt', value: 0 },
      ],
    }));
    const result = rule.evaluate(makeCtx({ profitRate: -5, adCostRate: 10 }));
    expect(result).not.toBeNull();
    expect(result!.value).toBe(-5);
    expect(result!.field).toBe('compound:deficit-with-ad');
  });

  it('does not trigger when one condition fails', () => {
    const rule = compileRule(makeDbRule({
      name: 'deficit-with-ad',
      conditions: [
        { field: 'profitRate', op: 'lt', value: 0 },
        { field: 'adCostRate', op: 'gt', value: 0 },
      ],
    }));
    expect(rule.evaluate(makeCtx({ profitRate: 10, adCostRate: 5 }))).toBeNull();
  });

  it('skips when any condition field is null', () => {
    const rule = compileRule(makeDbRule({
      name: 'test-compound',
      conditions: [
        { field: 'profitRate', op: 'lt', value: 0 },
        { field: 'adCostRate', op: 'gt', value: 0 },
      ],
    }));
    expect(rule.evaluate(makeCtx({ profitRate: null, adCostRate: 5 }))).toBeNull();
  });

  it('handles string eq condition (abcGrade)', () => {
    const rule = compileRule(makeDbRule({
      name: 'a-grade-low-review',
      conditions: [
        { field: 'abcGrade', op: 'eq', value: 'A' },
        { field: 'reviewCount', op: 'lt', value: 10 },
      ],
    }));
    expect(rule.evaluate(makeCtx({ abcGrade: 'A', reviewCount: 5 }))).not.toBeNull();
    expect(rule.evaluate(makeCtx({ abcGrade: 'B', reviewCount: 5 }))).toBeNull();
  });

  it('falls back to legacy when conditions is null', () => {
    const rule = compileRule(makeDbRule({ conditions: null }));
    expect(rule.evaluate(makeCtx({ profitRate: -5 }))).not.toBeNull();
  });

  it('falls back to legacy when conditions is empty array', () => {
    const rule = compileRule(makeDbRule({ conditions: [] }));
    expect(rule.evaluate(makeCtx({ profitRate: -5 }))).not.toBeNull();
  });

  it('populates value2 in template vars', () => {
    const rule = compileRule(makeDbRule({
      name: 'compound-template',
      messageTemplate: 'profitRate {{value}}%, adRate {{value2}}%',
      conditions: [
        { field: 'profitRate', op: 'lt', value: 0 },
        { field: 'adCostRate', op: 'gt', value: 0 },
      ],
    }));
    const result = rule.evaluate(makeCtx({ profitRate: -3, adCostRate: 8 }));
    expect(result).not.toBeNull();
    expect(result!.message).toBe('profitRate -3%, adRate 8%');
  });
});

describe('computeHealthScore', () => {
  it('returns 100 for no violations', () => {
    expect(computeHealthScore([])).toBe(100);
  });

  it('applies penalties: critical=-25, warning=-10, info=-3', () => {
    const violations: RuleViolation[] = [
      { ruleId: 'r1', ruleName: 'A', field: 'f', severity: 'critical', category: 'c', message: '', actionType: null, value: 0, threshold: 0 },
    ];
    expect(computeHealthScore(violations)).toBe(75);
  });

  it('floors at 0', () => {
    const violations: RuleViolation[] = Array(5).fill(null).map((_, i) => ({
      ruleId: `r${i}`, ruleName: `R${i}`, field: `f${i}`, severity: 'critical', category: 'c', message: '', actionType: null, value: 0, threshold: 0,
    }));
    expect(computeHealthScore(violations)).toBe(0);
  });
});
