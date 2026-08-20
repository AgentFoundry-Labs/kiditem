import {
  BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  OPERATION_REPOSITORY_PORT,
  type OperationLifecycleBatchResult,
  type OperationRunRepositoryPort,
} from '../port/out/repository/operation.repository.port';
import { OperationLifecycleGateService } from './operation-lifecycle-gate.service';
import { OperationRunWorkerService } from './operation-run-worker.service';
import { OperationSchedulerService } from './operation-scheduler.service';

export const OPERATION_LIFECYCLE_OPTIONS = Symbol(
  'OPERATION_LIFECYCLE_OPTIONS',
);

export interface OperationLifecycleOptions {
  batchSize: number;
  startupTimeoutMs: number;
  shutdownTimeoutMs: number;
}

export const DEFAULT_OPERATION_LIFECYCLE_OPTIONS = {
  batchSize: 100,
  startupTimeoutMs: 30_000,
  shutdownTimeoutMs: 5_000,
} as const satisfies OperationLifecycleOptions;

const STARTUP_ERROR_MESSAGE =
  'Operation cancelled because its API server lifecycle expired';
const SHUTDOWN_ERROR_MESSAGE =
  'Operation cancelled because the API server is shutting down';

@Injectable()
export class OperationServerLifecycleService
  implements OnApplicationBootstrap, OnModuleDestroy, BeforeApplicationShutdown
{
  private readonly logger = new Logger(OperationServerLifecycleService.name);
  private firstSweepComplete = false;
  private cleanupError: unknown;

  constructor(
    @Inject(OPERATION_REPOSITORY_PORT)
    private readonly repository: OperationRunRepositoryPort,
    private readonly gate: OperationLifecycleGateService,
    private readonly scheduler: OperationSchedulerService,
    private readonly worker: OperationRunWorkerService,
    @Inject(OPERATION_LIFECYCLE_OPTIONS)
    private readonly options: OperationLifecycleOptions,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const deadline = Date.now() + this.options.startupTimeoutMs;
    const cutoff = await this.withinDeadline(
      deadline,
      this.repository.readLifecycleDatabaseTime(),
    );
    await this.drainBatches(deadline, (statementTimeoutMs) =>
      this.repository.cancelRunsForLifecycle({
        cutoff,
        errorCode: 'operation_server_lifecycle_expired',
        errorMessage: STARTUP_ERROR_MESSAGE,
        finishedAt: cutoff,
        limit: this.options.batchSize,
        statementTimeoutMs,
      }));
    await this.drainBatches(deadline, (statementTimeoutMs) =>
      this.repository.advanceSchedulesPastLifecycleCutoff({
        cutoff,
        limit: this.options.batchSize,
        statementTimeoutMs,
      }));
    this.gate.open();
    this.scheduler.start();
    this.worker.start();
  }

  async onModuleDestroy(): Promise<void> {
    this.gate.beginStopping();
    const reason = this.gate.signal().reason;
    this.scheduler.stopIntake(reason);
    this.worker.stopIntake(reason);
    const deadline = Date.now() + this.options.shutdownTimeoutMs;

    try {
      await this.scheduler.drainUntil(deadline);
      await this.worker.drainUntil(deadline, false);
      await this.drainBatches(deadline, (statementTimeoutMs) =>
        this.repository.cancelRunsForLifecycle({
          cutoff: null,
          errorCode: 'operation_server_shutdown',
          errorMessage: SHUTDOWN_ERROR_MESSAGE,
          finishedAt: new Date(),
          limit: this.options.batchSize,
          statementTimeoutMs,
        }));
      this.firstSweepComplete = true;
    } catch (error) {
      this.cleanupError = error;
    } finally {
      this.worker.abortActive(reason);
      try {
        await this.worker.drainUntil(deadline, true);
      } catch (error) {
        this.cleanupError ??= error;
      }
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    const deadline = Date.now() + this.options.shutdownTimeoutMs;
    let finalSweepComplete = false;
    try {
      await this.drainBatches(deadline, (statementTimeoutMs) =>
        this.repository.cancelRunsForLifecycle({
          cutoff: null,
          errorCode: 'operation_server_shutdown',
          errorMessage: SHUTDOWN_ERROR_MESSAGE,
          finishedAt: new Date(),
          limit: this.options.batchSize,
          statementTimeoutMs,
        }));
      finalSweepComplete = true;
    } catch (error) {
      this.cleanupError ??= error;
    }

    if (!this.firstSweepComplete || !finalSweepComplete || this.cleanupError) {
      this.logger.error(
        'operation_server_lifecycle_cleanup_failed',
        this.cleanupError instanceof Error
          ? this.cleanupError.stack
          : String(this.cleanupError ?? 'incomplete_lifecycle_sweep'),
      );
      throw new Error('operation_server_lifecycle_cleanup_failed');
    }
    this.gate.finishStopping();
  }

  private async drainBatches(
    deadline: number,
    batch: (statementTimeoutMs: number) => Promise<OperationLifecycleBatchResult>,
  ): Promise<void> {
    while (true) {
      const statementTimeoutMs = this.remainingMs(deadline);
      const result = await this.withinDeadline(
        deadline,
        batch(statementTimeoutMs),
      );
      if (!result.remaining) return;
      if (result.updated === 0) {
        await this.yieldUntil(deadline);
      }
    }
  }

  private remainingMs(deadline: number): number {
    const remaining = Math.ceil(deadline - Date.now());
    if (remaining <= 0) {
      throw new Error('operation_server_lifecycle_startup_timeout');
    }
    return remaining;
  }

  private async yieldUntil(deadline: number): Promise<void> {
    const remaining = this.remainingMs(deadline);
    await new Promise<void>((resolve) => {
      const handle = setTimeout(resolve, Math.min(10, remaining));
      handle.unref?.();
    });
  }

  private async withinDeadline<T>(
    deadline: number,
    operation: Promise<T>,
  ): Promise<T> {
    const remaining = this.remainingMs(deadline);
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('operation_server_lifecycle_startup_timeout'));
      }, remaining);
      timeoutHandle.unref?.();
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}
