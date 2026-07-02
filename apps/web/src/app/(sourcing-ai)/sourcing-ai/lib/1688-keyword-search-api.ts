import { apiClient } from '@/lib/api-client';

export interface Search1688KeywordResultItem {
  offerId: string | null;
  title: string;
  priceCny: number | null;
  sourceUrl: string;
  imageUrl: string | null;
  monthlySales: number | null;
  tradeScore: number | null;
  repurchaseRate: string | null;
  supplierName: string | null;
  score: number;
}

export interface Search1688KeywordResponse {
  keyword: string;
  page: number;
  items: Search1688KeywordResultItem[];
}

export interface Search1688KeywordStatusResponse {
  configured: boolean;
  baseUrl: string;
}

export function search1688ByKeyword(input: {
  keyword: string;
  page?: number;
  maxResults?: number;
}): Promise<Search1688KeywordResponse> {
  return apiClient.post<Search1688KeywordResponse>('/api/sourcing/1688/keyword-search', input);
}

export function get1688KeywordSearchStatus(): Promise<Search1688KeywordStatusResponse> {
  return apiClient.get<Search1688KeywordStatusResponse>('/api/sourcing/1688/keyword-search/status');
}
