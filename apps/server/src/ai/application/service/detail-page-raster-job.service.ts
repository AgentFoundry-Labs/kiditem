import { Inject, Injectable } from '@nestjs/common';
import {
  DetailPageRasterJobOutputSchema,
  detailPageRasterJobSourceId,
  type DetailPageRasterJobOutput,
} from '../../domain/direct-job/detail-page-raster-job';
import {
  AI_DIRECT_JOB_REPOSITORY_PORT,
  type AiDirectJobRecord,
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

export type DetailPageRasterJobStatus =
  | { status: 'absent' }
  | { status: 'processing' }
  | { status: 'rendered'; output: DetailPageRasterJobOutput }
  | { status: 'failed'; message: string };

@Injectable()
export class DetailPageRasterJobService {
  constructor(
    @Inject(AI_DIRECT_JOB_REPOSITORY_PORT)
    private readonly repository: AiDirectJobRepositoryPort,
    @Inject(AI_DIRECT_JOB_WAKE_PORT)
    private readonly worker: AiDirectJobWakePort,
    @Inject(AI_DIRECT_JOB_RUNTIME_CONFIG)
    private readonly config: AiDirectJobRuntimeConfig,
  ) {}

  async statusForRevision(input: {
    organizationId: string;
    revisionId: string;
    outputWidth: number;
  }): Promise<DetailPageRasterJobStatus> {
    const job = await this.repository.findBySource({
      organizationId: input.organizationId,
      jobType: 'detail_page_rasterize',
      sourceResourceId: detailPageRasterJobSourceId(
        input.revisionId,
        input.outputWidth,
      ),
    });
    return job ? statusFromJob(job) : { status: 'absent' };
  }

  async ensureScheduled(input: {
    organizationId: string;
    revisionId: string;
    artifactId: string;
    outputWidth: number;
  }): Promise<Exclude<DetailPageRasterJobStatus, { status: 'absent' }>> {
    const sourceResourceId = detailPageRasterJobSourceId(
      input.revisionId,
      input.outputWidth,
    );
    const existing = await this.repository.findBySource({
      organizationId: input.organizationId,
      jobType: 'detail_page_rasterize',
      sourceResourceId,
    });
    if (existing && !['failed', 'cancelled'].includes(existing.status)) {
      const current = statusFromJob(existing);
      return current.status === 'absent' ? { status: 'processing' } : current;
    }

    const job = await this.repository.restartHeldRasterization({
      organizationId: input.organizationId,
      jobType: 'detail_page_rasterize',
      sourceResourceId,
      payload: {
        jobType: 'detail_page_rasterize',
        models: {},
        input: {
          revisionId: input.revisionId,
          artifactId: input.artifactId,
          outputWidth: input.outputWidth,
        },
      },
      status: 'held',
      scheduledFor: new Date(Date.now() + this.config.heldRecoveryMs),
      maxAttempts: 3,
    });
    if (job.status === 'held') {
      const released = await this.repository.release({
        organizationId: input.organizationId,
        jobId: job.id,
      });
      if (released) this.worker.wake();
    }
    const current = statusFromJob(job);
    return current.status === 'absent' ? { status: 'processing' } : current;
  }
}

function statusFromJob(job: AiDirectJobRecord): DetailPageRasterJobStatus {
  if (job.status === 'succeeded') {
    const parsed = DetailPageRasterJobOutputSchema.safeParse(job.result);
    return parsed.success
      ? { status: 'rendered', output: parsed.data }
      : { status: 'failed', message: '저장된 상세페이지 이미지 결과가 올바르지 않습니다.' };
  }
  if (job.status === 'failed' || job.status === 'cancelled') {
    return {
      status: 'failed',
      message: job.lastErrorMessage ?? '상세페이지 이미지 준비에 실패했습니다.',
    };
  }
  return { status: 'processing' };
}
