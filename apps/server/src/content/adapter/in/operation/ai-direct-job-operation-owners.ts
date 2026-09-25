import { Inject, Injectable } from '@nestjs/common';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import type {
  JsonObject,
  OperationFailedContext,
  OperationFinalizeContext,
  OperationOwnerPort,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  AI_DIRECT_JOB_RESULT_CHUNK,
  aiDirectJobLockKey,
  aiDirectJobPlan,
  aiDirectJobTypeOfKind,
  validateAiDirectJobResult,
  type AiDirectJob,
  type AiDirectJobKind,
} from '../../../domain/direct-job/ai-direct-job-operation';
import { AiDirectJobProcessorService } from '../../../application/service/ai-direct-job-processor.service';
import {
  AI_DIRECT_JOB_RUNTIME_CONFIG,
  type AiDirectJobRuntimeConfig,
} from '../../../application/service/ai-direct-job.config';

/**
 * AI 생성 job kind의 owner 포트(ADR-0025, KID-358). `plan`은 생성 기록이 준 원천·입력 봉투를 검증해
 * `resource:<jobType>:<원천 id>` 하나를 잠그고, `finalize`는 워커가 받아 둔 결과 청크를 sink로 반영하며,
 * `onFailed`는 재시도가 남지 않은 실패를 생성 기록에 적는다. sink는 지금처럼 자기 트랜잭션에서 쓴다.
 */
@Injectable()
abstract class AiDirectJobOperationOwner implements OperationOwnerPort {
  abstract readonly kind: AiDirectJobKind;
  /** 워커 임대. `AI_DIRECT_JOB_LEASE_MS`(기본 60초)를 그대로 쓴다. */
  readonly leaseMs: number;

  constructor(
    private readonly processor: AiDirectJobProcessorService,
    @Inject(AI_DIRECT_JOB_RUNTIME_CONFIG) config: AiDirectJobRuntimeConfig,
  ) {
    this.leaseMs = config.leaseMs;
  }

  async plan(scope: JsonObject): Promise<OperationPlanResult> {
    const plan = aiDirectJobPlan(this.kind, scope);
    return { plan, lockKeys: [aiDirectJobLockKey(plan.payload.jobType, plan.sourceResourceId)] };
  }

  async finalize(chunks: OperationStagedChunk[], _window: unknown, context: OperationFinalizeContext) {
    const job = this.job(context, 0);
    const saved = chunks.find((chunk) => chunk.chunkKind === AI_DIRECT_JOB_RESULT_CHUNK);
    const result = validateAiDirectJobResult(job.jobType, saved?.payload[0]);
    await this.processor.project(job, result);
    return { result: result as JsonObject };
  }

  async onFailed(context: OperationFailedContext) {
    await this.processor.projectFailure(this.job(context, context.attempts), {
      errorCode: context.errorCode,
      errorMessage: context.errorMessage ?? '',
      retryable: false,
    });
  }

  private job(context: OperationFinalizeContext, attempts: number): AiDirectJob {
    const plan = aiDirectJobPlan(this.kind, context.plan);
    return {
      id: context.operationId,
      organizationId: context.organizationId,
      jobType: aiDirectJobTypeOfKind(this.kind),
      sourceResourceId: plan.sourceResourceId,
      payload: plan.payload,
      attempts,
      maxAttempts: attempts,
    };
  }
}

@Injectable()
@OperationOwner()
export class ThumbnailGenerateOperationOwner extends AiDirectJobOperationOwner {
  readonly kind = 'content.thumbnail_generate';
}

@Injectable()
@OperationOwner()
export class ThumbnailReeditOperationOwner extends AiDirectJobOperationOwner {
  readonly kind = 'content.thumbnail_reedit';
}

@Injectable()
@OperationOwner()
export class DetailPageGenerateOperationOwner extends AiDirectJobOperationOwner {
  readonly kind = 'content.detail_page_generate';
}

@Injectable()
@OperationOwner()
export class ImageEditOperationOwner extends AiDirectJobOperationOwner {
  readonly kind = 'content.image_edit';
}

export const AI_DIRECT_JOB_OPERATION_OWNERS = [
  ThumbnailGenerateOperationOwner,
  ThumbnailReeditOperationOwner,
  DetailPageGenerateOperationOwner,
  ImageEditOperationOwner,
] as const;
