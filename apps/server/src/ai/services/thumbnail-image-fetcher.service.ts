import { isIP } from 'node:net';
import { BadRequestException, Injectable } from '@nestjs/common';
import { StorageService } from '../../common/storage/storage.service';

export const MAX_FETCH_BYTES = 10 * 1024 * 1024;
export const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 15_000;

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

interface FetchedThumbnailImage {
  buffer: Buffer;
  mimeType: string;
  storageKey: string | null;
}

interface FetchOptions {
  /** allow URLs that resolve to an internal StorageService key (own-storage). */
  allowOwnStorage?: boolean;
}

/**
 * Shared fetcher for thumbnail-related image URLs.
 *
 * Combines bounded redirects, public-URL guarding (rejects localhost / private
 * IPv4 / link-local / IPv6 mapped private), MIME allowlist, and max-size
 * enforcement. The same posture used to be inlined inside
 * ThumbnailEditorAiService; centralizing it lets ThumbnailVisionAiService
 * reuse it and lets us add SSRF regression tests once.
 *
 * Own-storage URLs (those whose origin matches StorageService.publicUrl) are
 * allowed past the public-URL check when the caller opts in via
 * `allowOwnStorage: true`. This keeps internal MinIO/S3 endpoints reachable
 * during dev without opening a generic localhost fetch.
 */
@Injectable()
export class ThumbnailImageFetcherService {
  constructor(private readonly storage: StorageService) {}

  async fetchImage(
    rawUrl: string,
    opts: FetchOptions = {},
  ): Promise<FetchedThumbnailImage> {
    let url = rawUrl;
    const initialOwnKey = this.storage.extractKey(url);
    for (let redirectCount = 0; redirectCount < MAX_REDIRECTS; redirectCount++) {
      const ownKey = this.storage.extractKey(url);
      if (opts.allowOwnStorage && ownKey) {
        this.assertHttpUrl(url);
      } else {
        this.assertPublicHttpUrl(url);
      }
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new BadRequestException('image url redirect missing location');
        url = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) {
        throw new BadRequestException(`image fetch failed: ${response.status}`);
      }
      const mimeType = (response.headers.get('content-type') ?? 'image/jpeg')
        .split(';')[0]
        .trim()
        .toLowerCase();
      this.assertSupportedMime(mimeType);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length > MAX_FETCH_BYTES) {
        throw new BadRequestException('image too large');
      }
      return { buffer, mimeType, storageKey: initialOwnKey ?? this.storage.extractKey(url) };
    }
    throw new BadRequestException('image url redirected too many times');
  }

  async fetchTrustedStorageImage(rawUrl: string): Promise<FetchedThumbnailImage> {
    return this.fetchImage(rawUrl, { allowOwnStorage: true });
  }

  assertSupportedMime(mimeType: string): void {
    if (!ALLOWED_MIME_TO_EXT[mimeType]) {
      throw new BadRequestException(`unsupported mime type: ${mimeType}`);
    }
  }

  extForMime(mimeType: string): string {
    const ext = ALLOWED_MIME_TO_EXT[mimeType];
    if (!ext) throw new BadRequestException(`unsupported mime type: ${mimeType}`);
    return ext;
  }

  private assertHttpUrl(raw: string): void {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new BadRequestException('invalid image url');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('image url protocol must be http(s)');
    }
  }

  private assertPublicHttpUrl(raw: string): void {
    this.assertHttpUrl(raw);
    const parsed = new URL(raw);
    const rawHost = parsed.hostname.toLowerCase();
    let host = rawHost;
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
    const zoneIdx = host.indexOf('%');
    if (zoneIdx !== -1) host = host.slice(0, zoneIdx);
    if (host === 'localhost' || host === '') {
      throw new BadRequestException('image url host not allowed');
    }

    const ipKind = isIP(host);
    if (ipKind === 0) return;
    if (ipKind === 4) {
      if (this.isPrivateIPv4(host)) throw new BadRequestException('image url host not allowed');
      return;
    }
    const embeddedV4 = this.extractEmbeddedIPv4(host);
    if (embeddedV4) {
      if (this.isPrivateIPv4(embeddedV4))
        throw new BadRequestException('image url host not allowed');
      return;
    }
    const blocked6 =
      host === '::1' ||
      host === '::' ||
      /^fe[89ab][0-9a-f]?:/.test(host) ||
      /^fc[0-9a-f]{2}:/.test(host) ||
      /^fd[0-9a-f]{2}:/.test(host);
    if (blocked6) throw new BadRequestException('image url host not allowed');
  }

  private extractEmbeddedIPv4(host: string): string | null {
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

  private isPrivateIPv4(ip: string): boolean {
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
}
