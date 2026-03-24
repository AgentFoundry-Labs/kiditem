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

const PRODUCTS_BASE = `${API_BASE}/api/products`;
const SOURCING_BASE = `${API_BASE}/api/sourcing`;

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
    const res = await fetch(`${SOURCING_BASE}/extension/products?limit=${params?.limit || 100}`);
    const raw = await res.json() as any[];
    const items: ProductListItem[] = raw.map((p: any) => {
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
    return { items, total: items.length };
  },

  async getDetail(id: string): Promise<ProductDetailResponse> {
    const res = await fetch(`${PRODUCTS_BASE}/${id}`);
    const p = await handleResponse<any>(res);
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
    const res = await fetch(`${PRODUCTS_BASE}/${id}`, { method: 'DELETE' });
    return handleResponse<{ ok: boolean }>(res);
  },

  async process(
    id: string,
    opts?: { generation_mode?: 'template' | 'oneshot' }
  ): Promise<{ ok: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/api/agent-tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentType: 'content',
        input: { productId: id, ...(opts || {}) },
      }),
    });
    await handleResponse<any>(res);
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
