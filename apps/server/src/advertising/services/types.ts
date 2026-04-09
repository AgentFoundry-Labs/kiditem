export interface AdsConfig {
  roas: { thresholds: { excellent: number; warning: number; poor: number } };
  adRate: { thresholds: { warning: number; critical: number } };
  budget: { allocation: Record<string, number> };
  roasTargetByGrade: Record<string, number>;
  adRateTargetByGrade: Record<string, number>;
  tier: { dailyBudget: Record<string, number> };
  benchmark: {
    roas: { avg: number; good: number; excellent: number; poor: number };
    ctr: { avg: number; good: number; excellent: number; poor: number };
    cvr: { avg: number; good: number; excellent: number; poor: number };
    cpc: { avg: number; good: number; excellent: number; poor: number };
    adRate: { avg: number; good: number; excellent: number; poor: number };
    acos: { avg: number; good: number; excellent: number; poor: number };
  };
  gradeStrategy: Record<string, { title: string; subtitle: string; pills: string[]; budgetTarget: number; roasTarget: number; adRateTarget: number }>;
}

export interface BenchmarkComparison {
  metric: string;
  label: string;
  myValue: number;
  industryAvg: number;
  industryGood: number;
  industryExcellent: number;
  industryPoor: number;
  status: 'excellent' | 'good' | 'average' | 'below' | 'poor';
  gap: number;
  gapPercent: number;
  strategy: string;
  actions: string[];
}

/** Normalized KPI totals extracted from raw extension payload */
export interface NormalizedCampaignKpi {
  adSpend: number;
  adRevenue: number;
  totalRevenue: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  orders: number;
  roas: number;
  conversionRate: number;
}

/** Budget allocation per ABC grade with current vs target comparison */
export interface GradeBudgetAllocation {
  grade: string;
  currentPercent: number;
  targetPercent: number;
  gap: number;
}
