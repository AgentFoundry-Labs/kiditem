/** Rules-owned input for applying a deterministic evaluation result. */
export const APPLY_RULES_EVALUATION_PORT = Symbol('APPLY_RULES_EVALUATION_PORT');

export interface ApplyRulesEvaluationPort {
  evaluateAndApply(input: {
    organizationId: string;
    operationId: string;
  }): Promise<{
    productCount: number;
    violationCount: number;
    criticalCount: number;
  }>;
}
