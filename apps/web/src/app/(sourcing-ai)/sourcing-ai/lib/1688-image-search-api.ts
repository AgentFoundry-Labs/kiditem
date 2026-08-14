import { apiClient } from '@/lib/api-client';

export interface Search1688ImageStatusResponse {
  configured: boolean;
  baseUrl: string;
}

export function get1688ImageSearchStatus(): Promise<Search1688ImageStatusResponse> {
  return apiClient.get<Search1688ImageStatusResponse>('/api/sourcing/1688/image-search/status');
}
