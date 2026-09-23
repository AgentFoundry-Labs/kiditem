import type { ImageBytes } from '../../../../domain/thumbnail-image-spec';
import type { FetchedImage } from './image-fetch.port';
import type { ThumbnailPromptPart } from './thumbnail-reference-images.port';

export const THUMBNAIL_VISION_PROVIDER_PORT = Symbol('THUMBNAIL_VISION_PROVIDER_PORT');

export interface ThumbnailVisionContents {
  contents: Array<{ role: 'user'; parts: ThumbnailPromptPart[] }>;
}

export interface ThumbnailVisionProviderPort {
  fetchImageBytes(imageUrl: string): Promise<ImageBytes>;
  fetchTrustedStorageImage(imageUrl: string): Promise<FetchedImage>;
  assertConfigured(): void;
  /** `options.model` 이 있으면 그 모델로 부른다(호출자가 고른 모델). 없으면 설정된 vision 모델. */
  callVisionForJsonArray<T>(
    contents: ThumbnailVisionContents,
    errorCode: string,
    signal?: AbortSignal,
    options?: { model?: string },
  ): Promise<T[]>;
  callVerifyForJsonObject<T>(
    contents: ThumbnailVisionContents,
    errorCode: string,
    signal?: AbortSignal,
  ): Promise<T>;
  callVisionForJsonText(
    contents: ThumbnailVisionContents,
    signal?: AbortSignal,
  ): Promise<string | null>;
  raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T>;
  throwIfAborted(signal?: AbortSignal): void;
}
