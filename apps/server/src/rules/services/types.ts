export interface EvaluationResult {
  /**
   * Agent OS v2 `AgentRunRequest.id`. Replaces the legacy `taskId`.
   */
  requestId?: string;
  status: string;
  total?: number;
  healthy?: number;
  warning?: number;
  critical?: number;
  violationCount?: number;
  evaluatedAt?: Date;
}

export interface ProductEvalResult {
  masterId: string;
  healthScore: number;
  violations: Array<{
    ruleName: string;
    field: string;
    severity: string;
    category: string;
    message: string;
    actionType: string | null;
    value: number;
  }>;
}
