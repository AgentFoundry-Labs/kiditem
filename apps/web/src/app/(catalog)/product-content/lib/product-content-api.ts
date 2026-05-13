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
};
