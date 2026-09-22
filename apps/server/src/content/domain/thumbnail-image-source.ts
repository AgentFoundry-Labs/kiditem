/**
 * Thumbnail-specific MIME / data-URL guards + fetch limit constants.
 *
 * URL safety (loopback / private IPv4 / IPv6 ULA / link-local / IPv4-mapped /
 * cloud metadata) is centralized in
 * `apps/server/src/common/security/public-url.ts` and re-exported below so
 * existing `domain/thumbnail-image-source` imports keep resolving. The
 * products domain shares the exact same policy via that common module — do
 * not fork the host blocklist here.
 */
export {
  assertHttpUrl,
  assertPublicHttpUrl,
} from '../../common/security/public-url';

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
