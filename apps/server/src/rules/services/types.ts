export interface EvaluationResult {
  /** Rules-owned OperationRun id. */
  operationId: string;
  status: string;
  total?: number;
  healthy?: number;
  warning?: number;
  critical?: number;
  violationCount?: number;
  evaluatedAt?: Date;
}
