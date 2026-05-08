import { BadRequestException, Injectable } from '@nestjs/common';
import {
  assertHttpUrl,
  assertPublicHttpUrl,
  assertSupportedMime as assertSupportedMimeImpl,
  extForMime as extForMimeImpl,
  FETCH_TIMEOUT_MS,
  MAX_FETCH_BYTES,
  MAX_REDIRECTS,
  ThumbnailImageSourceError,
} from '../../../domain/thumbnail-image-source';
import { PublicUrlError } from '../../../../common/security/public-url';
import { StorageService } from '../../../../common/storage/storage.service';

export { MAX_FETCH_BYTES, MAX_REDIRECTS } from '../../../domain/thumbnail-image-source';

function asBadRequest(error: unknown): never {
  // URL guards now throw `PublicUrlError` (shared with products domain);
  // MIME / data-URL guards still throw `ThumbnailImageSourceError`. Both must
  // surface as 400 BadRequest at the HTTP boundary.
  if (error instanceof ThumbnailImageSourceError || error instanceof PublicUrlError) {
    throw new BadRequestException(error.message);
  }
  throw error;
}

function assertHttpUrlForRequest(raw: string): void {
  try {
    assertHttpUrl(raw);
  } catch (error) {
    asBadRequest(error);
  }
}

function assertPublicHttpUrlForRequest(raw: string): void {
  try {
    assertPublicHttpUrl(raw);
  } catch (error) {
    asBadRequest(error);
  }
}

function assertSupportedMimeForRequest(mimeType: string): void {
  try {
    assertSupportedMimeImpl(mimeType);
  } catch (error) {
    asBadRequest(error);
  }
}

function extForMimeForRequest(mimeType: string): string {
  try {
    return extForMimeImpl(mimeType);
  } catch (error) {
    asBadRequest(error);
  }
}

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
 * enforcement. The pure URL/MIME guards live in
 * `domain/thumbnail-image-source.ts` so other consumers (Wing data-URL
 * materialization, future AI image pipelines) can reuse the same posture
 * without instantiating Nest DI.
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
        assertHttpUrlForRequest(url);
      } else {
        assertPublicHttpUrlForRequest(url);
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
      assertSupportedMimeForRequest(mimeType);
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
    assertSupportedMimeForRequest(mimeType);
  }

  extForMime(mimeType: string): string {
    return extForMimeForRequest(mimeType);
  }
}
