import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  AI_DIRECT_JOB_REPOSITORY_PORT,
  type AiDirectJobRecord,
  type AiDirectJobRepositoryPort,
} from '../port/out/repository/ai-direct-job.repository.port';
import {
  AI_DIRECT_JOB_RUNTIME_CONFIG,
  type AiDirectJobRuntimeConfig,
} from './ai-direct-job.config';
import type { AiDirectJobWakePort } from '../port/out/runtime';
import {
  AiDirectJobProcessorService,
  type NormalizedAiDirectJobError,
} from './ai-direct-job-processor.service';

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
    @Inject(AI_DIRECT_JOB_REPOSITORY_PORT)
    private readonly repository: AiDirectJobRepositoryPort,
    private readonly processor: AiDirectJobProcessorService,
    @Inject(AI_DIRECT_JOB_RUNTIME_CONFIG)
    private readonly config: AiDirectJobRuntimeConfig,
  ) {}

  onModuleInit(): void {
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

  async tick(now = new Date()): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      const job = await this.repository.claimNext({
        workerId: this.workerId,
        now,
        leaseExpiresAt: new Date(now.getTime() + this.config.leaseMs),
      });
      if (!job) return false;

      const preflight = await this.processor.preflight(job);
      if (preflight !== 'runnable') {
        await this.finishPreflightRejection(job, preflight, now);
        return true;
      }

      const controller = new AbortController();
      const stopLease = this.startLeaseHeartbeat(job, controller);
      const providerTimeout = setTimeout(
        () => controller.abort('provider_timeout'),
        this.config.providerTimeoutMs,
      );
      providerTimeout.unref?.();
      try {
        const result =
          job.result ?? (await this.processor.execute(job, controller.signal));
        if (job.result == null) {
          const checkpointed = await this.repository.checkpointResult({
            organizationId: job.organizationId,
            jobId: job.id,
            result,
          });
          if (!checkpointed) return true;
        }
        const projectingJob = await this.repository.findById({
          organizationId: job.organizationId,
          jobId: job.id,
        });
        if (!projectingJob || projectingJob.status !== 'projecting') return true;
        await this.processor.project(projectingJob, result);
        await this.repository.markSucceeded({
          organizationId: job.organizationId,
          jobId: job.id,
        });
      } catch (error) {
        if (controller.signal.aborted && controller.signal.reason !== 'provider_timeout') {
          return true;
        }
        const normalized = normalizeAiDirectJobError(
          error,
          controller.signal.reason === 'provider_timeout',
        );
        const willRetry = normalized.retryable && job.attempts < job.maxAttempts;
        const delay = this.config.retryDelaysMs[
          Math.min(Math.max(job.attempts - 1, 0), this.config.retryDelaysMs.length - 1)
        ];
        await this.repository.failOrReschedule({
          organizationId: job.organizationId,
          jobId: job.id,
          errorCode: normalized.errorCode,
          errorMessage: normalized.errorMessage,
          retryable: normalized.retryable,
          retryAt: new Date(now.getTime() + delay),
          now,
        });
        if (!willRetry) {
          await this.processor.projectFailure(job, normalized);
        }
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
    job: AiDirectJobRecord,
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
      void this.repository
        .extendLease({
          organizationId: job.organizationId,
          jobId: job.id,
          workerId: this.workerId,
          leaseExpiresAt: new Date(Date.now() + this.config.leaseMs),
        })
        .then((status) => {
          if (status === 'cancelled' || status === 'lost') {
            controller.abort(status);
          }
        })
        .catch(() => controller.abort('lost'));
    }, intervalMs);
    interval.unref?.();
    return () => clearInterval(interval);
  }

  private async finishPreflightRejection(
    job: AiDirectJobRecord,
    reason: 'cancelled' | 'invalid',
    now: Date,
  ): Promise<void> {
    if (reason === 'cancelled') {
      await this.repository.cancel({
        organizationId: job.organizationId,
        jobId: job.id,
        reason: 'Source operation is already terminal or cancelled.',
      });
      return;
    }
    const normalized: NormalizedAiDirectJobError = {
      errorCode: 'direct_ai_source_invalid',
      errorMessage: 'AI direct job source is missing or invalid.',
      retryable: false,
    };
    await this.repository.failOrReschedule({
      organizationId: job.organizationId,
      jobId: job.id,
      ...normalized,
      retryAt: now,
      now,
    });
    await this.processor.projectFailure(job, normalized);
  }
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
