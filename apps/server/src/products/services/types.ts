import type { Product, Company, Inventory, ProfitLoss, MasterProduct, MasterInventory } from '@prisma/client';
import type { ImageSpec, ImageSpecIssue } from '@kiditem/shared';

// ── Thumbnail types ──

export type ThumbnailGrade = 'S' | 'A' | 'B' | 'C' | 'F';

export type ComplianceGrade = 'PASS' | 'WARN' | 'FAIL';

export interface ComplianceScores {
  violations: {
    background_not_white: boolean;
    has_text: boolean;
    has_extra_logo: boolean;
    has_discount_text: boolean;
    has_freebie_display: boolean;
    has_overlay_effects: boolean;
    has_gradient_background: boolean;
    has_background_objects: boolean;
    product_fill_low: boolean;
    not_center_aligned: boolean;
    product_cropped: boolean;
    excessive_editing: boolean;
  };
  confidence: Record<string, number>;
  quality: {
    estimatedFillPercent: number;
    centerOffsetPercent: number;
    aspectRatioValid: boolean;
  };
  violationCount: number;
}

export interface AnalysisScores {
  heroShot: number;
  composition: number;
  branding: number;
  mobile: number;
  differentiation: number;
}

export type { ImageSpec, ImageSpecIssue };

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
  complianceGrade: ComplianceGrade | null;
  complianceScores: ComplianceScores | null;
}

export interface GeneratedImage {
  url: string;
  filename: string;
}

export interface EditAnalysisResult {
  complianceGrade: string;
  complianceScores: Record<string, unknown> | null;
  overallScore: number;
  grade: string;
}

export interface GenerationWithProduct {
  id: string;
  productId: string;
  companyId: string;
  originalUrl: string | null;
  candidates: Array<{ url: string; filename: string }>;
  selectedUrl: string | null;
  status: string;
  phase: string | null;
  grade: string;
  score: number;
  prompt: string | null;
  method: string;
  editAnalysis: EditAnalysisResult | null;
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
  qualityAnalyzed: boolean;
  complianceAnalyzed: boolean;
  complianceGrade?: string;
  complianceScores?: Record<string, unknown> | null;
  imageSpec?: ImageSpec | null;
  createdAt?: string;
  ctr?: number | null;
}

export interface ThumbnailAnalysisSummaryInternal {
  total: number;
  analyzed: number;
  partialCount: number;
  unclassifiedCount: number;
  gradeDistribution: { S: number; A: number; B: number; C: number; F: number };
  complianceDistribution: { PASS: number; WARN: number; FAIL: number };
}

export interface ThumbnailAnalysisListResponse {
  total: number;
  analyzed: number;
  partialCount: number;
  unclassifiedCount: number;
  gradeDistribution: { S: number; A: number; B: number; C: number; F: number };
  complianceDistribution: { PASS: number; WARN: number; FAIL: number };
  allResults: ThumbnailAnalysisItem[];
  unclassified: ThumbnailAnalysisItem[];
}

export interface ThumbnailTrackingRecord {
  id: string;
  productId: string;
  productName: string;
  generationId: string;
  originalGrade: string;
  originalScore: number;
  appliedAt: string;
  daysElapsed: number;
  status: string;
  ctrBefore: number | null;
  ctrAfter: number | null;
  ctrChange: number | null;
  reviewsBefore: number | null;
  reviewsAfter: number | null;
  salesBefore: number | null;
  salesAfter: number | null;
}

/** Product creation payload — superset of CreateProductBodyDto (allows optional legacy fields) */
export interface CreateProductInput {
  name: string;
  companyId: string;
  category?: string;
  sellPrice?: number;
  costPrice?: number;
  commissionRate?: number;
  shippingCost?: number;
  status?: string;
  abcGrade?: string;
  adTier?: string;
  currentStock?: number;
  leadTimeDays?: number;
  sku?: string;
}

export interface UpdateMetricsInput {
  ctrBefore?: number;
  ctrAfter?: number;
  reviewsBefore?: number;
  reviewsAfter?: number;
  salesBefore?: number;
  salesAfter?: number;
  status?: string;
}

export interface ThumbnailTrackingListResponse {
  items: ThumbnailTrackingRecord[];
  total: number;
  page: number;
  limit: number;
}

/** Product with relations loaded via `include: { company, inventory, masterProduct }` */
export type ProductWithRelations = Product & {
  company?: Company | null;
  inventory?: Inventory | null;
  masterProduct?: (MasterProduct & { inventory?: MasterInventory | null }) | null;
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
  netProfit?: number;
  profitRate?: number;
  costCoverage?: number;
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
