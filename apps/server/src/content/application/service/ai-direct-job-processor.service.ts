import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { KiditemError } from '@kiditem/shared/errors';
import {
  DetailPageGenerateDirectOutputSchema,
  ImageEditDirectOutputSchema,
  ThumbnailGenerateDirectOutputSchema,
} from '../../domain/direct-generation';
import type { AiDirectJob } from '../../domain/direct-job/ai-direct-job-operation';
import type { OwnerTransaction } from '../../../common/owner-transaction';
import {
  DETAIL_PAGE_GENERATION_REPOSITORY_PORT,
  type DetailPageGenerationRepositoryPort,
} from '../port/out/repository/detail-page-generation.repository.port';
import {
  THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
  type ThumbnailGenerationLedgerRepositoryPort,
} from '../port/out/repository/thumbnail-generation-ledger.repository.port';
import {
  DETAIL_PAGE_DIRECT_OUTPUT_SINK_PORT,
  type DetailPageDirectOutputSinkPort,
} from '../port/out/sink/detail-page-direct-output-sink.port';
import {
  THUMBNAIL_DIRECT_OUTPUT_SINK_PORT,
  type ThumbnailDirectOutputSinkPort,
} from '../port/out/sink/thumbnail-direct-output-sink.port';
import { ThumbnailDirectGenerationExecutorService } from './thumbnail-direct-generation-executor.service';
import { DetailPageDirectGenerationExecutorService } from './detail-page-direct-generation-executor.service';
import { ImageEditDirectGenerationExecutorService } from './image-edit-direct-generation-executor.service';
import { ThumbnailGenerationJobService } from './thumbnail-generation-job.service';
import { AiDirectJobPayloadHydratorService } from './ai-direct-job-payload-hydrator.service';

const THUMBNAIL_TERMINAL = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'skipped',
]);
/** 상세 생성 페이지가 끝난 상태(취소는 failed). */
const DETAIL_TERMINAL = new Set(['ready', 'failed']);
export interface NormalizedAiDirectJobError {
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
}

export interface AiDirectJobProcessor {
  preflight(
    job: AiDirectJob,
  ): Promise<'runnable' | 'cancelled' | 'invalid'>;
  execute(job: AiDirectJob, signal: AbortSignal): Promise<unknown>;
  /** 실행 finish 트랜잭션(`transaction`) 안에서 결과를 원장에 반영한다. */
  project(job: AiDirectJob, result: unknown, transaction?: OwnerTransaction): Promise<void>;
  projectFailure(
    job: AiDirectJob,
    error: NormalizedAiDirectJobError,
    transaction?: OwnerTransaction,
  ): Promise<void>;
}

@Injectable()
export class AiDirectJobProcessorService implements AiDirectJobProcessor {
  constructor(
    private readonly hydrator: AiDirectJobPayloadHydratorService,
    private readonly thumbnailExecutor: ThumbnailDirectGenerationExecutorService,
    private readonly detailPageExecutor: DetailPageDirectGenerationExecutorService,
    private readonly imageEditExecutor: ImageEditDirectGenerationExecutorService,
    @Inject(forwardRef(() => ThumbnailGenerationJobService))
    private readonly thumbnailGenerationJobs: ThumbnailGenerationJobService,
    @Inject(THUMBNAIL_DIRECT_OUTPUT_SINK_PORT)
    private readonly thumbnailSink: ThumbnailDirectOutputSinkPort,
    @Inject(DETAIL_PAGE_DIRECT_OUTPUT_SINK_PORT)
    private readonly detailPageSink: DetailPageDirectOutputSinkPort,
    @Inject(THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT)
    private readonly thumbnailLedger: ThumbnailGenerationLedgerRepositoryPort,
    @Inject(DETAIL_PAGE_GENERATION_REPOSITORY_PORT)
    private readonly detailPageRepository: DetailPageGenerationRepositoryPort,
  ) {}

  async preflight(
    job: AiDirectJob,
  ): Promise<'runnable' | 'cancelled' | 'invalid'> {
    switch (job.jobType) {
      case 'thumbnail_generate':
      case 'thumbnail_reedit': {
        const row = await this.thumbnailLedger.findGenerationProjectionStatus({
          organizationId: job.organizationId,
          generationId: job.sourceResourceId,
        });
        if (!row) return 'invalid';
        if (THUMBNAIL_TERMINAL.has(row.status)) return 'cancelled';
        return 'runnable';
      }
      case 'detail_page_generate': {
        const row = await this.detailPageRepository.findGenerationStatus({
          organizationId: job.organizationId,
          detailPageId: job.sourceResourceId,
        });
        if (!row) return 'invalid';
        if (DETAIL_TERMINAL.has(row.status)) return 'cancelled';
        return 'runnable';
      }
      case 'image_edit': {
        return 'runnable';
      }
      default:
        return assertNever(job.jobType);
    }
  }

