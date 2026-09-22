
/**
 * 판매상품 사진 옮기기(ADR-0014) — 순수 함수.
 *
 * 사방넷을 해지하면 사방넷 서버(pic.sabangnet.co.kr)의 대표·추가·상세 사진이
 * 사라진다. 허용된 원본만 우리 저장소로 복사하고, 판매상품의 사진 주소와 상세
 * HTML 참조를 바꾼다. 저장 위치는 원래 주소에서 정해지므로 같은 주소를 몇 번
 * 처리해도 같은 key를 쓴다.
 */

const MIRRORED_IMAGE_HOSTS = new Set(['pic.sabangnet.co.kr']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);

export interface PendingMirrorImage {
  url: string;
  /** Unsupported external URLs are reported as pending but never fetched. */
  key: string | null;
  reason?: string;
}

export interface SalesProductImageSnapshot {
  code: string | null;
  imageUrls: readonly string[];
  detailHtml?: string | null;
  extraDetailHtml?: readonly (string | null)[];
}

function normalizeImageUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
}

function parseUrl(url: string): URL | null {
  const normalized = normalizeImageUrl(url);
  if (!normalized) return null;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function isAllowedImageHost(url: URL): boolean {
  return url.protocol === 'https:'
    && url.hostname.toLowerCase() === 'pic.sabangnet.co.kr'
    && url.port === ''
    && url.username === ''
    && url.password === '';
}

function imageExtension(url: URL): string | null {
  const extension = url.pathname.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(extension) ? extension : null;
}

/** 옮길 수 있는 사방넷 사진 주소인가. HTTP·다른 호스트는 허용하지 않는다. */
export function isMirrorableImageUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== null && isAllowedImageHost(parsed) && imageExtension(parsed) !== null;
}

/**
 * 원래 주소 → 우리 저장소 위치. 옮길 수 없는 주소는 null이다.
 * query string은 같은 원본 변형을 구분해야 하므로 key hash에 포함한다.
 */
export function mirroredImageKey(organizationId: string, sourceUrl: string, sha256: (value: string) => string): string | null {
  const parsed = parseUrl(sourceUrl);
  if (!parsed || !isAllowedImageHost(parsed)) return null;
  const extension = imageExtension(parsed);
  if (!extension) return null;
  const hash = sha256(parsed.href).slice(0, 40);
  return `sales-products/${organizationId}/images/${hash}.${extension === 'jpeg' ? 'jpg' : extension}`;
}

