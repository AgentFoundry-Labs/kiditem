import { apiClient } from '@/lib/api-client';

export interface Search1688ImageResultItem {
  title: string;
  priceCny: number | null;
  sourceUrl: string;
  imageUrl: string | null;
  score: number;
}

export interface Search1688ImageResponse {
  imageUrl: string;
  convertedImageUrl: string | null;
  items: Search1688ImageResultItem[];
}

export interface Search1688ImageStatusResponse {
  configured: boolean;
  baseUrl: string;
}

export function search1688ByImage(input: {
  imageUrl: string;
  keyword?: string;
  maxResults?: number;
}): Promise<Search1688ImageResponse> {
  return apiClient.post<Search1688ImageResponse>('/api/sourcing/1688/image-search', input);
}

export function get1688ImageSearchStatus(): Promise<Search1688ImageStatusResponse> {
  return apiClient.get<Search1688ImageStatusResponse>('/api/sourcing/1688/image-search/status');
}
