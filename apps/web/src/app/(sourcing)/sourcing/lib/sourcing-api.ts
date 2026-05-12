import { apiClient } from '@/lib/api-client';
import type { SourcingCandidateStatus } from '@kiditem/shared/sourcing';

/**
 * Sourcing list/detail entity — `SourcingCandidate` row mapped for UI use.
 *
 * Backed by `GET /api/sourcing/extension/products` (list, `status='sourced'`
 * only) and `GET /api/sourcing/:id` (detail, any status). Phase 7 (#192)
 * replaced the legacy `pipelineStep` shape with the 3-state candidate status
 * machine (`sourced` | `promoted` | `rejected`).
 */
export interface SourcedProduct {
  id: string;
  organizationId: string;
  sourceUrl: string | null;
  sourcePlatform: string;
  name: string;
  description: string;
  category: string | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  costCny: number | null;
  status: SourcingCandidateStatus;
  promotedMasterId: string | null;
  rejectedAt: string | null;
  rejectedReason: string | null;
  triggeredByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convenience predicate — only `'sourced'` rows poll for changes (Phase 7,
 * #192). Promoted/rejected candidates are terminal from the UI's perspective.
 */
export function isInProgress(status: SourcingCandidateStatus | undefined | null): boolean {
  return status === 'sourced';
}

interface ProductListResponse {
  items: SourcedProduct[];
  total: number;
}

export type SourcingSort = 'newest' | 'oldest' | 'name_asc';

export interface ProductDetailResponse {
  id: string;
  name: string;
  status: SourcingCandidateStatus;
  promotedMasterId: string | null;
  sourcePlatform: string;
  source_url: string | null;
  thumbnail_url: string | null;
  cost_cny: number | null;
  image_count: number;
  raw_data: Record<string, unknown> | null;
  processed_data: Record<string, unknown> | null;
  image_urls: string[];
  created_at: string;
  updated_at: string;
}

interface ScrapeUrlResponse {
  ok: boolean;
  message: string;
  product_id: string | null;
}

function normalizeImageUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    return null;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['url', 'src', 'imageUrl', 'image_url', 'fullPathImageURI', 'fullPathImageUrl']) {
      const url = normalizeImageUrl(obj[key]);
      if (url) return url;
    }
  }
  return null;
}

function collectImageUrls(...sources: unknown[]): string[] {
  const urls: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const url = normalizeImageUrl(value);
    if (url) urls.push(url);
  };
  sources.forEach(visit);
  return [...new Set(urls)];
}

function rawImageCandidates(rawData: Record<string, unknown>): string[] {
  return collectImageUrls(
    rawData.images,
    rawData.imageUrls,
    rawData.image_urls,
    rawData.mainImages,
    rawData.main_images,
    rawData.mainImage,
    rawData.main_image,
    rawData.offerImgList,
    rawData.description_images,
    rawData.detail_images,
    rawData.thumbnails,
  );
}

function rawDataWithImageFallback(
  rawData: Record<string, unknown>,
  imageUrls: string[],
): Record<string, unknown> {
  if (imageUrls.length === 0 || rawImageCandidates(rawData).length > 0) return rawData;
  return {
    ...rawData,
    images: imageUrls,
    imageUrls,
    image_urls: imageUrls,
  };
}

