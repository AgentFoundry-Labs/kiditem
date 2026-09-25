import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  AI_DIRECT_JOB_OPERATIONS_PORT,
  AI_DIRECT_JOB_WAKE_PORT,
  type AiDirectJobOperationsPort,
  type AiDirectJobState,
  type AiDirectJobWakePort,
} from '../port/out/runtime';
import { resolveAiDirectJobModels } from './ai-direct-job.config';
import { AiDirectJobInputAssetsService } from './ai-direct-job-input-assets.service';
import { ImageEditDirectInputSchema } from '../../domain/direct-generation';

export interface ImageEditDirectGenerationPayload {
  image_url?: string;
  image_urls?: string[];
  preset: string;
  user_prompt?: string;
  productId?: string;
  detailPageId?: string;
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

/** 화면이 읽는 상태 이름. 결과를 받아 두고 반영만 남은 job은 아직 `running`이다(결과 URL은 finish 뒤에 보인다). */
function screenStatus(state: AiDirectJobState): string {
  if (state.status === 'prepared') return 'pending';
  if (state.status === 'executing') return 'running';
  return state.status;
}

/**
 * 이미지 편집 job(`content.image_edit`). 생성 기록 없이 실행 하나가 곧 작업이고, 작업 id는 실행 id다.
 * 입력 사진은 prepare 전에 저장소로 옮긴다(그 경로의 이름표는 따로 뽑은 id).
 */
@Injectable()
export class ImageEditDirectGenerationJobService {
  constructor(
    @Inject(AI_DIRECT_JOB_OPERATIONS_PORT)
    private readonly jobs: AiDirectJobOperationsPort,
    private readonly inputAssets: AiDirectJobInputAssetsService,
    @Inject(AI_DIRECT_JOB_WAKE_PORT)
    private readonly worker: AiDirectJobWakePort,
  ) {}

  async schedule(
    input: ImageEditDirectGenerationScheduleInput,
  ): Promise<{ taskId: string }> {
    const models = resolveAiDirectJobModels('image_edit');
    const inputKey = randomUUID();
    const payload = await this.inputAssets.persistImageEditInputs({
      organizationId: input.organizationId,
      jobId: inputKey,
      payload: input.payload,
    });
    const durablePayload = ImageEditDirectInputSchema.parse(payload);
    const { jobId } = await this.jobs.prepare(undefined, {
      organizationId: input.organizationId,
      jobType: 'image_edit',
      sourceResourceId: inputKey,
      payload: {
        jobType: 'image_edit',
        models: { image: models.image },
        input: durablePayload,
      },
    });
    this.worker.wake();
    return { taskId: jobId };
  }

  async getStatus(
    organizationId: string,
    taskId: string,
  ): Promise<ImageEditDirectGenerationTaskStatus | null> {
    const job = await this.jobs.find(organizationId, taskId);
    if (!job) return null;
    return {
      taskId,
      status: screenStatus(job),
      output: job.result,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
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
    const existing = await this.jobs.find(input.organizationId, input.taskId);
    if (!existing) {
      return { status: 'not_found', jobId: input.taskId, preserved: false };
    }
    // 끝났거나 결과를 이미 받아 둔 job은 취소하지 않는다(받아 둔 결과는 곧 반영된다).
    if (isFinished(existing) || existing.resultSaved) {
      return {
        status: 'already_terminal',
        jobId: input.taskId,
        preserved: existing.status === 'succeeded' || existing.resultSaved,
      };
    }
    const cancelled = await this.jobs.cancel(input.organizationId, input.taskId);
    if (!cancelled) {
      return { status: 'not_found', jobId: input.taskId, preserved: false };
    }
    if (cancelled.status !== 'cancelled') {
      return {
        status: 'already_terminal',
        jobId: input.taskId,
        preserved: cancelled.status === 'succeeded' || cancelled.resultSaved,
      };
    }
    return { status: 'cancelled', jobId: input.taskId, preserved: false };
  }
}

function isFinished(state: AiDirectJobState): boolean {
  return state.status === 'succeeded' || state.status === 'failed' || state.status === 'cancelled';
}
