import { apiClient } from '@/lib/api-client';

export async function fetchLiveNaverMarket() {
  return apiClient.post(
    '/api/sourcing/keyword-research/naver/related-keywords',
    { keyword: '문구' },
  );
}
