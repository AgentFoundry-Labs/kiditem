import { apiClient } from '@/lib/api-client';

export interface Search1688KeywordStatusResponse {
  configured: boolean;
  baseUrl: string;
}

export function get1688KeywordSearchStatus(): Promise<Search1688KeywordStatusResponse> {
  return apiClient.get<Search1688KeywordStatusResponse>('/api/sourcing/1688/keyword-search/status');
}
