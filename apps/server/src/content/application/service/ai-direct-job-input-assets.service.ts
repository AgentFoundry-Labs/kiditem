import { Inject, Injectable } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import {
  MAX_FETCH_BYTES,
  parseDataImageUrl,
} from '../../domain/thumbnail-image-source';
import {
  IMAGE_FETCH_PORT,
  type ImageFetchPort,
} from '../port/out/provider/image-fetch.port';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../port/out/storage/image-storage.port';
import type { ImageEditDirectGenerationPayload } from './image-edit-direct-generation-job.service';

@Injectable()
export class AiDirectJobInputAssetsService {
  constructor(
    @Inject(IMAGE_FETCH_PORT)
    private readonly imageFetcher: ImageFetchPort,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly imageStorage: ImageStoragePort,
  ) {}

  async persistImageEditInputs(input: {
    organizationId: string;
    jobId: string;
    payload: ImageEditDirectGenerationPayload;
  }): Promise<ImageEditDirectGenerationPayload> {
    let index = 0;
    const persist = async (source: string): Promise<string> => {
      const currentIndex = index;
      index += 1;
      if (this.imageStorage.extractKey(source)) return source;

      const dataImage = parseDataImageUrl(source);
      let buffer: Buffer;
      let mimeType: string;
      if (dataImage) {
        mimeType = dataImage.mimeType.toLowerCase();
        this.imageFetcher.assertSupportedMime(mimeType);
        buffer = Buffer.from(dataImage.base64, 'base64');
        if (buffer.length === 0) {
          throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'IMAGE_DATA_EMPTY' }, message: '이미지 파일이 비어 있습니다. 다른 이미지로 다시 시도해 주세요.' });
        }
        if (buffer.length > MAX_FETCH_BYTES) {
          throw new KiditemInvalidValueError('CONTENT_IMAGE_TOO_LARGE');
        }
      } else {
        const fetched = await this.imageFetcher.fetchImage(source);
        buffer = fetched.buffer;
        mimeType = fetched.mimeType;
      }

      const extension = this.imageFetcher.extForMime(mimeType);
      return this.imageStorage.save(
        `ai-job-inputs/${input.organizationId}/${input.jobId}/${currentIndex}.${extension}`,
        buffer,
        mimeType,
      );
    };

    return {
      ...input.payload,
      ...(input.payload.image_url
        ? { image_url: await persist(input.payload.image_url) }
        : {}),
      ...(input.payload.image_urls
        ? {
            image_urls: await Promise.all(
              input.payload.image_urls.map((source) => persist(source)),
            ),
          }
        : {}),
    };
  }
}
