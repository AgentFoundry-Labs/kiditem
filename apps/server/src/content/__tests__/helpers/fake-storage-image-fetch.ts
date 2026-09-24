import { BadRequestException } from '@nestjs/common';
import type { ImageFetchPort } from '../../application/port/out/provider/image-fetch.port';
import { assertSupportedMime, extForMime } from '../../domain/thumbnail-image-source';

/**
 * 저장소 읽기만 바꾼 image fetch. 저장소 HTTP 는 외부 경계라 map 으로 대신하고, 형식 검사는
 * 실제 domain 규칙을 쓴다.
 */
export function fakeStorageImageFetch(storage: Map<string, { buffer: Buffer; mimeType: string }>): ImageFetchPort {
  const toBadRequest = <T>(run: () => T): T => {
    try { return run(); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : String(error)); }
  };
  return {
    fetchImage: async () => { throw new Error('public image fetch is not part of this test'); },
    fetchTrustedStorageImage: async (url) => {
      const image = storage.get(url);
      if (!image) throw new BadRequestException(`storage image missing: ${url}`);
      return { ...image, storageKey: null };
    },
    assertSupportedMime: (mimeType) => toBadRequest(() => assertSupportedMime(mimeType)),
    extForMime: (mimeType) => toBadRequest(() => extForMime(mimeType)),
  };
}