function imageUrlFingerprint(url: string): string {
  try {
    return decodeURIComponent(url).toLowerCase().replace(/[?#].*$/, '');
  } catch {
    return url.toLowerCase().replace(/[?#].*$/, '');
  }
}

function scoreThumbnailCandidate(url: string, index: number, explicitUrl?: string | null): number {
  const fingerprint = imageUrlFingerprint(url);
  let score = 1000 - (index * 12);

  if (explicitUrl && fingerprint === imageUrlFingerprint(explicitUrl)) score += 35;
  if (index > 0 && index <= 4) score += 70;
  if (/thumb|thumbnail|대표|main|cover|hero/.test(fingerprint)) score += 60;
  if (/single|product|item|goods|front|mainimage|standalone/.test(fingerprint)) score += 90;
  if (/detail|desc|description|상세|size|사이즈|spec|스펙/.test(fingerprint)) score -= 180;
  if (/box|package|packaging|carton|박스|상자|포장|barcode|bar_code|바코드|kc|quality|label|warning|safety|품질|표시|인증|주의/.test(fingerprint)) score -= 700;

  return score;
}

export function selectBestThumbnailImage(
  rawData: Record<string, unknown> | null | undefined,
  imageUrls: string[],
  explicitUrl?: string | null,
): string | null {
  const raw = rawData ?? {};
  const candidates = collectImageUrls(
    raw.representativeImageUrl,
    raw.representative_image_url,
    raw.bestProductImageUrl,
    raw.best_product_image_url,
    raw.primaryProductImageUrl,
    raw.primary_product_image_url,
    raw.mainImage,
    raw.main_image,
    raw.mainImages,
    raw.main_images,
    raw.imageUrl,
    raw.image_url,
    raw.images,
    raw.imageUrls,
    raw.image_urls,
    raw.offerImgList,
    imageUrls,
    explicitUrl,
    raw.thumbnailUrl,
    raw.thumbnail_url,
  );

  if (candidates.length === 0) return null;

  return candidates
    .map((url, index) => ({ url, score: scoreThumbnailCandidate(url, index, explicitUrl) }))
    .sort((a, b) => b.score - a.score)[0]?.url ?? null;
}

/** Coerces backend Decimal/string `costCny` into a plain number. */
function coerceCostCny(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export const productsApi = {
  async list(params?: {
    page?: number;
    limit?: number;
    platform?: string;
    sort?: SourcingSort;
  }): Promise<ProductListResponse> {
    const qs = new URLSearchParams({
      page: String(params?.page || 1),
      limit: String(params?.limit || 50),
    });
    if (params?.platform) qs.set('platform', params.platform);
    if (params?.sort) qs.set('sort', params.sort);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await apiClient.get<{ items: any[]; total: number; page: number; limit: number }>(`/api/sourcing/extension/products?${qs}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: SourcedProduct[] = data.items.map((p: any) => {
      const rawData = (p.rawData as Record<string, unknown>) || {};
      const images = collectImageUrls(
        rawImageCandidates(rawData),
        p.imageUrl,
        p.thumbnailUrl,
      );
      const thumbnailUrl = selectBestThumbnailImage(rawData, images, p.thumbnailUrl || p.imageUrl || null);
      // Phase 7 (#192): rows are SourcingCandidate. Status is the 3-state
      // candidate machine; list endpoint filters to `status='sourced'` so this
      // mapping is mostly a TS narrowing exercise.
      return {
        id: p.id,
        organizationId: p.organizationId,
        sourceUrl: p.sourceUrl ?? null,
        sourcePlatform: p.sourcePlatform || (rawData.source_platform as string) || '',
        name: p.name || (rawData.title as string) || '',
        description: p.description ?? '',
        category: p.category ?? null,
        thumbnailUrl,
        imageUrl: p.imageUrl ?? null,
        costCny: coerceCostCny(p.costCny) ?? (typeof rawData.price === 'string' ? parseFloat(rawData.price) || null : null),
        status: (p.status ?? 'sourced') as SourcingCandidateStatus,
        promotedMasterId: p.promotedMasterId ?? null,
        rejectedAt: p.rejectedAt ?? null,
        rejectedReason: p.rejectedReason ?? null,
        triggeredByUserId: p.triggeredByUserId ?? null,
        createdAt: p.createdAt || '',
        updatedAt: p.updatedAt || '',
      };
    });
    return { items, total: data.total };
  },

  async getDetail(id: string): Promise<ProductDetailResponse> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = await apiClient.get<any>(`/api/sourcing/${id}`);
    const rawData = (p.rawData as Record<string, unknown>) || {};
    // Detail endpoint includes images[] (CandidateImage rows). Combine with raw
    // candidates so the UI sees the full set without depending on Prisma
    // ordering quirks.
    const candidateImageUrls = Array.isArray(p.images)
      ? (p.images
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((img: any) => (typeof img?.url === 'string' ? img.url : null))
          .filter((u: string | null): u is string => !!u))
      : [];
    const images = collectImageUrls(
      candidateImageUrls,
      rawImageCandidates(rawData),
      p.imageUrl,
      p.thumbnailUrl,
    );
    const hydratedRawData = rawDataWithImageFallback(rawData, images);
    const thumbnailUrl = selectBestThumbnailImage(hydratedRawData, images, p.thumbnailUrl || p.imageUrl || null);
    return {
      id: p.id,
      name: p.name || (rawData.title as string) || '',
      status: (p.status ?? 'sourced') as SourcingCandidateStatus,
      promotedMasterId: p.promotedMasterId ?? null,
      sourcePlatform: p.sourcePlatform || (rawData.source_platform as string) || '',
      source_url: p.sourceUrl ?? null,
      thumbnail_url: thumbnailUrl,
      cost_cny: coerceCostCny(p.costCny) ?? (typeof rawData.price === 'string' ? parseFloat(rawData.price) || null : null),
      image_count: images.length,
      raw_data: hydratedRawData,
      processed_data: null,
      image_urls: images,
      created_at: p.createdAt || '',
      updated_at: p.updatedAt || '',
    };
  },

  async delete(id: string): Promise<{ ok: boolean }> {
    return apiClient.delete<{ ok: boolean }>(`/api/products/masters/${id}`);
  },
};

export const sourcingApi = {
  async scrapeUrl(url: string): Promise<ScrapeUrlResponse> {
    return apiClient.post<ScrapeUrlResponse>(`/api/sourcing/scrape-url`, { url });
  },
};

/**
 * Promote/reject inputs for `POST /api/sourcing/candidates/:id/{promote,reject}`.
 * Mirrors `PromoteCandidateBodyDto` and `RejectCandidateBodyDto` on the
 * server side.
 */
export interface PromoteCandidateInput {
  options: Array<{ optionName: string; legacyCode?: string; barcode?: string }>;
  skipPostPromotionHooks?: boolean;
}

export interface PromoteCandidateResponse {
  masterId: string;
}

export interface RejectCandidateResponse {
  ok: true;
}

/**
 * Sourcing candidate promotion/rejection helpers — wraps Phase 3 use cases
 * `POST /api/sourcing/candidates/:id/promote` and `.../reject`.
 */
export const candidatesApi = {
  promote: (id: string, body: PromoteCandidateInput) =>
    apiClient.post<PromoteCandidateResponse>(`/api/sourcing/candidates/${id}/promote`, body),
  reject: (id: string, reason?: string) =>
    apiClient.post<RejectCandidateResponse>(`/api/sourcing/candidates/${id}/reject`, { reason }),
};
