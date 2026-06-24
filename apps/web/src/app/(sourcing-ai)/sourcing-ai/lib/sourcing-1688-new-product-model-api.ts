import { apiClient } from '@/lib/api-client';

export type Sourcing1688NewProductModelGrade = 'A' | 'B' | 'C' | 'WATCH' | 'EXCLUDE';
export type Sourcing1688NewProductModelDecision = 'order' | 'observe_3d' | 'exclude';
export type Sourcing1688NewProductMatchMethod = 'image' | 'keyword' | 'fuzzy';

export interface Sourcing1688NewProductModelCandidate {
  id: string;
  rank: number;
  offerId: string | null;
  title: string;
  imageUrl: string | null;
  sourceUrl: string;
  keyword: string | null;
  matchMethod: Sourcing1688NewProductMatchMethod;
  score: number;
  grade: Sourcing1688NewProductModelGrade;
  decision: Sourcing1688NewProductModelDecision;
  components: {
    newProductSignal: number;
    supplyQuality: number;
    coupangMatch: number;
    marketReaction: number;
    threeDayValidation: number;
    marginPotential: number;
    riskPenalty: number;
  };
  wholesale: {
    priceCny: number | null;
    monthlySales: number | null;
    tradeScore: number | null;
    repurchaseRate: string | null;
    supplierName: string | null;
    shippingFulfillmentRate: string | null;
    shippingPickupRate: string | null;
    serviceScore: number | null;
    landedCostKrw: number | null;
    estimatedProfitKrw: number | null;
    estimatedMarginRate: number | null;
    sourceDate: string;
  };
  matchedCoupang: {
    productId: string;
    productName: string;
    primaryKeyword: string;
    score: number;
    grade: string;
    salePrice: number | null;
    salesLast3d: number;
    salesLast28d: number;
    reviews: number;
    matchScore: number;
  } | null;
  reasons: string[];
  risks: string[];
  modelTags: string[];
  sourceSnapshotId: string;
  sourceDate: string;
}

export interface Sourcing1688NewProductModelResponse {
  generatedAt: string;
  result: {
    candidates: Sourcing1688NewProductModelCandidate[];
    stats: {
      candidateCount: number;
      sourceSnapshotCount: number;
      orderCount: number;
      observeCount: number;
      excludedCount: number;
      averageScore: number;
      topKeyword: string | null;
    };
    model: {
      pipeline: '1688_first_new_product_validation';
      version: 1;
      generatorVersion: string;
      weights: Record<string, number>;
    };
  };
}

export function runSourcing1688NewProductModel(input: {
  days?: number;
  limit?: number;
} = {}): Promise<Sourcing1688NewProductModelResponse> {
  return apiClient.post<Sourcing1688NewProductModelResponse>('/api/sourcing/1688-new-product-model/run', input);
}

export function getLatestSourcing1688NewProductModel(input: {
  days?: number;
  limit?: number;
} = {}): Promise<Sourcing1688NewProductModelResponse> {
  return apiClient.post<Sourcing1688NewProductModelResponse>('/api/sourcing/1688-new-product-model/latest', input);
}
