import { Injectable } from '@nestjs/common';
import { KiditemError, KiditemNotFoundError } from '@kiditem/shared/errors';
import { ImageEditDirectGenerationJobService } from './image-edit-direct-generation-job.service';

/**
 * Image edit entry point.
 *
 * Image edits are human-triggered fixed AI jobs. They intentionally do not
 * create Agent OS runs; older `image_edit` rows are retired by the release
 * data migration instead of replayed through Agent OS.
 */
@Injectable()
export class ImageAiService {
  constructor(
    private readonly imageEditJobs: ImageEditDirectGenerationJobService,
  ) {}

  async createEditTask(
    params: {
      image_url?: string;
      image_urls?: string[];
      preset: string;
      user_prompt?: string;
      productId?: string;
      detailPageId?: string;
    },
    organizationId: string,
    triggeredByUserId: string | null,
  ) {
    try {
      return await this.imageEditJobs.schedule({
        organizationId,
        payload: {
          ...(params.image_url ? { image_url: params.image_url } : {}),
          ...(params.image_urls ? { image_urls: params.image_urls } : {}),
          preset: params.preset,
          user_prompt: params.user_prompt ?? '',
          ...(params.productId ? { productId: params.productId } : {}),
          ...(params.detailPageId
            ? { detailPageId: params.detailPageId }
            : {}),
        },
        triggeredByUserId,
      });
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new KiditemError('INTERNAL_ERROR', { cause: error });
    }
  }

  async getEditTask(organizationId: string, taskId: string) {
    const status = await this.imageEditJobs.getStatus(organizationId, taskId);
    if (!status) {
      throw new KiditemNotFoundError('CONTENT_NOT_FOUND', { details: { reason: 'image_edit_task' } });
    }
    return status;
  }

  cancelEditTask(
    organizationId: string,
    taskId: string,
    actorUserId: string | null,
    reason: string,
  ) {
    return this.imageEditJobs.cancel({
      organizationId,
      taskId,
      actorUserId,
      reason,
    });
  }
}
