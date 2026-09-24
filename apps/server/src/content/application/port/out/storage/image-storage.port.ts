export const IMAGE_STORAGE_PORT = Symbol('IMAGE_STORAGE_PORT');

export interface ImageStoragePort {
  save(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  copy(fromKey: string, toKey: string): Promise<string>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
  extractKey(url: string): string | null;
  createPresignedPut(input: {
    key: string;
    contentType: 'image/jpeg';
    expiresInSeconds: number;
    metadata: Record<string, string>;
  }): Promise<{
    uploadUrl: string;
    headers: Record<string, string>;
    expiresAt: Date;
    imageUrl: string;
  }>;
  inspectJpeg(input: { key: string; maxByteLength: number }): Promise<{
    contentType: string;
    byteLength: number;
    pixelWidth: number;
    pixelHeight: number;
    sha256: string;
    metadata: Record<string, string>;
  }>;
}
