'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export function useOriginalImage(productId: string | null) {
  return useQuery({
    queryKey: ['thumbnail-editor', 'original-image', productId],
    queryFn: () =>
      apiClient.get<{ dataUrl: string }>(`/api/products/${productId}/original-image-base64`),
    enabled: !!productId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
