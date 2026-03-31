import { API_BASE } from './api';
import { apiClient } from './api-client';
import { ApiError } from './api-error';

export type ProductStatus = 'DRAFT' | 'PROCESSING' | 'LISTED' | 'DISCONTINUED';

export interface ProductListItem {
  id: string;
  name: string;
  status: ProductStatus;
  source_platform: string;
  source_url: string | null;
  thumbnail_url: string | null;
  price_krw: number | null;
  cost_cny: number | null;
  image_count: number;
  is_processed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductListResponse {
  items: ProductListItem[];
  total: number;
}

export interface ProductDetailResponse {
  id: string;
  name: string;
  status: ProductStatus;
  source_platform: string;
  source_url: string | null;
  thumbnail_url: string | null;
  price_krw: number | null;
  cost_cny: number | null;
  image_count: number;
  is_processed: boolean;
  raw_data: Record<string, unknown> | null;
  processed_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface StatusResponse {
  id: string;
  status: ProductStatus;
  is_processed: boolean;
  error?: string;
}

export interface ScrapeUrlResponse {
  ok: boolean;
  message: string;
  product_id: string | null;
}

const PRODUCTS_BASE = `${API_BASE}/api/products`;
const SOURCING_BASE = `${API_BASE}/api/sourcing`;

export const productsApi = {
  async list(params?: {
    page?: number;
    limit?: number;
    status?: string;
    platform?: string;
  }): Promise<ProductListResponse> {
    const qs = new URLSearchParams({
      page: String(params?.page || 1),
      limit: String(params?.limit || 50),
    });
    if (params?.platform) qs.set('platform', params.platform);
    const res = await fetch(`${SOURCING_BASE}/extension/products?${qs}`);
    const data = await res.json() as { items: any[]; total: number; page: number; limit: number };
    const items: ProductListItem[] = data.items.map((p: any) => {
      const rawData = p.rawData || {};
      const images = rawData.images || [];
      return {
        id: p.id,
        name: p.name || rawData.title || '',
        status: (p.status || 'DRAFT').toUpperCase() as ProductStatus,
        source_platform: p.sourcePlatform || rawData.source_platform || '',
        source_url: p.sourceUrl || rawData.source_url || null,
        thumbnail_url: p.thumbnailUrl || images[0] || null,
        price_krw: p.sellPrice || null,
        cost_cny: p.costCny ? Number(p.costCny) : (rawData.price ? parseFloat(rawData.price) : null),
        image_count: images.length,
        is_processed: p.processedData != null,
        created_at: p.createdAt || '',
        updated_at: p.updatedAt || '',
      };
    });
    return { items, total: data.total };
  },

  async getDetail(id: string): Promise<ProductDetailResponse> {
    const res = await fetch(`${PRODUCTS_BASE}/${id}`);
    if (!res.ok) {
      let detail = `API error: ${res.status}`;
      try {
        const body = await res.json();
        detail = typeof body.message === 'string' ? body.message : body.detail ?? detail;
      } catch { /* text body or empty */ }
      throw new ApiError(res.status, null, detail);
    }
    const p = await res.json();
    const rawData = p.rawData || p.raw_data || {};
    const images = rawData.images || [];
    return {
      id: p.id,
      name: p.name || rawData.title || '',
      status: (p.status || 'DRAFT').toUpperCase() as ProductStatus,
      source_platform: p.sourcePlatform || rawData.source_platform || '',
      source_url: p.sourceUrl || rawData.source_url || null,
      thumbnail_url: p.thumbnailUrl || images[0] || null,
      price_krw: p.sellPrice || null,
      cost_cny: p.costCny ? Number(p.costCny) : (rawData.price ? parseFloat(rawData.price) : null),
      image_count: images.length,
      is_processed: p.processedData != null,
      raw_data: rawData,
      processed_data: p.processedData || p.processed_data || null,
      created_at: p.createdAt || '',
      updated_at: p.updatedAt || '',
    };
  },

  async delete(id: string): Promise<{ ok: boolean }> {
    return apiClient.delete<{ ok: boolean }>(`/api/products/${id}`);
  },

  async process(
    id: string,
    opts?: { generation_mode?: string }
  ): Promise<{ ok: boolean; message: string }> {
    await apiClient.post<any>('/api/agent-tasks', {
      agentType: 'content',
      input: { productId: id, ...(opts || {}) },
    });
    return { ok: true, message: 'AI 가공 작업이 시작되었습니다.' };
  },

  async cancel(id: string): Promise<{ ok: boolean }> {
    return { ok: true };
  },

  async status(id: string): Promise<StatusResponse> {
    const detail = await this.getDetail(id);
    return {
      id: detail.id,
      status: detail.status,
      is_processed: detail.is_processed,
    };
  },

  async loadSample(): Promise<{ ok: boolean; message: string }> {
    return apiClient.post<{ ok: boolean; message: string }>(`/api/products/sample`);
  },
};

export const sourcingApi = {
  async scrapeUrl(url: string): Promise<ScrapeUrlResponse> {
    return apiClient.post<ScrapeUrlResponse>(`/api/sourcing/scrape-url`, { url });
  },
};
