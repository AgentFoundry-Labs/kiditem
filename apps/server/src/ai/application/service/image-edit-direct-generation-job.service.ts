import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  AI_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../port/out/cross-domain/operation-alert.port';
import {
  AI_DIRECT_JOB_REPOSITORY_PORT,
  type AiDirectJobRepositoryPort,
} from '../port/out/repository/ai-direct-job.repository.port';
import {
  AI_DIRECT_JOB_WAKE_PORT,
  type AiDirectJobWakePort,
} from '../port/out/runtime';
import { operationCancellationAudit } from '../../../common/operation-cancellation-audit';
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

const IMAGE_EDIT_JOB_SOURCE_TYPE = 'image_ai_job';
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
    @Inject(AI_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
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

    const operationKey = this.operationKey(taskId);
    try {
      await this.operationAlerts.start({
        organizationId: input.organizationId,
        operationKey,
        type: 'image_edit',
        title: '이미지 편집 진행 중',
        sourceType: IMAGE_EDIT_JOB_SOURCE_TYPE,
        sourceId: taskId,
        actorUserId: input.triggeredByUserId,
        href: this.imageEditHref(payload),
        metadata: {
          executionMode: 'direct_ai',
          aiJobId: taskId,
          preset: payload.preset,
          productId: payload.productId ?? null,
          contentGenerationId: payload.contentGenerationId ?? null,
        },
      });
    } catch (error) {
      await this.repository.failOrReschedule({
        organizationId: input.organizationId,
        jobId: taskId,
        errorCode: 'operation_alert_start_failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        retryable: false,
        retryAt: new Date(),
        now: new Date(),
      });
      throw error;
    }

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
    operationKey: string | null;
    preserved: boolean;
  }> {
    const operationKey = this.operationKey(input.taskId);
    const existing = await this.repository.findById({
      organizationId: input.organizationId,
      jobId: input.taskId,
    });
    if (!existing) {
      return {
        status: 'not_found',
        jobId: input.taskId,
        operationKey: null,
        preserved: false,
      };
    }
    if (TERMINAL_JOB_STATUSES.has(existing.status) || existing.status === 'projecting') {
      return {
        status: 'already_terminal',
        jobId: input.taskId,
        operationKey,
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
        operationKey: null,
        preserved: false,
      };
    }
    if (cancelled.status !== 'cancelled') {
      return {
        status: 'already_terminal',
        jobId: input.taskId,
        operationKey,
        preserved: cancelled.status === 'succeeded' || cancelled.result != null,
      };
    }

    await this.operationAlerts.cancel(input.organizationId, operationKey, {
      message: input.reason,
      metadata: {
        errorCode: 'user_cancelled',
        errorMessage: input.reason,
        cancel: operationCancellationAudit({
          requestedByUserId: input.actorUserId,
          reason: input.reason,
          target: { targetType: 'operation_key', operationKey },
          affected: { directAiJobIds: [input.taskId] },
          result: 'cancelled',
        }),
      },
    });
    return {
      status: 'cancelled',
      jobId: input.taskId,
      operationKey,
      preserved: false,
    };
  }

  private operationKey(taskId: string): string {
    return `image-edit:${taskId}`;
  }

  private imageEditHref(payload: {
    productId?: string;
    contentGenerationId?: string;
  }): string {
    if (payload.contentGenerationId) {
      return `/product-pipeline/detail-pages/${encodeURIComponent(payload.contentGenerationId)}/editor`;
    }
    if (payload.productId) {
      return `/product-pipeline/registered-products?masterId=${payload.productId}`;
    }
    return '/product-pipeline/registered-products?contentType=image';
  }
}
