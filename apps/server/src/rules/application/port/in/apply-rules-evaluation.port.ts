import type { ProductEvalResult } from '../../../services/types';

/** Rules-owned input for applying a deterministic evaluation result. */
export const APPLY_RULES_EVALUATION_PORT = Symbol('APPLY_RULES_EVALUATION_PORT');

export interface ApplyRulesEvaluationPort {
  apply(input: {
    organizationId: string;
    operationId: string;
    products: readonly ProductEvalResult[];
  }): Promise<{
    productCount: number;
    violationCount: number;
    criticalCount: number;
  }>;
}
