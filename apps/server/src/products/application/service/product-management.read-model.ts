import { Prisma } from '@prisma/client';
import type {
  ProductManagementListItem,
  ProductManagementPipelineCounts,
  ProductManagementTrafficSnapshot,
} from '@kiditem/shared/product';

export type {
  ProductManagementListItem,
  ProductManagementPipelineCounts,
  ProductManagementTrafficSnapshot,
};

export interface MetricSums {
  visitors: number;
  views: number;
  cartAdds: number;
  orders: number;
  salesQty: number;
  revenue: number;
  adSpend: number;
  adImpressions: number;
  adClicks: number;
}

export interface ProductManagementGradeInfo {
  grade: 'A' | 'B' | 'C';
  score: number;
  rank: number;
  prevRank: number | null;
  strategy: string;
}

export interface ManagementFacts {
  stockByMaster: Map<string, number>;
  inventoryByMaster: Map<string, {
    inventoryId: string | null;
    optionId: string | null;
    currentStock: number;
    reservedStock: number;
    availableStock: number;
    safetyStock: number;
    reorderPoint: number;
    reorderQuantity: number;
    leadTimeDays: number | null;
    dailySalesAvg: number;
    optimalStock: number;
    recommendedOrderQty: number;
    daysUntilStockout: number | null;
    stockStatus: ProductManagementListItem['stockStatus'];
    stockAction: ProductManagementListItem['stockAction'];
  }>;
  statusByMaster: Map<string, ProductManagementListItem['status']>;
  activeAdMasterIds: Set<string>;
  optionByMaster: Map<string, {
    id: string;
    sku: string;
    costPrice: number;
    sellPrice: number;
    commissionRate: number;
    shippingCost: number;
    isCostMissing: boolean;
  }>;
  listingByMaster: Map<string, {
    id: string;
    externalId: string;
    channelName: string | null;
    channelPrice: number | null;
  }>;
  periodMetricsByMaster: Map<string, MetricSums>;
  t14MetricsByMaster: Map<string, MetricSums>;
  t14PrevMetricsByMaster: Map<string, MetricSums>;
  profitByMaster: Map<string, { revenue: number; netProfit: number; profitRate: number; orderCount: number }>;
  reviewCountByMaster: Map<string, number>;
}

export const EMPTY_METRICS: MetricSums = {
  visitors: 0,
  views: 0,
  cartAdds: 0,
  orders: 0,
  salesQty: 0,
  revenue: 0,
  adSpend: 0,
  adImpressions: 0,
  adClicks: 0,
};

function utcStartOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function daysAgo(days: number): Date {
  const d = utcStartOfToday();
  d.setUTCDate(d.getUTCDate() - Math.max(days - 1, 0));
  return d;
}

export function previousWindowStart(days: number): Date {
  const d = utcStartOfToday();
  d.setUTCDate(d.getUTCDate() - (days * 2 - 1));
  return d;
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

export function ratioToPercent(value: Prisma.Decimal | number | null | undefined): number {
  const n = toNumber(value);
  if (n === 0) return 0;
  return Math.abs(n) <= 1 ? n * 100 : n;
}

export function toTrafficSnapshot(metrics: MetricSums, profitRate?: number): ProductManagementTrafficSnapshot {
  return {
    visitors: metrics.visitors,
    views: metrics.views,
    cartAdds: metrics.cartAdds,
    orders: metrics.orders,
    salesQty: metrics.salesQty,
    revenue: metrics.revenue,
    conversionRate: metrics.visitors > 0 ? (metrics.orders / metrics.visitors) * 100 : 0,
    ...(profitRate !== undefined ? { profitRate } : {}),
  } satisfies ProductManagementTrafficSnapshot;
}

export function mergeMetric(target: MetricSums, source: Partial<MetricSums>): void {
  target.visitors += source.visitors ?? 0;
  target.views += source.views ?? 0;
  target.cartAdds += source.cartAdds ?? 0;
  target.orders += source.orders ?? 0;
  target.salesQty += source.salesQty ?? 0;
  target.revenue += source.revenue ?? 0;
  target.adSpend += source.adSpend ?? 0;
  target.adImpressions += source.adImpressions ?? 0;
  target.adClicks += source.adClicks ?? 0;
}

export function isActiveText(...values: Array<string | null | undefined>): boolean {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  if (!text) return false;
  if (/(중지|종료|삭제|품절|inactive|off|stop|end|paused|disabled)/i.test(text)) return false;
  return /(판매중|노출|active|on|enabled|running|live)/i.test(text);
}

export function isCleanupText(...values: Array<string | null | undefined>): boolean {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  return /(정리|삭제|종료|discontinued|archived|deleted)/i.test(text);
}

export function isInactiveText(...values: Array<string | null | undefined>): boolean {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  return /(중지|품절|inactive|off|stop|paused|disabled)/i.test(text);
}

export function isActiveAdTarget(row: {
  onOff: string | null;
  status: string | null;
  spend: number;
  adSpend: number;
  revenue: number;
  adRevenue: number;
  clicks: number;
  impressions: number;
}): boolean {
  const text = `${row.onOff ?? ''} ${row.status ?? ''}`.toLowerCase();
  if (/(off|중지|종료|paused|disabled)/i.test(text)) return false;
  if (/(on|운영|진행|active|enabled|running)/i.test(text)) return true;
  return row.spend > 0 || row.adSpend > 0 || row.revenue > 0 || row.adRevenue > 0 || row.clicks > 0 || row.impressions > 0;
}
