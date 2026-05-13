import { apiClient } from '@/lib/api-client';

export interface ProductContentCardItem {
  generationId: string;
  productId: string;
  productCode: string;
  productName: string;
  title: string;
  subtitle: string | null;
  templateId: 'kids-playful' | 'bold-vertical' | string;
  status: 'completed' | 'processing' | 'failed' | 'cancelled' | string;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  isTemporaryProduct: boolean;
  editedHtmlSavedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductContentCardsResponse {
  items: ProductContentCardItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ProductContentWorkProductItem {
  id: string;
  productId: string | null;
  templateId: string;
  productName: string;
  imageUrls: string[];
  processedImages: Record<string, string>;
  imageProcessingStatus: string;
  imageProcessingError: string | null;
  createdAt: string;
}

export interface ProductContentAssetItem {
  id: string;
  productId: string | null;
  generationId: string | null;
  url: string;
  assetType: string;
  sourceType: string;
  role: string | null;
  label: string | null;
  sortOrder: number;
  metadata: unknown;
  product: { id: string; code: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductContentAssetsResponse {
  items: ProductContentAssetItem[];
  total: number;
  page: number;
  limit: number;
}

export const productContentApi = {
  listCards(params: {
    page?: number;
    limit?: number;
    productId?: string | null;
  } = {}): Promise<ProductContentCardsResponse> {
    const qs = new URLSearchParams({
      page: String(params.page ?? 1),
      limit: String(params.limit ?? 20),
    });
    if (params.productId) qs.set('productId', params.productId);
    return apiClient.get<ProductContentCardsResponse>(`/api/products/content/cards?${qs}`);
  },
  listWorkProducts(): Promise<ProductContentWorkProductItem[]> {
    return apiClient.get<ProductContentWorkProductItem[]>('/api/ai/detail-page');
  },
  listAssets(params: {
    page?: number;
    limit?: number;
    productId?: string | null;
  } = {}): Promise<ProductContentAssetsResponse> {
    const qs = new URLSearchParams({
      page: String(params.page ?? 1),
      limit: String(params.limit ?? 24),
    });
    if (params.productId) qs.set('productId', params.productId);
    return apiClient.get<ProductContentAssetsResponse>(`/api/ai/content-assets?${qs}`);
  },
};
