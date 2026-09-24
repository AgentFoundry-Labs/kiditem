import { Injectable } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import {
  assertHttpUrl,
  assertSupportedMime as assertSupportedMimeImpl,
  extForMime as extForMimeImpl,
  FETCH_TIMEOUT_MS,
  MAX_FETCH_BYTES,
  MAX_REDIRECTS,
  ThumbnailImageSourceError,
} from '../../../domain/thumbnail-image-source';
import { PublicUrlError } from '../../../../common/security/public-url';
import { StorageService } from '../../../../common/storage/storage.service';
import {
  assertSafePublicImageUrl,
  publicImageDispatcher,
} from './public-image-lookup';
import { readResponseBytes } from './response-byte-reader';
import type { Agent } from 'undici';
import type { ImageFetchOptions } from '../../../application/port/out/provider/image-fetch.port';

export { MAX_FETCH_BYTES, MAX_REDIRECTS } from '../../../domain/thumbnail-image-source';

function asBadRequest(error: unknown): never {
  // URL guards now throw `PublicUrlError` (shared with products domain);
  // MIME / data-URL guards still throw `ThumbnailImageSourceError`. Both must
  // surface as 400 BadRequest at the HTTP boundary.
  if (error instanceof ThumbnailImageSourceError) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', {
      details: { reason: 'IMAGE_MIME_UNSUPPORTED' },
      message: '지원하지 않는 이미지 형식입니다. 다른 이미지로 다시 시도해 주세요.',
      cause: error,
    });
  }
  if (error instanceof PublicUrlError) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', {
      details: { reason: 'IMAGE_URL_NOT_ALLOWED' },
      message: '이 이미지 주소는 쓸 수 없습니다. 공개된 이미지 주소인지 확인해 주세요.',
      cause: error,
    });
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
  signal?: AbortSignal;
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
    opts.signal?.throwIfAborted();
    let url = rawUrl;
    const initialOwnKey = this.storage.extractKey(url);
    for (let redirectCount = 0; redirectCount < MAX_REDIRECTS; redirectCount++) {
      const ownKey = this.storage.extractKey(url);
      if (opts.allowOwnStorage && ownKey) {
        assertHttpUrlForRequest(url);
      } else {
        try {
          await assertSafePublicImageUrl(new URL(url));
        } catch (error) {
          asBadRequest(error);
        }
      }
      const requestInit: RequestInit & { dispatcher?: Agent } = {
        redirect: 'manual',
        signal: opts.signal
          ? AbortSignal.any([opts.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)])
          : AbortSignal.timeout(FETCH_TIMEOUT_MS),
      };
      if (!(opts.allowOwnStorage && ownKey)) {
        requestInit.dispatcher = publicImageDispatcher;
      }
      const response = await fetch(url, requestInit);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'IMAGE_FETCH_FAILED', step: 'redirect' }, message: '이미지를 가져오지 못했습니다. 이미지 주소를 확인해 주세요.' });
        url = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) {
        throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'IMAGE_FETCH_FAILED', providerStatus: response.status }, message: '이미지를 가져오지 못했습니다. 이미지 주소를 확인해 주세요.' });
      }
      const mimeType = (response.headers.get('content-type') ?? 'image/jpeg')
        .split(';')[0]
        .trim()
        .toLowerCase();
      assertSupportedMimeForRequest(mimeType);
      const buffer = await readResponseBytes(response, MAX_FETCH_BYTES, requestInit.signal ?? undefined);
      return { buffer, mimeType, storageKey: initialOwnKey ?? this.storage.extractKey(url) };
    }
    throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'IMAGE_FETCH_FAILED', step: 'redirect_limit' }, message: '이미지를 가져오지 못했습니다. 이미지 주소를 확인해 주세요.' });
  }

  async fetchTrustedStorageImage(
    rawUrl: string,
    options: ImageFetchOptions = {},
  ): Promise<FetchedThumbnailImage> {
    return this.fetchImage(rawUrl, { ...options, allowOwnStorage: true });
  }

  assertSupportedMime(mimeType: string): void {
    assertSupportedMimeForRequest(mimeType);
  }

  extForMime(mimeType: string): string {
    return extForMimeForRequest(mimeType);
  }
}
