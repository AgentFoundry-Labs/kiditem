import { BusinessRule } from '@prisma/client';
import { CompiledRule, ProductContext, RuleViolation } from './types';

const OPERATORS: Record<string, (v: number, t: { value?: number; min?: number; max?: number }) => boolean> = {
  gt:  (v, t) => v > (t.value ?? 0),
  lt:  (v, t) => v < (t.value ?? 0),
  gte: (v, t) => v >= (t.value ?? 0),
  lte: (v, t) => v <= (t.value ?? 0),
  eq:  (v, t) => v === (t.value ?? 0),
  between: (v, t) => v >= (t.min ?? 0) && v <= (t.max ?? 0),
};

function resolveTemplate(
  template: string,
  vars: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    if (val === undefined || val === null) return '—';
    if (typeof val === 'number') return Number.isInteger(val) ? String(val) : val.toFixed(1);
    return String(val);
  });
}

interface Condition {
  field: string;
  op: string;
  value: number | string;
}

function evaluateCondition(ctx: ProductContext, cond: Condition): boolean {
  const ctxValue = ctx[cond.field as keyof ProductContext];
  if (ctxValue === undefined || ctxValue === null) return false;

  if (typeof ctxValue === 'string') {
    return cond.op === 'eq' && ctxValue === String(cond.value);
  }
  if (typeof ctxValue !== 'number') return false;

  const op = OPERATORS[cond.op];
  return op ? op(ctxValue, { value: Number(cond.value) }) : false;
}

function hasNullField(ctx: ProductContext, conditions: Condition[]): boolean {
  return conditions.some((c) => {
    const v = ctx[c.field as keyof ProductContext];
    return v === undefined || v === null;
  });
}

export function compileRule(dbRule: BusinessRule): CompiledRule {
  const threshold = dbRule.threshold as { value?: number; min?: number; max?: number };
  const conditions = dbRule.conditions as Condition[] | null;
  const isCompound = Array.isArray(conditions) && conditions.length > 0;

  return {
    id: dbRule.id,
    name: dbRule.displayName,
    field: isCompound ? `compound:${dbRule.name}` : dbRule.field,
    severity: dbRule.severity,
    category: dbRule.category,
    actionType: dbRule.actionType,
    evaluate: (ctx: ProductContext): RuleViolation | null => {
      if (isCompound) {
        if (hasNullField(ctx, conditions)) return null;
        const allPass = conditions.every((c) => evaluateCondition(ctx, c));
        if (!allPass) return null;

        const firstValue = ctx[conditions[0].field as keyof ProductContext];
        const vars: Record<string, unknown> = { ...threshold, value: firstValue };
        conditions.forEach((c, i) => {
          if (i > 0) vars[`value${i + 1}`] = ctx[c.field as keyof ProductContext];
        });

        return {
          ruleId: dbRule.id,
          ruleName: dbRule.displayName,
          field: `compound:${dbRule.name}`,
          severity: dbRule.severity,
          category: dbRule.category,
          message: resolveTemplate(dbRule.messageTemplate, vars),
          actionType: dbRule.actionType,
          value: typeof firstValue === 'number' ? firstValue : 0,
          threshold: threshold.value ?? threshold,
        };
      }

      const value = ctx[dbRule.field as keyof ProductContext];
      if (value === undefined || value === null) return null;
      if (typeof value !== 'number') return null;

      const op = OPERATORS[dbRule.operator];
      if (!op) return null;
      if (!op(value, threshold)) return null;

      return {
        ruleId: dbRule.id,
        ruleName: dbRule.displayName,
        field: dbRule.field,
        severity: dbRule.severity,
        category: dbRule.category,
        message: resolveTemplate(dbRule.messageTemplate, { value, ...threshold }),
        actionType: dbRule.actionType,
        value,
        threshold: threshold.value ?? threshold,
      };
    },
  };
}

const SEVERITY_RANK: Record<string, number> = { critical: 3, warning: 2, info: 1 };

export function deduplicateByField(violations: RuleViolation[]): RuleViolation[] {
  const byField = new Map<string, RuleViolation>();
  for (const v of violations) {
    const existing = byField.get(v.field);
    if (!existing || (SEVERITY_RANK[v.severity] ?? 0) > (SEVERITY_RANK[existing.severity] ?? 0)) {
      byField.set(v.field, v);
    }
  }
  return Array.from(byField.values());
}

export function computeHealthScore(violations: RuleViolation[]): number {
  const PENALTIES: Record<string, number> = {
    critical: 25,
    warning: 10,
    info: 3,
  };

  const total = violations.reduce(
    (sum, v) => sum + (PENALTIES[v.severity] ?? 0),
    0,
  );

  return Math.max(0, 100 - total);
}
