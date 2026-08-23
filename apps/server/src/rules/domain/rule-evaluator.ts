export type RuleFactValue = string | number | boolean | null;

export interface RuleEvaluationProduct {
  masterId: string;
  values: Readonly<Record<string, RuleFactValue>>;
}

export interface RuleEvaluationDefinition {
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
}

export interface EvaluatedRuleViolation {
  ruleName: string;
  field: string;
  severity: string;
  category: string;
  message: string;
  actionType: string | null;
  value: string | number | boolean;
}

export interface EvaluatedProductRules {
  masterId: string;
  healthScore: number;
  violations: EvaluatedRuleViolation[];
}

const severityPenalty = new Map([
  ['critical', 25],
  ['warning', 10],
  ['info', 3],
]);

export function evaluateProductRules(
  product: RuleEvaluationProduct,
  definitions: readonly RuleEvaluationDefinition[],
): EvaluatedProductRules {
  const strongestByField = new Map<string, EvaluatedRuleViolation>();
  const ordered = [...definitions].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  );
  for (const definition of ordered) {
    const value = product.values[definition.field];
    if (value === null || value === undefined) continue;
    if (!conditionsMatch(product.values, definition.conditions)) continue;
    if (!comparison(value, definition.operator, definition.threshold)) continue;
    const penalty = penaltyFor(definition.severity);
    const current = strongestByField.get(definition.field);
    if (current && penaltyFor(current.severity) >= penalty) continue;
    strongestByField.set(definition.field, {
      ruleName: definition.name,
      field: definition.field,
      severity: definition.severity,
      category: definition.category,
      message: renderMessage(definition.messageTemplate, value, definition.field),
      actionType: definition.actionType,
      value,
    });
  }
  const violations = [...strongestByField.values()];
  const totalPenalty = violations.reduce(
    (sum, violation) => sum + penaltyFor(violation.severity),
    0,
  );
  return {
    masterId: product.masterId,
    healthScore: Math.max(0, 100 - totalPenalty),
    violations,
  };
}

function conditionsMatch(
  values: Readonly<Record<string, RuleFactValue>>,
  rawConditions: unknown,
): boolean {
  if (rawConditions === null || rawConditions === undefined) return true;
  if (!Array.isArray(rawConditions)) throw new Error('RULES_EVALUATION_CONDITION_INVALID');
  return rawConditions.every((rawCondition) => {
    if (!isRecord(rawCondition) || typeof rawCondition.field !== 'string') {
      throw new Error('RULES_EVALUATION_CONDITION_INVALID');
    }
    const operator = typeof rawCondition.operator === 'string'
      ? rawCondition.operator
      : rawCondition.op;
    if (typeof operator !== 'string' || !('value' in rawCondition)) {
      throw new Error('RULES_EVALUATION_CONDITION_INVALID');
    }
    const actual = values[rawCondition.field];
    if (actual === null || actual === undefined) return false;
    return compare(actual, operator, rawCondition.value);
  });
}

function comparison(value: Exclude<RuleFactValue, null>, operator: string, threshold: unknown): boolean {
  if (!isRecord(threshold)) throw new Error('RULES_EVALUATION_THRESHOLD_INVALID');
  if (operator === 'between') {
    return compare(value, 'gte', threshold.min) && compare(value, 'lte', threshold.max);
  }
  if (!('value' in threshold)) throw new Error('RULES_EVALUATION_THRESHOLD_INVALID');
  return compare(value, operator, threshold.value);
}

function compare(left: Exclude<RuleFactValue, null>, operator: string, right: unknown): boolean {
  if (operator === 'eq') return left === right;
  if (typeof left !== 'number' || typeof right !== 'number' || !Number.isFinite(left) || !Number.isFinite(right)) {
    throw new Error('RULES_EVALUATION_VALUE_INVALID');
  }
  if (operator === 'gt') return left > right;
  if (operator === 'gte') return left >= right;
  if (operator === 'lt') return left < right;
  if (operator === 'lte') return left <= right;
  throw new Error('RULES_EVALUATION_OPERATOR_UNSUPPORTED');
}

function penaltyFor(severity: string): number {
  const penalty = severityPenalty.get(severity);
  if (penalty === undefined) throw new Error('RULES_EVALUATION_SEVERITY_INVALID');
  return penalty;
}

function renderMessage(template: string, value: string | number | boolean, field: string): string {
  return template
    .replaceAll('{{value}}', String(value))
    .replaceAll('{값}', String(value))
    .replaceAll('{{field}}', field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