  async execute(job: AiDirectJob, signal: AbortSignal): Promise<unknown> {
    throwIfAborted(signal);
    switch (job.jobType) {
      case 'thumbnail_generate': {
        if (job.payload.jobType !== 'thumbnail_generate') return payloadMismatch();
        const generationInput = await this.hydrator.hydrateThumbnail(job, signal);
        throwIfAborted(signal);
        return this.thumbnailExecutor.execute({
          organizationId: job.organizationId,
          generationInput,
          model: job.payload.models.image,
          signal,
        });
      }
      case 'detail_page_generate':
        if (job.payload.jobType !== 'detail_page_generate') return payloadMismatch();
        return this.detailPageExecutor.execute({
          organizationId: job.organizationId,
          generationInput: job.payload.input,
          textModel: job.payload.models.text,
          modelPlan: {
            image: job.payload.models.image,
            vision: job.payload.models.vision,
          },
          signal,
        });
      case 'image_edit':
        if (job.payload.jobType !== 'image_edit') return payloadMismatch();
        return this.imageEditExecutor.execute({
          organizationId: job.organizationId,
          model: job.payload.models.image,
          input: job.payload.input,
          jobId: job.id,
          signal,
        });
      case 'thumbnail_reedit':
        if (job.payload.jobType !== 'thumbnail_reedit') return payloadMismatch();
        await this.thumbnailGenerationJobs.processEditJob(
          job.payload.input.generationId,
          job.organizationId,
          job.payload.input.purpose,
          job.payload.input.variantKey,
          job.payload.models.image,
          signal,
        );
        return { completed: true };
      default:
        return assertNever(job.jobType);
    }
  }

  async project(job: AiDirectJob, result: unknown, transaction?: OwnerTransaction): Promise<void> {
    switch (job.jobType) {
      case 'thumbnail_generate':
        await this.thumbnailSink.applySuccess({
          organizationId: job.organizationId,
          requestId: directRequestId(job.id),
          transaction,
          sourceResourceId: job.sourceResourceId,
          output: ThumbnailGenerateDirectOutputSchema.parse(result),
        });
        return;
      case 'detail_page_generate':
        await this.detailPageSink.applySuccess({
          organizationId: job.organizationId,
          requestId: directRequestId(job.id),
          transaction,
          sourceResourceId: job.sourceResourceId,
          output: DetailPageGenerateDirectOutputSchema.parse(result),
        });
        return;
      case 'image_edit': {
        ImageEditDirectOutputSchema.parse(result);
        return;
      }
      case 'thumbnail_reedit':
        return;
      default:
        return assertNever(job.jobType);
    }
  }

  async projectFailure(
    job: AiDirectJob,
    error: NormalizedAiDirectJobError,
    transaction?: OwnerTransaction,
  ): Promise<void> {
    switch (job.jobType) {
      case 'thumbnail_generate':
        await this.thumbnailSink.applyFailure({
          organizationId: job.organizationId,
          requestId: directRequestId(job.id),
          transaction,
          sourceResourceId: job.sourceResourceId,
          errorCode: error.errorCode,
          errorMessage: error.errorMessage,
        });
        return;
      case 'detail_page_generate':
        await this.detailPageSink.applyFailure({
          organizationId: job.organizationId,
          requestId: directRequestId(job.id),
          transaction,
          sourceResourceId: job.sourceResourceId,
          errorCode: error.errorCode,
          errorMessage: error.errorMessage,
        });
        return;
      case 'image_edit':
      case 'thumbnail_reedit':
        return;
      default:
        return assertNever(job.jobType);
    }
  }
}

function directRequestId(jobId: string): string {
  return `direct-ai:${jobId}`;
}

function payloadMismatch(): never {
  throw Object.assign(new Error('AI direct job payload type mismatch.'), {
    code: 'direct_ai_input_invalid',
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw Object.assign(new Error('AI direct job execution aborted.'), {
      code: 'direct_ai_aborted',
    });
  }
}

function assertNever(value: never): never {
  throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'DIRECT_JOB_TYPE_UNSUPPORTED', jobType: String(value) } });
}
