import { API_BASE } from '@/lib/api';

export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/generated-thumbnails/')) return `${API_BASE}${url}`;
  return url;
}

/**
 * `ProductCard` 는 성능상 `http(s)` prefix 만 렌더하고 `data:` URL 은 placeholder 로 떨어뜨림
 * (Gemini 반환 2MB+ base64 로 대량 리스트 렌더 저하 방지).
 * 여러 후보 URL 중 실제로 카드에 표시 가능한 첫 값을 선택 — http/https 우선, 모두 실패 시 null.
 */
export function pickDisplayableImageUrl(...candidates: (string | null | undefined)[]): string | null {
  for (const u of candidates) {
    if (u && (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('/generated-thumbnails/'))) {
      return u;
    }
  }
  return null;
}
