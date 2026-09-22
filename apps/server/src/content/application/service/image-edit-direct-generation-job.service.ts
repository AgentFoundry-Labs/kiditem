import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  AI_DIRECT_JOB_REPOSITORY_PORT,
  type AiDirectJobRepositoryPort,
} from '../port/out/repository/ai-direct-job.repository.port';
import {
  AI_DIRECT_JOB_WAKE_PORT,
  type AiDirectJobWakePort,
} from '../port/out/runtime';
import {
  AI_DIRECT_JOB_RUNTIME_CONFIG,
  type AiDirectJobRuntimeConfig,
  resolveAiDirectJobModels,
} from './ai-direct-job.config';
import { AiDirectJobInputAssetsService } from './ai-direct-job-input-assets.service';
import { ImageEditDirectInputSchema } from '../../domain/direct-generation';

export interface ImageEditDirectGenerationPayload {
  image_url?: string;
  image_urls?: string[];
  preset: string;
  user_prompt?: string;
  productId?: string;
  contentGenerationId?: string;
}

export interface ImageEditDirectGenerationScheduleInput {
  organizationId: string;
  payload: ImageEditDirectGenerationPayload;
  triggeredByUserId: string | null;
}

export interface ImageEditDirectGenerationTaskStatus {
  taskId: string;
  status: string;
  output: unknown;
  errorCode: string | null;
  errorMessage: string | null;
}

const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

@Injectable()
export class ImageEditDirectGenerationJobService {
  constructor(
    @Inject(AI_DIRECT_JOB_REPOSITORY_PORT)
    private readonly repository: AiDirectJobRepositoryPort,
    private readonly inputAssets: AiDirectJobInputAssetsService,
    @Inject(AI_DIRECT_JOB_WAKE_PORT)
    private readonly worker: AiDirectJobWakePort,
    @Inject(AI_DIRECT_JOB_RUNTIME_CONFIG)
    private readonly config: AiDirectJobRuntimeConfig,
  ) {}

  async schedule(
    input: ImageEditDirectGenerationScheduleInput,
  ): Promise<{ taskId: string }> {
    const models = resolveAiDirectJobModels('image_edit');
    const taskId = randomUUID();
    const payload = await this.inputAssets.persistImageEditInputs({
      organizationId: input.organizationId,
      jobId: taskId,
      payload: input.payload,
    });
    const durablePayload = ImageEditDirectInputSchema.parse(payload);
    await this.repository.create({
      id: taskId,
      organizationId: input.organizationId,
      jobType: 'image_edit',
      sourceResourceId: taskId,
      payload: {
        jobType: 'image_edit',
        models: { image: models.image },
        input: durablePayload,
      },
      status: 'held',
      scheduledFor: new Date(Date.now() + this.config.heldRecoveryMs),
    });

    const released = await this.repository.release({
      organizationId: input.organizationId,
      jobId: taskId,
    });
    if (!released) {
      throw new Error(`Failed to release image-edit AI direct job ${taskId}.`);
    }
    this.worker.wake();
    return { taskId };
  }

  async getStatus(
    organizationId: string,
    taskId: string,
  ): Promise<ImageEditDirectGenerationTaskStatus | null> {
    const job = await this.repository.findById({
      organizationId,
      jobId: taskId,
    });
    if (!job) return null;
    return {
      taskId,
      status: job.status === 'projecting' ? 'succeeded' : job.status,
      output: job.result,
      errorCode: job.lastErrorCode,
      errorMessage: job.lastErrorMessage,
    };
  }

  async cancel(input: {
    organizationId: string;
    taskId: string;
    actorUserId: string | null;
    reason: string;
  }): Promise<{
    status: 'cancelled' | 'already_terminal' | 'not_found';
    jobId: string;
    preserved: boolean;
  }> {
    const existing = await this.repository.findById({
      organizationId: input.organizationId,
      jobId: input.taskId,
    });
    if (!existing) {
      return {
        status: 'not_found',
        jobId: input.taskId,
        preserved: false,
      };
    }
    if (TERMINAL_JOB_STATUSES.has(existing.status) || existing.status === 'projecting') {
      return {
        status: 'already_terminal',
        jobId: input.taskId,
        preserved: existing.status === 'succeeded' || existing.result != null,
      };
    }

    const cancelled = await this.repository.cancel({
      organizationId: input.organizationId,
      jobId: input.taskId,
      reason: input.reason,
    });
    if (!cancelled) {
      return {
        status: 'not_found',
        jobId: input.taskId,
        preserved: false,
      };
    }
    if (cancelled.status !== 'cancelled') {
      return {
        status: 'already_terminal',
        jobId: input.taskId,
        preserved: cancelled.status === 'succeeded' || cancelled.result != null,
      };
    }

    return {
      status: 'cancelled',
      jobId: input.taskId,
      preserved: false,
    };
  }
}
