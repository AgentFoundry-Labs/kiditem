'use client';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface GenerateRequest {
  productId?: string;
  productImage?: string;
  packagingImage?: string;
  supplementaryLabel?: string;
  colorImages?: string[];
  bundleImages?: string[];
  bundleLabels?: string[];
  pieceCount?: number;
  colorCount?: number;
  backgroundReference?: string;
  userPrompt?: string;
  purpose: 'compliance' | 'quality';
  mode?: 'edit' | 'creative';
  sceneType?: string;
  styleType?: string;
  productDescription?: string;
  layout?: 'auto' | 'fan' | 'arch' | 'grid' | 'stack' | 'radial';
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
