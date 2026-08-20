import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export function NaverPanel() {
  return useQuery({
    queryKey: ['naver'],
    queryFn: () => apiClient.post('/api/sourcing/keyword-research/naver/related-keywords', {}),
  });
}
