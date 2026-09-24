export const IMAGE_FETCH_PORT = Symbol('IMAGE_FETCH_PORT');

export interface FetchedImage {
  buffer: Buffer;
  mimeType: string;
  storageKey: string | null;
}

export interface ImageFetchOptions {
  signal?: AbortSignal;
}

export interface ImageFetchPort {
  fetchImage(rawUrl: string, options?: ImageFetchOptions): Promise<FetchedImage>;
  fetchTrustedStorageImage(rawUrl: string, options?: ImageFetchOptions): Promise<FetchedImage>;
  assertSupportedMime(mimeType: string): void;
  extForMime(mimeType: string): string;
}
