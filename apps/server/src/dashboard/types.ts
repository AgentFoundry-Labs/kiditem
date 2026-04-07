/** Current + previous date range for comparison KPIs */
export interface DateRangeContext {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
}

/** Ad metrics snapshot for current vs previous period comparison */
export interface AdMetricsSnapshot {
  roas: number;
  ctr: number;
  adRevenue: number;
  totalAdSpend: number;
  prevMonthlyRevenue: number;
  prevMonthlyProfit: number;
  prevRoas: number;
  prevCtr: number;
  prevAdRevenue: number;
  prevTotalAdSpend: number;
  prevAdRate: number;
}
