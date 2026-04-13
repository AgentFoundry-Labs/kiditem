/** Wing 월 집계 데이터 — adSnapshot(source=wing, pageType=dashboard_kpi)에서 파싱 */
export interface WingMonthlyData {
  revenue: number;
  orders: number;
  visitors: number;
  views: number;
  cartAdds: number;
  salesQty: number;
  conversionRate: number;
  adSpend: number;
  adGmv: number;
  adRoas: number;
  startDate: string | null;
  endDate: string | null;
  capturedAt: Date;
  rawAdSummary: Record<string, unknown> | null;
}

/** Wing override 적용 후 당월 유효 메트릭 */
export interface EffectiveMetrics {
  revenue: number;
  adCost: number;
  adRevenue: number;
  orderCount: number;
  netProfit: number;
  adRate: number;
}

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
