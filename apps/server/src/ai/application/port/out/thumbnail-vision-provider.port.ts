import type { ImageBytes } from '../../../domain/thumbnail-image-spec';
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
  callVisionForJsonArray<T>(
    contents: ThumbnailVisionContents,
    errorCode: string,
    signal?: AbortSignal,
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
