import { apiClient } from '@/lib/api-client';

// 내 쿠팡 상품 키워드 SERP 순위 추적(/api/ads/keyword-rank/products)의 순위 변동 요약용 최소 미러.
// 응답 전체 필드 중 홈 "상품 추적 상황"에 필요한 것만 소비한다.
export interface MyProductRankRow {
  vendorItemId: string;
  productName: string | null;
  keyword: string;
  category: string | null;
  currentSalesRank: number | null;
  previousSalesRank: number | null;
  /** 양수 = 순위 상승, 음수 = 하락. */
  rankChange: number | null;
}

export interface MyProductRankOverview {
  rows: MyProductRankRow[];
}

export function fetchMyProductRankChanges(days = 7): Promise<MyProductRankOverview> {
  return apiClient.get<MyProductRankOverview>(`/api/ads/keyword-rank/products?days=${days}`);
}