/** 상세 HTML의 img/source 태그에서 src·srcset 후보를 나온 순서대로 읽는다. */
export function detailImageUrls(html: string | null): string[] {
  const urls: string[] = [];
  for (const tag of (html ?? '').matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const attributes = tag[0];
    for (const match of attributes.matchAll(/(?:^|\s)(src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      const name = match[1]!.toLowerCase();
      const value = match[2] ?? match[3] ?? match[4] ?? '';
      const candidates = name === 'srcset' ? srcsetUrls(value) : [value.trim()];
      for (const url of candidates) if (url && !urls.includes(url)) urls.push(url);
    }
  }
  return urls;
}

function srcsetUrls(value: string): string[] {
  return value.split(',').flatMap((candidate) => {
    const match = /^\s*(\S+)(?:\s+.*)?$/.exec(candidate);
    return match?.[1] ? [match[1]] : [];
  });
}

export function imageReferenceUrls(product: SalesProductImageSnapshot): readonly string[] {
  return [
    ...product.imageUrls,
    ...detailImageUrls(product.detailHtml ?? null),
    ...(product.extraDetailHtml ?? []).flatMap((html) => detailImageUrls(html)),
  ];
}

export function normalizeImageReferenceUrl(url: string): string | null {
  const parsed = parseUrl(url);
  return parsed?.href ?? normalizeImageUrl(url);
}

function isHttpImageUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed?.protocol === 'http:' || parsed?.protocol === 'https:';
}

function unsupportedReason(url: string): string | null {
  const parsed = parseUrl(url);
  if (!parsed || !isHttpImageUrl(url)) return null;
  if (isAllowedImageHost(parsed) && imageExtension(parsed) === null) return '지원하지 않는 사방넷 이미지 형식';
  if (!isAllowedImageHost(parsed)) return '지원하지 않는 외부 이미지 주소';
  return '허용되지 않은 이미지 주소';
}

/**
 * 아직 옮기지 않은 사진과 지원되지 않아 완료로 표시하면 안 되는 외부 사진을
 * 상품 코드·참조 순으로 반환한다. 같은 주소는 한 번만 반환한다.
 */
export function pendingMirrorImages(
  organizationId: string,
  products: readonly SalesProductImageSnapshot[],
  sha256: (value: string) => string,
  options: { isOwnedUrl?: (url: string) => boolean } = {},
): PendingMirrorImage[] {
  const seen = new Set<string>();
  const pending: PendingMirrorImage[] = [];
  for (const product of [...products].sort((left, right) => (left.code ?? '').localeCompare(right.code ?? ''))) {
    for (const rawUrl of imageReferenceUrls(product)) {
      const url = normalizeImageReferenceUrl(rawUrl);
      if (!url || seen.has(url) || options.isOwnedUrl?.(url)) continue;
      seen.add(url);
      const key = mirroredImageKey(organizationId, url, sha256);
      if (key) pending.push({ url, key });
      else {
        const reason = unsupportedReason(url);
        if (reason) pending.push({ url, key: null, reason });
      }
    }
  }
  return pending;
}

/** 사방넷 엑셀을 다시 가져올 때 이미 저장소에 있는 사진 주소를 보존한다. */
export function preferMirroredImageUrls(input: {
  incoming: readonly string[];
  current: readonly string[];
  mirroredUrl: (sourceUrl: string) => string | null;
}): string[] {
  const current = new Set(input.current);
  return input.incoming.map((url) => {
    const mirrored = input.mirroredUrl(url);
    return mirrored && current.has(mirrored) ? mirrored : url;
  });
}

function replacementFor(
  rawUrl: string,
  replacements: ReadonlyMap<string, string>,
): string | null {
  const canonical = normalizeImageReferenceUrl(rawUrl);
  return (canonical && replacements.get(canonical)) ?? replacements.get(rawUrl.trim()) ?? null;
}

/** 대표·추가 이미지 배열의 성공한 참조만 바꾼다. */
export function rewriteImageUrls(
  urls: readonly string[],
  replacements: ReadonlyMap<string, string>,
): string[] {
  return urls.map((url) => replacementFor(url, replacements) ?? url);
}

function rewriteSrcset(value: string, replacements: ReadonlyMap<string, string>): string {
  return value.split(',').map((candidate) => {
    const match = /^(\s*)(\S+)([\s\S]*)$/.exec(candidate);
    if (!match) return candidate;
    const replacement = replacementFor(match[2]!, replacements);
    return replacement ? `${match[1]}${replacement}${match[3]}` : candidate;
  }).join(',');
}

/** 상세 HTML의 src·srcset에서 성공한 참조만 바꾼다. 태그·공백·따옴표는 보존한다. */
export function rewriteImageHtml(
  html: string | null,
  replacements: ReadonlyMap<string, string>,
): string | null {
  if (html === null) return null;
  return html.replace(/<(?:img|source)\b[^>]*>/gi, (tag) => tag.replace(
    /((?:^|\s))(src|srcset)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (full, prefix: string, name: string, equals: string, doubleQuoted?: string, singleQuoted?: string, unquoted?: string) => {
      const value = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
      const rewritten = name.toLowerCase() === 'srcset'
        ? rewriteSrcset(value, replacements)
        : replacementFor(value, replacements) ?? value;
      if (rewritten === value) return full;
      const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
      return `${prefix}${name}${equals}${quote}${rewritten}${quote}`;
    },
  ));
}
