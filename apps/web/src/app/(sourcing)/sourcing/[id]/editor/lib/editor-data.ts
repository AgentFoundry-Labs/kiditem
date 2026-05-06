import { API_BASE } from '@/lib/api';

export interface ProductDetail {
  name?: string | null;
  rawData: Record<string, unknown> | null;
  processedData: Record<string, unknown> | null;
  draftContent: Record<string, unknown> | null;
  pipelineStep: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  images?: Array<string | { url?: string | null }>;
  raw_data?: Record<string, unknown> | null;
  processed_data?: Record<string, unknown> | null;
}

export interface PreviewResponse {
  data: Record<string, unknown>;
  template: string | null;
  images?: string[];
}

const IMAGE_KEYS = ['images', 'description_images', 'detail_images', 'size_images'] as const;

export function extractImageUrls(data: Record<string, unknown> | null | undefined): string[] {
  if (!data) return [];
  const urls: string[] = [];
  for (const key of IMAGE_KEYS) {
    const val = data[key];
    if (Array.isArray(val)) {
      for (const v of val) {
        if (typeof v === 'string' && v) urls.push(v);
      }
    }
  }
  return urls;
}

export function collectProductImageUrls(
  images: ProductDetail['images'],
  ...fallbacks: Array<string | null | undefined>
): string[] {
  const urls: string[] = [];
  for (const image of images ?? []) {
    const url = typeof image === 'string' ? image : image?.url;
    if (typeof url === 'string' && url.trim()) urls.push(url);
  }
  for (const url of fallbacks) {
    if (typeof url === 'string' && url.trim()) urls.push(url);
  }
  return Array.from(new Set(urls));
}

export const resolveProcessedUrl = (url: string) =>
  url.startsWith('/processed/') ? `${API_BASE}${url}` : url;
