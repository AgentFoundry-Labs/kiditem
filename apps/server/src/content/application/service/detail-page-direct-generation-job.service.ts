import { Inject, Injectable, Optional } from '@nestjs/common';
import { KiditemExternalError } from '@kiditem/shared/errors';
import {
  DetailPageGenerateDirectInputSchema,
  type DetailPageGenerateDirectInput,
} from '../../domain/direct-generation';
import {
  AI_DIRECT_JOB_WAKE_PORT,
  type AiDirectJobRequest,
  type AiDirectJobWakePort,
} from '../port/out/runtime';
import type { AiDirectJobModels } from '../../domain/direct-job/ai-direct-job.schema';

/** 상세 생성 job. 생성 페이지 트랜잭션 안에서 `prepare`되고(저장소가 이 요청을 받는다), 커밋 뒤 워커를 깨운다. */
@Injectable()
export class DetailPageDirectGenerationJobService {
  constructor(
    @Optional()
    @Inject(AI_DIRECT_JOB_WAKE_PORT)
    private worker: AiDirectJobWakePort | null,
  ) {}

  attachWakePort(worker: AiDirectJobWakePort): void {
    this.worker = worker;
  }

  prepareGenerate(input: {
    payload: DetailPageGenerateDirectInput | Record<string, unknown>;
    models: AiDirectJobModels;
  }): AiDirectJobRequest {
    const parsed = DetailPageGenerateDirectInputSchema.parse(input.payload);
    if (!('text' in input.models) || !('vision' in input.models)) {
      throw new KiditemExternalError('CONTENT_MODEL_NOT_CONFIGURED', { details: { reason: 'DETAIL_PAGE_MODELS_MISSING' } });
    }
    return {
      jobType: 'detail_page_generate',
      payload: {
        jobType: 'detail_page_generate',
        models: input.models,
        input: parsed,
      },
    };
  }

  wake(): void {
    this.worker?.wake();
  }
}
