import { apiClient } from '@/lib/api-client';

export type SourcingMarketModelGrade = 'A' | 'B' | 'C' | 'WATCH' | 'EXCLUDE';
export type SourcingMarketModelDecision = 'recommend' | 'watch' | 'exclude';

export interface SourcingMarketModelCandidate {
  id: string;
  rank: number;
  productId: string;
  itemId: string | null;
  vendorItemId: string | null;
  productName: string;
  imagePath: string | null;
  primaryKeyword: string;
  keywords: string[];
  score: number;
  grade: SourcingMarketModelGrade;
  decision: SourcingMarketModelDecision;
  components: {
    marketReaction: number;
    newProductReaction: number;
    interestFit: number;
    marginPotential: number;
    supplyReadiness: number;
    existingRecommendation: number;
    riskPenalty: number;
  };
  metrics: {
    salesLast3d: number;
    salesLast28d: number;
    viewsLast3d: number;
    reviews: number;
    salePrice: number | null;
    conversionRate: number;
    lowReviewSalesPower: number;
    reviewDelta: number | null;
    salesDelta: number | null;
  };
  reasons: string[];
  risks: string[];
  modelTags: string[];
  sourceSnapshotId: string;
  sourceDate: string;
}

export interface SourcingMarketModelResponse {
  generatedAt: string;
  result: {
    candidates: SourcingMarketModelCandidate[];
    stats: {
      candidateCount: number;
      sourceSnapshotCount: number;
      recommendedCount: number;
      watchCount: number;
      excludedCount: number;
      averageScore: number;
      topKeyword: string | null;
    };
    model: {
      pipeline: 'coupang_first_market_reaction';
      version: 1;
      generatorVersion: string;
      weights: Record<string, number>;
    };
  };
}

export function runSourcingMarketModel(input: {
  days?: number;
  limit?: number;
} = {}): Promise<SourcingMarketModelResponse> {
  return apiClient.post<SourcingMarketModelResponse>('/api/sourcing/market-model/run', input);
}

export function getLatestSourcingMarketModel(input: {
  days?: number;
  limit?: number;
} = {}): Promise<SourcingMarketModelResponse> {
  return apiClient.post<SourcingMarketModelResponse>('/api/sourcing/market-model/latest', input);
}
