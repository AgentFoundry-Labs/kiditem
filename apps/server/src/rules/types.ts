export interface ProductContext {
  productId: string;
  productName: string;
  companyId: string;

  profitRate: number;
  netProfit: number;
  revenue: number;
  costPrice: number;
  sellPrice: number;
  margin: number;
  costRate: number;

  adRate: number;
  adTier: string | null;
  adCostRate: number;
  abcGrade: string | null;

  currentStock: number;
  reorderPoint: number;
  avgDailySales: number;
  daysOfStock: number;

  reviewCount: number;
  thumbnailCTR: number;

  orderCount: number;
  cancelRate: number;
  returnRate: number;
}

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
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
