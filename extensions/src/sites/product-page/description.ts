/**
 * 1688 상세 설명 본문(`var offer_details={…content…}` 안의 HTML) → 설명 이미지·글(KID-360). 옛 워커의
 * `fetchDescriptionContent` 규칙: data: 이미지·아이콘·로고는 빼고 `//`는 https로, 5~2000자 글 블록만, 글은 1만 자까지.
 */
export interface DescriptionContent {
  description_images: string[];
  description_text: string;
  description_image_count: number;
}

export function parseDescriptionHtml(html: string): DescriptionContent | null {
  const content = offerDetailsContent(html) ?? html;
  const images: string[] = [];
  for (const match of content.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    const src = match[1];
    if (src.startsWith('data:') || src.includes('icon') || src.includes('logo')) continue;
    const full = src.startsWith('//') ? `https:${src}` : src;
    if (!images.includes(full)) images.push(full);
  }
  const blocks: string[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(/<(?:p|h[1-6]|li|td|th|div|span)[^>]*>([^<]{5,})<\//gi)) {
    const text = match[1].replace(/&[^;]+;/g, ' ').trim();
    if (text.length < 5 || text.length > 2_000 || seen.has(text)) continue;
    seen.add(text);
    blocks.push(text);
  }
  if (images.length === 0 && blocks.length === 0) return null;
  return { description_images: images, description_text: blocks.join('\n').slice(0, 10_000), description_image_count: images.length };
}

function offerDetailsContent(html: string): string | null {
  const marker = 'var offer_details=';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = jsonStart; index < html.length; index += 1) {
    const char = html.charAt(index);
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(html.substring(jsonStart, index + 1)) as { content?: unknown };
          return typeof parsed.content === 'string' ? parsed.content : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** 공급사 URL 정책(서버 `supplier-source-url-policy`와 같다): https, 계정·포트 없음, 1688·alibaba 호스트. */
export function allowedSupplierUrl(value: unknown): string | null {
  try {
    const parsed = new URL(String(value ?? '').trim());
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) return null;
    if (!['1688.com', 'alibaba.com'].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return null;
    parsed.hostname = host;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}
