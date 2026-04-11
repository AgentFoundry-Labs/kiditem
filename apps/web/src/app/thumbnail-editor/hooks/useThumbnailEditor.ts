'use client';
import { apiClient } from '@/lib/api-client';
import { useMutation } from '@tanstack/react-query';

interface GenerateRequest {
  productId?: string;
  packagingImageUrl?: string;
  productImageUrl?: string;
  composition?: string;
  purpose: 'compliance' | 'quality';
}

interface GenerateResponse {
  candidates: Array<{ url: string; filename: string }>;
}

export function useGenerateThumbnail() {
  return useMutation({
    mutationFn: (data: GenerateRequest) =>
      apiClient.post<GenerateResponse>('/api/thumbnail-editor/generate', data),
  });
}
