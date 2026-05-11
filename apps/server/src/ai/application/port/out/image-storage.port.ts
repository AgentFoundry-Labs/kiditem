export const IMAGE_STORAGE_PORT = Symbol('IMAGE_STORAGE_PORT');

export interface ImageStoragePort {
  save(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  extractKey(url: string): string | null;
}
