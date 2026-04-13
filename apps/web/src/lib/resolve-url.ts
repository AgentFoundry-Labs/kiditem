import { API_BASE } from '@/lib/api';

export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/generated-thumbnails/')) return `${API_BASE}${url}`;
  return url;
}
