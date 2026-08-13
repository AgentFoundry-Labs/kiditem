import { apiClient } from '@/lib/api-client';

export type EntrySourceKey =
  | 'supply_1688_new'
  | 'keyword_trend'
  | 'coupang_competitor'
  | 'coupang_rising';

export type EntryRecommendationGrade = 'A' | 'B' | 'C' | 'WATCH';

export interface EntryRecommendationComponents {
  margin: number;
  demand: number;
  competition: number;
  momentum: number;
  supplier: number;
}

export type EntryInterestTier = 'exact' | 'related';
export type EntryInterestOrigin = 'saved' | 'seed';

export interface EntryInterestMatch {
  tier: EntryInterestTier;
  keywords: string[];
  origins: EntryInterestOrigin[];
  /** 걸린 모든 키워드와 각각의 등급. 집계는 이걸 기준으로 한다. */
  matches: Array<{ keyword: string; tier: EntryInterestTier }>;
}

/** `demand_only` = 수요는 있는데 1688 공급 후보만 없음 → 그 키워드로 수집을 돌리면 됨. */
export type EntryInterestState = 'candidates' | 'demand_only' | 'no_signal';

export interface EntryInterestKeywordStatus {
  keyword: string;
  /** 같은 키워드가 저장 관심어이면서 수집 시드일 수 있어 배열이다. */
  origins: EntryInterestOrigin[];
  exactCount: number;
  relatedCount: number;
  state: EntryInterestState;
  demand: {
    boardLabel: string | null;
    boardRank: number | null;
    risingScore: number | null;
    monthlySearchVolume: number | null;
  } | null;
}

export interface EntryRecommendation {
  id: string;
  rank: number;
  keyword: string | null;
  isNewKeyword: boolean;
  title: string;
  imageUrl: string | null;
  overseasMall: string;
  sourceUrl: string | null;
  overseasPriceKrw: number | null;
  overseasPriceCny: number | null;
  salePriceKrw: number | null;
  shippingLabel: string;
  rating: number | null;
  tags: string[];
  minOrderQuantity: number | null;
  estimatedMarginRate: number | null;
  estimatedProfitKrw: number | null;
  supplierName: string | null;
  coupang: {
    productId: string | null;
    productName: string | null;
    salePrice: number | null;
    reviews: number | null;
  } | null;
  score: number;
  grade: EntryRecommendationGrade;
  components: EntryRecommendationComponents;
  reasons: string[];
  risks: string[];
  contributingSources: EntrySourceKey[];
  /** 관심 키워드 매칭. 점수에는 반영되지 않고 분류/정렬에만 쓰인다. */
  interest: EntryInterestMatch | null;
}

export interface EntrySourceStatus {
  key: EntrySourceKey;
  label: string;
  rowCount: number;
  businessDate: string | null;
  staleDays: number | null;
}

export interface EntryRecommendationResult {
  items: EntryRecommendation[];
  sources: EntrySourceStatus[];
  interestKeywords: EntryInterestKeywordStatus[];
  dataGaps: string[];
}

export type SourcingAssistantAnswerMode = 'generated' | 'retrieval_only';

export interface SourcingAssistantCitation {
  index: number;
  title: string;
  sourceScope: string;
  sourceDate: string | null;
  matchedTerms: string[];
}

export interface SourcingAssistantAnswer {
  mode: SourcingAssistantAnswerMode;
  text: string;
  citations: SourcingAssistantCitation[];
  documentCount: number;
  runtime: 'claude' | 'codex' | null;
  model: string | null;
  degradedReason: string | null;
  degradedCode: string | null;
  conversationId: string | null;
}

/**
 * 경로가 `/api/sourcing/entry/*` 인 이유: `/api/sourcing/:id` 가 후보 상세를 잡고 있어
 * 한 세그먼트 경로를 쓰면 후보 ID 로 해석된다.
 */
export function fetchEntryRecommendations(limit = 50): Promise<EntryRecommendationResult> {
  return apiClient.get<EntryRecommendationResult>(
    `/api/sourcing/entry/recommendations?limit=${encodeURIComponent(String(limit))}`,
  );
}

export function askSourcingAssistant(input: {
  question: string;
  visibleContext?: string;
  conversationId?: string;
}): Promise<SourcingAssistantAnswer> {
  return apiClient.post<SourcingAssistantAnswer>('/api/sourcing/entry/assistant-ask', input);
}
