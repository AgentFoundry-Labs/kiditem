import type { Product, Company, Inventory, ProfitLoss } from '@prisma/client';

/** Product with relations loaded via `include: { company, inventory }` */
export type ProductWithRelations = Product & {
  company?: Company | null;
  inventory?: Inventory | null;
};

// ── Enrichment Map value types ──

export interface RevenueData {
  revenue: number;
  orderCount: number;
}

export interface TrafficMetrics {
  visitors: number;
  views: number;
  cartAdds: number;
  orders: number;
  salesQty: number;
  revenue: number;
}

export interface T14Metrics {
  revenue: number;
  salesQty: number;
  orders: number;
  conversionRate: number;
  date: string;
}

export interface T14PrevMetrics {
  revenue: number;
  salesQty: number;
  orders: number;
  date: string;
}

/** All enrichment data maps bundled into a single object */
export interface ProductEnrichmentMaps {
  profitLoss: Map<string, ProfitLoss>;
  revenue: Map<string, RevenueData>;
  ads: Map<string, number>;
  thumbnails: Map<string, number>;
  reviews: Map<string, number>;
  traffic: Map<string, TrafficMetrics>;
  gradeScores: Map<string, number>;
  t14: Map<string, T14Metrics>;
  t14Prev: Map<string, T14PrevMetrics>;
}
