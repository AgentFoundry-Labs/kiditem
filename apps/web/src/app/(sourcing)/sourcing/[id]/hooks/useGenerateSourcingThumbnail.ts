'use client';

import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface GenerateSourcingThumbnailRequest {
  productImage: string;
  productDescription?: string;
}

interface GenerateSourcingThumbnailResponse {
  candidates: Array<{ url: string; filename: string }>;
  generationId: string | null;
}

export function useGenerateSourcingThumbnail() {
  return useMutation({
    mutationFn: (data: GenerateSourcingThumbnailRequest) =>
      apiClient.post<GenerateSourcingThumbnailResponse>('/api/thumbnail-editor/generate', {
        // productId intentionally omitted: sourcing preview images must not enter
        // product thumbnail analysis/generation queues.
        productImage: data.productImage,
        productDescription: data.productDescription,
        purpose: 'compliance',
        mode: 'edit',
      }),
  });
}
