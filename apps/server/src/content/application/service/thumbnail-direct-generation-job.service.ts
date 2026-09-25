import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  ThumbnailGenerateDirectInputSchema,
  type ThumbnailGenerateDirectInput,
} from '../../domain/direct-generation';
import {
  AI_DIRECT_JOB_WAKE_PORT,
  type AiDirectJobRequest,
  type AiDirectJobWakePort,
} from '../port/out/runtime';
import {
  THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
  type ThumbnailGenerationLedgerRepositoryPort,
} from '../port/out/repository/thumbnail-generation-ledger.repository.port';
import type { AiDirectJobModels } from '../../domain/direct-job/ai-direct-job.schema';

/**
 * 썸네일 생성 · 재편집 job. 생성 job은 생성 기록 트랜잭션 안에서 `prepare`되고(원장 저장소가 이 요청을 받는다),
 * 커밋 뒤 워커를 깨운다. 재편집은 살아 있는 이전 job을 취소하고 새 job을 한 트랜잭션에서 건다.
 */
@Injectable()
export class ThumbnailDirectGenerationJobService {
  constructor(
    @Inject(THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT)
    private readonly ledger: ThumbnailGenerationLedgerRepositoryPort,
    @Optional()
    @Inject(AI_DIRECT_JOB_WAKE_PORT)
    private worker: AiDirectJobWakePort | null,
  ) {}

  attachWakePort(worker: AiDirectJobWakePort): void {
    this.worker = worker;
  }

  prepareGenerate(input: {
    payload: ThumbnailGenerateDirectInput | Record<string, unknown>;
    models: AiDirectJobModels;
  }): AiDirectJobRequest {
    const parsed = ThumbnailGenerateDirectInputSchema.parse(input.payload);
    const queuedInput = {
      ...parsed,
      inputs: parsed.inputs.map(({ data: _data, ...image }) => image),
    };
    return {
      jobType: 'thumbnail_generate',
      payload: {
        jobType: 'thumbnail_generate',
        models: { image: input.models.image },
        input: queuedInput,
      },
    };
  }

  /** 생성 기록이 커밋된 뒤 부른다. 워커가 자고 있으면 바로 claim하게 한다. */
  wake(): void {
    this.worker?.wake();
  }

  async scheduleReedit(input: {
    organizationId: string;
    generationId: string;
    purpose: 'compliance' | 'quality';
    variantKey: 'auto' | 'with-box' | 'no-box';
    models: AiDirectJobModels;
  }): Promise<{ jobId: string }> {
    const job = await this.ledger.restartReeditJob({
      organizationId: input.organizationId,
      generationId: input.generationId,
      directJob: {
        jobType: 'thumbnail_reedit',
        payload: {
          jobType: 'thumbnail_reedit',
          models: { image: input.models.image },
          input: {
            generationId: input.generationId,
            purpose: input.purpose,
            variantKey: input.variantKey,
          },
        },
      },
    });
    this.wake();
    return job;
  }
}
