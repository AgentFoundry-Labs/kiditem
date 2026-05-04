export const IMAGE_FETCH_PORT = Symbol('IMAGE_FETCH_PORT');

export interface FetchedImage {
  buffer: Buffer;
  mimeType: string;
  storageKey: string | null;
}

export interface ImageFetchPort {
  fetchImage(rawUrl: string): Promise<FetchedImage>;
  extForMime(mimeType: string): string;
}
