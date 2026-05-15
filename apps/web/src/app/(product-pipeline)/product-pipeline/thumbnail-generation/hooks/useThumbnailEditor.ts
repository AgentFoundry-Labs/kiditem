'use client';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface GenerateRequest {
  productId?: string;
  productName?: string;
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

/**
 * `/api/thumbnail-editor/generate` returns one of two shapes:
 *
 * - **Async (product-bound)** — `{ candidates: [], generationId, status: 'pending' }`.
 *   The Agent OS pipeline will fill candidates onto the
 *   `ThumbnailGeneration` row. The caller should switch to polling
 *   (`useGenerationList`) and wait for `status === 'succeeded'`.
 * - **Sync (no productId / standalone preview)** — `{ candidates, generationId: null }`.
 *   Candidates are immediately usable.
 */
interface GenerateResponse {
  candidates: Array<{ url: string; filename: string }>;
  generationId: string | null;
  status?: 'pending';
}

export function useGenerateThumbnail() {
  return useMutation({
    mutationFn: (data: GenerateRequest) =>
      apiClient.post<GenerateResponse>('/api/thumbnail-editor/generate', data),
  });
}
