import { Inject, Injectable } from '@nestjs/common';
import type { AiDirectJobModels } from '../../domain/direct-job/ai-direct-job.schema';
import {
  ThumbnailGenerateDirectInputSchema,
  type ThumbnailGenerateDirectInput,
} from '../../domain/direct-generation';
import {
  AI_DIRECT_JOB_REPOSITORY_PORT,
  type CreateAiDirectJobInput,
  type AiDirectJobRepositoryPort,
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
export class ThumbnailDirectGenerationJobService {
  constructor(
    @Inject(AI_DIRECT_JOB_REPOSITORY_PORT)
    private readonly repository: AiDirectJobRepositoryPort,
    @Inject(AI_DIRECT_JOB_WAKE_PORT)
    private readonly worker: AiDirectJobWakePort,
    @Inject(AI_DIRECT_JOB_RUNTIME_CONFIG)
    private readonly config: AiDirectJobRuntimeConfig,
  ) {}

  prepareGenerate(input: {
    payload: ThumbnailGenerateDirectInput | Record<string, unknown>;
    models: AiDirectJobModels;
  }): Omit<CreateAiDirectJobInput, 'organizationId' | 'sourceResourceId'> {
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
      status: 'held',
      scheduledFor: new Date(Date.now() + this.config.heldRecoveryMs),
    };
  }

  async release(input: { organizationId: string; jobId: string }): Promise<void> {
    const released = await this.repository.release(input);
    if (!released) {
      throw new Error(`Failed to release thumbnail AI direct job ${input.jobId}.`);
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
      jobTypes: ['thumbnail_generate', 'thumbnail_reedit'],
      reason: input.reason,
    });
  }

  async schedule(input: {
    organizationId: string;
    generationId: string;
    payload: ThumbnailGenerateDirectInput | Record<string, unknown>;
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

  async scheduleReedit(input: {
    organizationId: string;
    generationId: string;
    purpose: 'compliance' | 'quality';
    variantKey: 'auto' | 'with-box' | 'no-box';
    models: AiDirectJobModels;
  }): Promise<{ jobId: string }> {
    const job = await this.repository.restartHeldReedit({
      organizationId: input.organizationId,
      jobType: 'thumbnail_reedit',
      sourceResourceId: input.generationId,
      payload: {
        jobType: 'thumbnail_reedit',
        models: { image: input.models.image },
        input: {
          generationId: input.generationId,
          purpose: input.purpose,
          variantKey: input.variantKey,
        },
      },
      status: 'held',
      scheduledFor: new Date(Date.now() + this.config.heldRecoveryMs),
    });
    const released = await this.repository.release({
      organizationId: input.organizationId,
      jobId: job.id,
    });
    if (!released) {
      throw new Error(`Failed to release thumbnail re-edit job ${job.id}.`);
    }
    this.worker.wake();
    return { jobId: job.id };
  }
}
