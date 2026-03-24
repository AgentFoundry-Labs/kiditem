import { API_BASE } from './api';

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

const PRODUCTS_BASE = `${API_BASE}/api/v1/products`;
const SOURCING_BASE = `${API_BASE}/api/v1/sourcing`;

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    let message: string;
    try {
      const parsed = JSON.parse(body) as { detail?: string };
      message = parsed.detail ?? body;
    } catch {
      message = body;
    }
    throw new Error(`API ${res.status}: ${message}`);
  }
  return res.json() as Promise<T>;
}

export const productsApi = {
  async list(params?: {
    skip?: number;
    limit?: number;
    status?: string;
    platform?: string;
  }): Promise<ProductListResponse> {
    const qs = new URLSearchParams();
    if (params?.skip != null) qs.set('skip', String(params.skip));
    if (params?.limit != null) qs.set('limit', String(params.limit));
    if (params?.status) qs.set('status', params.status);
    if (params?.platform) qs.set('platform', params.platform);
    const query = qs.toString();
    const res = await fetch(`${PRODUCTS_BASE}${query ? `?${query}` : ''}`);
    return handleResponse<ProductListResponse>(res);
  },

  async getDetail(id: string): Promise<ProductDetailResponse> {
    const res = await fetch(`${PRODUCTS_BASE}/${id}`);
    return handleResponse<ProductDetailResponse>(res);
  },

  async delete(id: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${PRODUCTS_BASE}/${id}`, { method: 'DELETE' });
    return handleResponse<{ ok: boolean }>(res);
  },

  async process(
    id: string,
    opts?: { generation_mode?: 'template' | 'oneshot' }
  ): Promise<{ ok: boolean; message: string }> {
    const res = await fetch(`${PRODUCTS_BASE}/${id}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts ?? {}),
    });
    return handleResponse<{ ok: boolean; message: string }>(res);
  },

  async cancel(id: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${PRODUCTS_BASE}/${id}/cancel`, { method: 'POST' });
    return handleResponse<{ ok: boolean }>(res);
  },

  async status(id: string): Promise<StatusResponse> {
    const res = await fetch(`${PRODUCTS_BASE}/${id}/status`);
    return handleResponse<StatusResponse>(res);
  },

  async loadSample(): Promise<{ ok: boolean; message: string }> {
    const res = await fetch(`${PRODUCTS_BASE}/sample`, { method: 'POST' });
    return handleResponse<{ ok: boolean; message: string }>(res);
  },
};

export const sourcingApi = {
  async scrapeUrl(url: string): Promise<ScrapeUrlResponse> {
    const res = await fetch(`${SOURCING_BASE}/scrape-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    return handleResponse<ScrapeUrlResponse>(res);
  },
};
