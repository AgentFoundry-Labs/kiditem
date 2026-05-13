export const IMAGE_STORAGE_PORT = Symbol('IMAGE_STORAGE_PORT');

export interface ImageStoragePort {
  save(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  copy(fromKey: string, toKey: string): Promise<string>;
  delete(key: string): Promise<void>;
  extractKey(url: string): string | null;
}
