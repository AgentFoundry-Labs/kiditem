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
