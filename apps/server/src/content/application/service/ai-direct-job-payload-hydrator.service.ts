import { Inject, Injectable } from '@nestjs/common';
import {
  QueuedThumbnailDirectInputSchema,
  type QueuedThumbnailDirectInput,
} from '../../domain/direct-job/ai-direct-job.schema';
import type { ThumbnailGenerateDirectInput } from '../../domain/direct-generation';
import type { AiDirectJobRecord } from '../port/out/repository/ai-direct-job.repository.port';
import {
  IMAGE_FETCH_PORT,
  type ImageFetchPort,
} from '../port/out/provider/image-fetch.port';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../port/out/storage/image-storage.port';

@Injectable()
export class AiDirectJobPayloadHydratorService {
  constructor(
    @Inject(IMAGE_FETCH_PORT)
    private readonly imageFetcher: ImageFetchPort,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly imageStorage: ImageStoragePort,
  ) {}

  async hydrateThumbnail(
    job: AiDirectJobRecord,
    signal?: AbortSignal,
  ): Promise<ThumbnailGenerateDirectInput> {
    signal?.throwIfAborted();
    if (job.payload.jobType !== 'thumbnail_generate') {
      throw directInputNotDurable('Job is not a thumbnail generation job.');
    }
    const queued = QueuedThumbnailDirectInputSchema.parse(job.payload.input);
    const inputs = await Promise.all(
      queued.inputs.map(async (image) => {
        if (!this.imageStorage.extractKey(image.url)) {
          throw directInputNotDurable(
            `Thumbnail input is not managed storage: ${image.url}`,
          );
        }
        const fetched = await this.imageFetcher.fetchTrustedStorageImage(
          image.url,
          { signal },
        );
        return {
          ...image,
          data: fetched.buffer.toString('base64'),
          mimeType: fetched.mimeType,
          storageKey: fetched.storageKey ?? image.storageKey,
          fileSize: fetched.buffer.length,
        };
      }),
    );
    return { ...queued, inputs } as ThumbnailGenerateDirectInput;
  }
}

function directInputNotDurable(message: string): Error & { code: string } {
  return Object.assign(new Error(message), {
    code: 'direct_ai_input_not_durable',
  });
}
