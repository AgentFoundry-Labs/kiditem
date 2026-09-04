export interface EvaluationResult {
  /** Rules-owned stable identity derived from the authenticated request. */
  requestId: string;
  status: 'completed';
  productCount: number;
  violationCount: number;
  criticalCount: number;
  evaluatedAt: Date;
}
