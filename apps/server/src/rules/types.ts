export interface ProductContext {
  productId: string;
  productName: string;
  companyId: string;

  profitRate: number | null;
  netProfit: number | null;
  revenue: number | null;
  costPrice: number;
  sellPrice: number;
  margin: number | null;
  costRate: number | null;

  adRate: number | null;
  adTier: string | null;
  adCostRate: number | null;
  abcGrade: string | null;

  currentStock: number;
  reorderPoint: number;
  avgDailySales: number;
  daysOfStock: number;

  reviewCount: number;
  thumbnailCTR: number | null;

  orderCount: number | null;
  cancelRate: number | null;
  returnRate: number | null;
}

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  field: string;
  severity: string;
  category: string;
  message: string;
  actionType: string | null;
  value: number;
  threshold: number | Record<string, number>;
}

export interface CompiledRule {
  id: string;
  name: string;
  field: string;
  severity: string;
  category: string;
  actionType: string | null;
  evaluate: (ctx: ProductContext) => RuleViolation | null;
}

export interface EvaluationResult {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  violationCount: number;
  evaluatedAt: Date;
}

export interface ProductEvaluation {
  productId: string;
  violations: RuleViolation[];
  healthScore: number;
}
