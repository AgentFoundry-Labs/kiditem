import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AI_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../port/out/cross-domain/operation-alert.port';
import { operationCancellationAudit } from '../../../common/operation-cancellation-audit';
import { ImageEditDirectGenerationExecutorService } from './image-edit-direct-generation-executor.service';

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
const TERMINAL_IMAGE_EDIT_STATUSES = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'skipped',
]);

@Injectable()
export class ImageEditDirectGenerationJobService {
  private readonly logger = new Logger(ImageEditDirectGenerationJobService.name);

  constructor(
    private readonly executor: ImageEditDirectGenerationExecutorService,
    @Inject(AI_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
  ) {}

  async schedule(
    input: ImageEditDirectGenerationScheduleInput,
  ): Promise<{ taskId: string }> {
    const taskId = randomUUID();
    const operationKey = this.operationKey(taskId);
    await this.operationAlerts.start({
      organizationId: input.organizationId,
      operationKey,
      type: 'image_edit',
      title: '이미지 편집 진행 중',
      sourceType: IMAGE_EDIT_JOB_SOURCE_TYPE,
      sourceId: taskId,
      actorUserId: input.triggeredByUserId,
      href: this.imageEditHref(input.payload),
      metadata: {
        executionMode: 'direct_ai',
        aiJobId: taskId,
        preset: input.payload.preset,
        productId: input.payload.productId ?? null,
        contentGenerationId: input.payload.contentGenerationId ?? null,
      },
    });

    setImmediate(() => {
      void this.process({
        organizationId: input.organizationId,
        taskId,
        operationKey,
        payload: input.payload,
      });
    });

    return { taskId };
  }

  async getStatus(
    organizationId: string,
    taskId: string,
  ): Promise<ImageEditDirectGenerationTaskStatus | null> {
    const alert = await this.operationAlerts.findByOperationKey(
      organizationId,
      this.operationKey(taskId),
    );
    if (!alert) return null;
    const metadata = asRecord(alert.metadata);
    return {
      taskId,
      status: alert.status,
      output: metadata.output ?? null,
      errorCode: typeof metadata.errorCode === 'string' ? metadata.errorCode : null,
      errorMessage:
        typeof metadata.errorMessage === 'string' ? metadata.errorMessage : null,
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
    const alert = await this.operationAlerts.findByOperationKey(
      input.organizationId,
      operationKey,
    );
    if (!alert) {
      return {
        status: 'not_found',
        jobId: input.taskId,
        operationKey: null,
        preserved: false,
      };
    }
    if (TERMINAL_IMAGE_EDIT_STATUSES.has(alert.status)) {
      return {
        status: 'already_terminal',
        jobId: input.taskId,
        operationKey,
        preserved: alert.status === 'succeeded',
      };
    }

    const cancelled = await this.operationAlerts.cancel(
      input.organizationId,
      operationKey,
      {
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
      },
    );

    if (!cancelled || cancelled.status !== 'cancelled') {
      return {
        status: 'already_terminal',
        jobId: input.taskId,
        operationKey,
        preserved: cancelled?.status === 'succeeded',
      };
    }
    return {
      status: 'cancelled',
      jobId: input.taskId,
      operationKey,
      preserved: false,
    };
  }

  private async process(input: {
    organizationId: string;
    taskId: string;
    operationKey: string;
    payload: ImageEditDirectGenerationPayload;
  }): Promise<void> {
    try {
      if (await this.isTerminal(input.organizationId, input.operationKey)) {
        return;
      }

      const model = process.env.AI_IMAGE_MODEL?.trim();
      if (!model) {
        throw Object.assign(new Error('AI_IMAGE_MODEL is required for image_edit.'), {
          code: 'model_required',
        });
      }

      const output = await this.executor.execute({
        organizationId: input.organizationId,
        model,
        input: input.payload,
        logId: input.taskId,
      });

      if (await this.isTerminal(input.organizationId, input.operationKey)) {
        return;
      }

      await this.operationAlerts.succeed(input.organizationId, input.operationKey, {
        progress: 1,
        message: '이미지 편집 완료',
        metadata: {
          output,
          imageUrl: output.image_url,
        },
      });
    } catch (error) {
      const errorCode = errorCodeOf(error);
      const errorMessage = errorMessageOf(error);
      if (await this.isTerminal(input.organizationId, input.operationKey)) {
        return;
      }
      this.logger.error(
        `image_edit direct job failed (organization=${input.organizationId}, task=${input.taskId}): ${errorMessage}`,
      );
      await this.operationAlerts.fail(input.organizationId, input.operationKey, {
        message: errorMessage,
        severity: 'error',
        metadata: {
          errorCode,
          errorMessage,
        },
      });
    }
  }

  private operationKey(taskId: string): string {
    return `image-edit:${taskId}`;
  }

  private async isTerminal(
    organizationId: string,
    operationKey: string,
  ): Promise<boolean> {
    const alert = await this.operationAlerts.findByOperationKey(
      organizationId,
      operationKey,
    );
    return Boolean(alert && TERMINAL_IMAGE_EDIT_STATUSES.has(alert.status));
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function errorCodeOf(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim()) return code;
  }
  return 'image_edit_failed';
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
