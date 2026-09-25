import { hostname } from 'node:os';
import { aiUsageMeter } from '../usage/ai-usage-meter';
import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { isKiditemError } from '@kiditem/shared/errors';
import {
  aiDirectJobRetryAfterMs,
  validateAiDirectJobResult,
  type AiDirectJob,
} from '../../domain/direct-job/ai-direct-job-operation';
import {
  AI_DIRECT_JOB_OPERATIONS_PORT,
  type AiDirectJobOperationsPort,
} from '../port/out/runtime/ai-direct-job-operations.port';
import {
  AI_DIRECT_JOB_RUNTIME_CONFIG,
  type AiDirectJobRuntimeConfig,
} from './ai-direct-job.config';
import {
  AiDirectJobProcessorService,
  type NormalizedAiDirectJobError,
} from './ai-direct-job-processor.service';
import type { AiDirectJobWakePort } from '../port/out/runtime';

/**
 * AI 생성 job 워커. 실행 계약(ADR-0025)에서 `content.*` job 하나를 claim해 모델을 부르고, 검증한 결과를
 * 실행 청크로 받아 둔 뒤(`result_saved`) finish한다. 원장 반영은 finish 트랜잭션의 owner finalize가,
 * 최종 실패 기록은 owner onFailed가 한다. 재시도·임대 만료 회수·취소 판정은 계약이 한다.
 */
