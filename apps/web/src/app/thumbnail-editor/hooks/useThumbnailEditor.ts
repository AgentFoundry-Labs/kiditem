'use client';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface GenerateRequest {
  productId?: string;
  packagingImage?: string;
  productImage?: string;
  composition?: string;
  userPrompt?: string;
  pieceCount?: number;
  colorCount?: number;
  purpose: 'compliance' | 'quality';
  mode?: 'edit' | 'creative';
  sceneType?: string;
  styleType?: string;
  productDescription?: string;
}

interface GenerateResponse {
  candidates: Array<{ url: string; filename: string }>;
  generationId: string | null;
}

export function useGenerateThumbnail() {
  return useMutation({
    mutationFn: (data: GenerateRequest) =>
      apiClient.post<GenerateResponse>('/api/thumbnail-editor/generate', data),
  });
}
