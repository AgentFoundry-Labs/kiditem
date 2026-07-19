import { Inject, Injectable } from '@nestjs/common';
import type { AiDirectJobModels } from '../../domain/direct-job/ai-direct-job.schema';
import {
  DetailPageGenerateDirectInputSchema,
  type DetailPageGenerateDirectInput,
} from '../../domain/direct-generation';
import {
  AI_DIRECT_JOB_REPOSITORY_PORT,
  type AiDirectJobRepositoryPort,
  type CreateAiDirectJobInput,
} from '../port/out/repository/ai-direct-job.repository.port';
import {
  AI_DIRECT_JOB_WAKE_PORT,
  type AiDirectJobWakePort,
} from '../port/out/runtime';
import {
  AI_DIRECT_JOB_RUNTIME_CONFIG,
  type AiDirectJobRuntimeConfig,
} from './ai-direct-job.config';

@Injectable()
export class DetailPageDirectGenerationJobService {
  constructor(
    @Inject(AI_DIRECT_JOB_REPOSITORY_PORT)
    private readonly repository: AiDirectJobRepositoryPort,
    @Inject(AI_DIRECT_JOB_WAKE_PORT)
    private readonly worker: AiDirectJobWakePort,
    @Inject(AI_DIRECT_JOB_RUNTIME_CONFIG)
    private readonly config: AiDirectJobRuntimeConfig,
  ) {}

  prepareGenerate(input: {
    payload: DetailPageGenerateDirectInput | Record<string, unknown>;
    models: AiDirectJobModels;
  }): Omit<CreateAiDirectJobInput, 'organizationId' | 'sourceResourceId'> {
    const parsed = DetailPageGenerateDirectInputSchema.parse(input.payload);
    if (!('text' in input.models) || !('vision' in input.models)) {
      throw Object.assign(
        new Error('Detail page direct job requires image, text, and vision models.'),
        { code: 'model_required' },
      );
    }
    return {
      jobType: 'detail_page_generate',
      payload: {
        jobType: 'detail_page_generate',
        models: input.models,
        input: parsed,
      },
      status: 'held',
      scheduledFor: new Date(Date.now() + this.config.heldRecoveryMs),
    };
  }

  async release(input: { organizationId: string; jobId: string }): Promise<void> {
    const released = await this.repository.release(input);
    if (!released) {
      throw new Error(`Failed to release detail-page AI direct job ${input.jobId}.`);
    }
    this.worker.wake();
  }

  async cancelHeld(input: { organizationId: string; jobId: string; reason: string }): Promise<void> {
    await this.repository.cancel(input);
  }

  async cancelByGeneration(input: {
    organizationId: string;
    generationId: string;
    reason: string;
  }): Promise<number> {
    return this.repository.cancelBySource({
      organizationId: input.organizationId,
      sourceResourceId: input.generationId,
      jobTypes: ['detail_page_generate'],
      reason: input.reason,
    });
  }

  async schedule(input: {
    organizationId: string;
    generationId: string;
    payload: DetailPageGenerateDirectInput | Record<string, unknown>;
    models: AiDirectJobModels;
  }): Promise<{ jobId: string }> {
    const prepared = this.prepareGenerate(input);
    const job = await this.repository.create({
      ...prepared,
      organizationId: input.organizationId,
      sourceResourceId: input.generationId,
    });
    await this.release({
      organizationId: input.organizationId,
      jobId: job.id,
    });
    return { jobId: job.id };
  }
}