@Injectable()
export class AiDirectJobWorkerService
  implements OnModuleInit, OnModuleDestroy, AiDirectJobWakePort
{
  private readonly logger = new Logger(AiDirectJobWorkerService.name);
  private readonly workerId = `${hostname()}-${process.pid}-${randomUUID()}`;
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private wakeRequested = false;
  private nextIdleDelayMs = 0;
  private nextErrorDelayMs = 0;

  constructor(
    @Inject(AI_DIRECT_JOB_OPERATIONS_PORT)
    private readonly jobs: AiDirectJobOperationsPort,
    private readonly processor: AiDirectJobProcessorService,
    @Inject(AI_DIRECT_JOB_RUNTIME_CONFIG)
    private readonly config: AiDirectJobRuntimeConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.workerEnabled) return;
    this.stopped = false;
    this.resetBackoff();
    this.schedule(0);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  wake(): void {
    this.resetBackoff();
    if (this.busy) {
      this.wakeRequested = true;
      return;
    }
    this.wakeRequested = false;
    this.schedule(0);
  }

  async tick(): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      const claimed = await this.jobs.claim(this.workerId);
      if (!claimed) return false;
      const { job, token } = claimed;

      const preflight = await this.processor.preflight(job);
      if (preflight !== 'runnable') {
        await this.finishPreflightRejection(job, token, preflight);
        return true;
      }

      const controller = new AbortController();
      const stopLease = this.startLeaseHeartbeat(job, token, controller);
      const providerTimeout = setTimeout(
        () => controller.abort('provider_timeout'),
        this.config.providerTimeoutMs,
      );
      providerTimeout.unref?.();
      let resultSaved = claimed.resultSaved;
      try {
        if (!resultSaved) {
          // Direct jobs are product media work (thumbnails, detail pages, image
          // edits): the 상품 agent's spend, metered to the job's organization.
          const rawResult = await aiUsageMeter.run(
            { organizationId: job.organizationId, agentKey: 'product' },
            () => this.processor.execute(job, controller.signal),
          );
          const result = validateAiDirectJobResult(job.jobType, rawResult);
          if (!(await this.jobs.saveResult(job, token, result))) return true;
          resultSaved = true;
        }
        await this.jobs.succeed(job, token);
      } catch (error) {
        if (controller.signal.aborted && controller.signal.reason !== 'provider_timeout') {
          return true;
        }
        const normalized = normalizeAiDirectJobError(
          error,
          controller.signal.reason === 'provider_timeout',
        );
        if (isKiditemError(error) && error.details) {
          // 원장에는 코드와 문장만 남는다 — 진단값(details)은 로그로 남긴다.
          this.logger.warn(
            `${job.jobType} job ${job.id} failed with ${error.code}: details=${JSON.stringify(error.details)}`,
          );
        }
        if (resultSaved && isDeterministicRefusal(error)) {
          // 받아 둔 결과를 반영하다 원장이 결정적으로 거절했다(409·412·400 계열, 예: 채택된 후보
          // CONTENT_ASSET_IN_USE). 다시 반영해도 같으므로 재시도 없이 끝내고 onFailed가 기록한다.
          normalized.retryable = false;
        }
        if (resultSaved && normalized.retryable) {
          // 결과는 이미 받아 두었다. fail(retryAfterMs)은 받아 둔 결과를 지우므로 부르지 않는다:
          // 실행을 그대로 두면 임대 만료 뒤 다음 claim이 모델을 다시 부르지 않고 받아 둔 결과로 finish한다.
          this.logger.error(
            `${job.jobType} job ${job.id} could not project its saved result (${normalized.errorCode}): ${normalized.errorMessage}`,
          );
          await this.jobs.recordFinishError(job, token, { code: normalized.errorCode, message: normalized.errorMessage });
          return true;
        }
        await this.jobs.fail(job, token, {
          errorCode: normalized.errorCode,
          errorMessage: normalized.errorMessage,
          retryAfterMs: aiDirectJobRetryAfterMs(
            { retryable: normalized.retryable, attempts: job.attempts },
            this.config.retryDelaysMs,
          ),
        });
      } finally {
        clearTimeout(providerTimeout);
        stopLease();
      }
      return true;
    } finally {
      this.busy = false;
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runScheduledTick();
    }, delayMs);
    this.timer.unref?.();
  }

  private async runScheduledTick(): Promise<void> {
    let claimed = false;
    let failed = false;
    try {
      claimed = await this.tick();
    } catch (error) {
      failed = true;
      this.logger.error(
        `AI direct job worker tick failed: ${errorMessage(error)}`,
      );
    }

    if (this.stopped) return;
    if (this.wakeRequested || claimed) {
      this.wakeRequested = false;
      this.resetBackoff();
      this.schedule(0);
      return;
    }

    if (failed) {
      this.nextIdleDelayMs = this.config.workerIntervalMs;
      const delayMs = this.nextErrorDelayMs;
      this.nextErrorDelayMs = Math.min(
        delayMs * 2,
        this.config.workerErrorMaxIntervalMs,
      );
      this.schedule(delayMs);
      return;
    }

    this.nextErrorDelayMs = this.config.workerIntervalMs;
    const delayMs = this.nextIdleDelayMs;
    this.nextIdleDelayMs = Math.min(
      delayMs * 2,
      this.config.workerMaxIntervalMs,
    );
    this.schedule(delayMs);
  }

  private resetBackoff(): void {
    this.nextIdleDelayMs = this.config.workerIntervalMs;
    this.nextErrorDelayMs = this.config.workerIntervalMs;
  }

  private startLeaseHeartbeat(
    job: AiDirectJob,
    token: string,
    controller: AbortController,
  ): () => void {
    const intervalMs = Math.max(
      1,
      Math.min(
        this.config.leaseHeartbeatMs,
        Math.floor(this.config.leaseMs / 3),
      ),
    );
    const interval = setInterval(() => {
      void this.jobs
        .heartbeat(job, token)
        .then((lease) => {
          if (lease !== 'alive') controller.abort(lease);
        })
        .catch(() => controller.abort('lost'));
    }, intervalMs);
    interval.unref?.();
    return () => clearInterval(interval);
  }

  private async finishPreflightRejection(
    job: AiDirectJob,
    token: string,
    reason: 'cancelled' | 'invalid',
  ): Promise<void> {
    if (reason === 'cancelled') {
      // 생성 기록이 이미 끝났다(취소·삭제 등). job만 취소로 닫는다.
      await this.jobs.cancel(job.organizationId, job.id);
      return;
    }
    const normalized: NormalizedAiDirectJobError = {
      errorCode: 'direct_ai_source_invalid',
      errorMessage: 'AI direct job source is missing or invalid.',
      retryable: false,
    };
    // 재시도 없이 끝낸다. 생성 기록의 실패 기록은 owner onFailed가 같은 트랜잭션에서 한다.
    await this.jobs.fail(job, token, normalized);
  }
}

/** 같은 입력으로 다시 해도 같은 답이 나오는 거절: conflict · precondition · validation 종류의 KidItem 오류. */
const DETERMINISTIC_REFUSAL_KINDS = new Set(['conflict', 'precondition', 'validation']);

function isDeterministicRefusal(error: unknown): boolean {
  return isKiditemError(error) && DETERMINISTIC_REFUSAL_KINDS.has(error.kind);
}

function normalizeAiDirectJobError(
  error: unknown,
  timedOut: boolean,
): NormalizedAiDirectJobError {
  if (timedOut) {
    return {
      errorCode: 'provider_timeout',
      errorMessage: 'AI provider request timed out.',
      retryable: true,
    };
  }
  const code = errorCode(error);
  const nonRetryable =
    code === 'model_required' ||
    code === 'direct_ai_input_invalid' ||
    code === 'direct_ai_input_not_durable' ||
    code === 'direct_ai_output_invalid' ||
    code.startsWith('generated_image_');
  return {
    errorCode: code,
    errorMessage: errorMessage(error),
    retryable: !nonRetryable,
  };
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const value = (error as { code?: unknown }).code;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return 'direct_ai_execution_failed';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
