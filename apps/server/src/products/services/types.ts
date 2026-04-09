import type { Product, Company, Inventory, ProfitLoss } from '@prisma/client';

// ── Thumbnail types ──

export type ThumbnailGrade = 'S' | 'A' | 'B' | 'C' | 'F';

export interface AnalysisScores {
  guideline: number;
  heroShot: number;
  composition: number;
  branding: number;
  mobile: number;
}

export interface AnalysisIssue {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

export interface AiAnalysisResult {
  overallScore: number;
  grade: ThumbnailGrade;
  scores: AnalysisScores | null;
  issues: AnalysisIssue[];
  suggestions: string[];
  method: 'ai' | 'rule';
}

export interface GeneratedImage {
  url: string;
  filename: string;
}

export interface GenerationWithProduct {
  id: string;
  productId: string;
  companyId: string;
  originalUrl: string | null;
  candidates: Array<{ url: string; filename: string }>;
  selectedUrl: string | null;
  status: string;
  grade: string;
  score: number;
  prompt: string | null;
  createdAt: Date;
  updatedAt: Date;
  product: { id: string; name: string; imageUrl: string | null; coupangProductId: string | null; category: string | null } | null;
}

export interface ThumbnailAnalysisItem {
  id: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  overallScore: number;
  grade: string;
  scores: Record<string, number> | null;
  issues: Array<{ type: string; severity: string; message: string }>;
  suggestions: string[];
  method: string;
  analyzed: boolean;
}

export interface ThumbnailAnalysisSummaryInternal {
  total: number;
  analyzed: number;
  unclassifiedCount: number;
  gradeDistribution: { S: number; A: number; B: number; C: number; F: number };
}

export interface ThumbnailAnalysisListResponse {
  total: number;
  analyzed: number;
  unclassifiedCount: number;
  gradeDistribution: { S: number; A: number; B: number; C: number; F: number };
  allResults: ThumbnailAnalysisItem[];
  unclassified: ThumbnailAnalysisItem[];
}

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
