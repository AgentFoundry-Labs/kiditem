import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ThumbnailAnalysisService } from './thumbnail-analysis.service';
import type { AnalysisScope } from '../../adapter/in/http/dto/thumbnail-analyze.dto';

const BATCH_SIZE = 15;
const RATE_LIMIT_DELAY_MS = 2_000;
const JOB_TTL_MS = 30 * 60 * 1000;

export type ThumbnailAnalysisBatchStatus = 'running' | 'done' | 'failed' | 'cancelled';

export interface ThumbnailAnalysisBatchJobState {
  jobId: string;
  organizationId: string;
  status: ThumbnailAnalysisBatchStatus;
  scope: AnalysisScope;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
}

interface InternalJob extends ThumbnailAnalysisBatchJobState {
  productIds: string[];
  cancelled: boolean;
}

/**
 * Thumbnail batch analysis 의 backend job tracker.
 *
 * 기존 `analyze-batch` POST 는 frontend 가 chunk 분할 + 진행 상태를 useState
 * 로만 관리해서, 페이지 새로고침 시:
 *   - 진행 banner 사라짐 (브라우저 메모리 리셋)
 *   - chunk loop 가 죽어서 다음 chunk 가 발사되지 않음 → 처리 중단
 *   - 사용자가 batch 가 끝났는지 / 부분 처리됐는지 알 길 없음
 *
 * 이 service 는 `coupang-image-sync.service` 와 같은 패턴으로 organization 별
 * 1개 in-memory job 을 추적한다. frontend 는 jobId 를 localStorage 에 저장하고
 * 새로고침 후 GET /batch/:jobId 로 진행 상태를 복원한다.
 *
 * Single-instance assumption (transitional shortcut, ai/AGENTS.md 참고):
 *   - 멀티 백엔드 인스턴스나 backend 재시작 시 잡 상태 손실
 *   - frontend localStorage cleanup 으로 graceful 회복 (status 404 → reset)
 *   - prod 멀티-instance 도입 시 `ChannelScrapeRun` 같은 DB-backed job table 로
 *     마이그레이션 필요
 */
@Injectable()
export class ThumbnailAnalysisBatchService {
  private readonly logger = new Logger(ThumbnailAnalysisBatchService.name);
  private readonly jobs = new Map<string, InternalJob>();

  constructor(private readonly analysis: ThumbnailAnalysisService) {}

  start(
    organizationId: string,
    productIds: string[],
    scope: AnalysisScope,
  ): { jobId: string } {
    if (productIds.length === 0) {
      throw new ConflictException('분석할 상품이 없습니다');
    }

    for (const job of this.jobs.values()) {
      if (job.organizationId === organizationId && job.status === 'running') {
        throw new ConflictException('이미 진행 중인 batch 분석 잡이 있습니다');
      }
    }

    const jobId = randomUUID();
    const job: InternalJob = {
      jobId,
      organizationId,
      status: 'running',
      scope,
      total: productIds.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
      productIds: [...productIds],
      cancelled: false,
    };
    this.jobs.set(jobId, job);

    void this.run(job).catch((err: unknown) => {
      job.status = 'failed';
      job.finishedAt = Date.now();
      job.error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Thumbnail batch ${jobId} failed: ${job.error}`);
    });

    return { jobId };
  }

  getStatus(jobId: string, organizationId: string): ThumbnailAnalysisBatchJobState {
    this.gc();
    const job = this.jobs.get(jobId);
    if (!job) throw new NotFoundException('jobId not found');
    if (job.organizationId !== organizationId) throw new ForbiddenException();
    return this.toExternal(job);
  }

  getCurrent(organizationId: string): ThumbnailAnalysisBatchJobState | null {
    this.gc();
    const candidates = [...this.jobs.values()]
      .filter((job) => job.organizationId === organizationId)
      .filter((job) => job.status === 'running')
      .sort((a, b) => b.startedAt - a.startedAt);
    return candidates[0] ? this.toExternal(candidates[0]) : null;
  }

  cancel(jobId: string, organizationId: string): { ok: true } {
    const job = this.jobs.get(jobId);
    if (!job) throw new NotFoundException('jobId not found');
    if (job.organizationId !== organizationId) throw new ForbiddenException();
    if (job.status === 'running') {
      job.cancelled = true;
      // analyzeBatch 안의 AbortController 도 같이 abort 시켜 즉시 중단.
      this.analysis.cancelBatch(organizationId);
    }
    return { ok: true };
  }

  private async run(job: InternalJob): Promise<void> {
    const { organizationId, productIds, scope } = job;

    for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
      if (job.cancelled) {
        job.status = 'cancelled';
        job.finishedAt = Date.now();
        return;
      }

      const chunk = productIds.slice(i, i + BATCH_SIZE);
      try {
        const results = await this.analysis.analyzeBatch(chunk, organizationId, scope);
        const validCount = results.length;
        job.succeeded += validCount;
        job.failed += chunk.length - validCount;
      } catch (err) {
        job.failed += chunk.length;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Thumbnail batch ${job.jobId} chunk ${i}-${i + chunk.length} failed: ${message}`,
        );
      } finally {
        job.processed += chunk.length;
      }

      if (job.cancelled) {
        job.status = 'cancelled';
        job.finishedAt = Date.now();
        return;
      }

      if (i + BATCH_SIZE < productIds.length) {
        await new Promise<void>((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
      }
    }

    job.status = 'done';
    job.finishedAt = Date.now();
  }

  private gc(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.status !== 'running' && job.finishedAt && now - job.finishedAt > JOB_TTL_MS) {
        this.jobs.delete(id);
      }
    }
  }

  private toExternal(job: InternalJob): ThumbnailAnalysisBatchJobState {
    const { productIds: _ids, cancelled: _c, ...rest } = job;
    return { ...rest };
  }
}
