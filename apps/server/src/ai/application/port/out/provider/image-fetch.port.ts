export const IMAGE_FETCH_PORT = Symbol('IMAGE_FETCH_PORT');

export interface FetchedImage {
  buffer: Buffer;
  mimeType: string;
  storageKey: string | null;
}

export interface ImageFetchPort {
  fetchImage(rawUrl: string): Promise<FetchedImage>;
  fetchTrustedStorageImage(rawUrl: string): Promise<FetchedImage>;
  assertSupportedMime(mimeType: string): void;
  extForMime(mimeType: string): string;
}
