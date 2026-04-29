import { isIP } from 'node:net';

/**
 * Pure URL / MIME guards for thumbnail image fetching.
 *
 * These helpers intentionally have no Nest, Prisma, or storage dependency so
 * the same SSRF posture (loopback + private IPv4 + IPv6 ULA/link-local +
 * IPv4-mapped IPv6) and the MIME allowlist can be exercised from any caller
 * (`ThumbnailImageFetcherService`, `ThumbnailWingService` data-URL
 * materialization, future thumbnail-image consumers).
 */

export const MAX_FETCH_BYTES = 10 * 1024 * 1024;
export const MAX_REDIRECTS = 4;
export const FETCH_TIMEOUT_MS = 15_000;

export const ALLOWED_THUMBNAIL_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface ParsedDataImageUrl {
  mimeType: string;
  base64: string;
}

export class ThumbnailImageSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThumbnailImageSourceError';
  }
}

const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;

export function parseDataImageUrl(source: string): ParsedDataImageUrl | null {
  const match = source.match(DATA_URL_PATTERN);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

export function assertSupportedMime(mimeType: string): void {
  if (!ALLOWED_THUMBNAIL_MIME_TO_EXT[mimeType]) {
    throw new ThumbnailImageSourceError(`unsupported mime type: ${mimeType}`);
  }
}

export function extForMime(mimeType: string): string {
  const ext = ALLOWED_THUMBNAIL_MIME_TO_EXT[mimeType];
  if (!ext) throw new ThumbnailImageSourceError(`unsupported mime type: ${mimeType}`);
  return ext;
}

export function assertHttpUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ThumbnailImageSourceError('invalid image url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ThumbnailImageSourceError('image url protocol must be http(s)');
  }
}

export function assertPublicHttpUrl(raw: string): void {
  assertHttpUrl(raw);
  const parsed = new URL(raw);
  const rawHost = parsed.hostname.toLowerCase();
  let host = rawHost;
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  const zoneIdx = host.indexOf('%');
  if (zoneIdx !== -1) host = host.slice(0, zoneIdx);
  if (host === 'localhost' || host === '') {
    throw new ThumbnailImageSourceError('image url host not allowed');
  }

  const ipKind = isIP(host);
  if (ipKind === 0) return;
  if (ipKind === 4) {
    if (isPrivateIPv4(host)) throw new ThumbnailImageSourceError('image url host not allowed');
    return;
  }
  const embeddedV4 = extractEmbeddedIPv4(host);
  if (embeddedV4) {
    if (isPrivateIPv4(embeddedV4))
      throw new ThumbnailImageSourceError('image url host not allowed');
    return;
  }
  const blocked6 =
    host === '::1' ||
    host === '::' ||
    /^fe[89ab][0-9a-f]?:/.test(host) ||
    /^fc[0-9a-f]{2}:/.test(host) ||
    /^fd[0-9a-f]{2}:/.test(host);
  if (blocked6) throw new ThumbnailImageSourceError('image url host not allowed');
}

function extractEmbeddedIPv4(host: string): string | null {
  const mapText = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  if (mapText && isIP(mapText[1]) === 4) return mapText[1];
  const compatText = /^::(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  if (compatText && isIP(compatText[1]) === 4) return compatText[1];
  const decodeHex = (hi: string, lo: string): string => {
    const h = parseInt(hi, 16);
    const l = parseInt(lo, 16);
    return `${(h >> 8) & 0xff}.${h & 0xff}.${(l >> 8) & 0xff}.${l & 0xff}`;
  };
  const mapHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (mapHex) return decodeHex(mapHex[1], mapHex[2]);
  const compatHex = /^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (compatHex) return decodeHex(compatHex[1], compatHex[2]);
  return null;
}

function isPrivateIPv4(ip: string): boolean {
  return (
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^0\./.test(ip) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)
  );
}
