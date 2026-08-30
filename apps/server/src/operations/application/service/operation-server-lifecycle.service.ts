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
import { OperationPostAcceptingHookRegistryService } from './operation-post-accepting-hook-registry.service';

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
    private readonly postAcceptingHooks: OperationPostAcceptingHookRegistryService,
    private readonly scheduler: OperationSchedulerService,
    private readonly worker: OperationRunWorkerService,
    @Inject(OPERATION_LIFECYCLE_OPTIONS)
    private readonly options: OperationLifecycleOptions,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const startup = this.createStartupBudget();
    try {
      const cutoff = await this.withinStartupBudget(
        startup.signal,
        this.repository.readLifecycleDatabaseCutoff(),
      );
      await this.drainBatches(
        startup.deadline,
        (statementTimeoutMs) => this.repository.cancelRunsForLifecycle({
          cutoff,
          errorCode: 'operation_server_lifecycle_expired',
          errorMessage: STARTUP_ERROR_MESSAGE,
          finishedAt: cutoff.observedAt,
          limit: this.options.batchSize,
          statementTimeoutMs,
        }),
        startup.signal,
      );
      await this.drainBatches(
        startup.deadline,
        (statementTimeoutMs) => this.repository.advanceSchedulesPastLifecycleCutoff({
          cutoff,
          limit: this.options.batchSize,
          statementTimeoutMs,
        }),
        startup.signal,
      );
      startup.signal.throwIfAborted();
      this.gate.open();
      try {
        await this.withinStartupBudget(
          startup.signal,
          this.postAcceptingHooks.runAll(startup.signal),
        );
        startup.signal.throwIfAborted();
      } catch (error) {
        this.gate.beginStopping();
        throw error;
      }
      this.scheduler.start();
      this.worker.start();
    } finally {
      startup.dispose();
    }
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
    signal?: AbortSignal,
  ): Promise<void> {
    while (true) {
      signal?.throwIfAborted();
      const statementTimeoutMs = this.remainingMs(deadline);
      const result = signal
        ? await this.withinStartupBudget(signal, batch(statementTimeoutMs))
        : await this.withinDeadline(deadline, batch(statementTimeoutMs));
      if (!result.remaining) return;
      if (result.updated === 0) {
        await this.yieldUntil(deadline, signal);
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

  private async yieldUntil(deadline: number, signal?: AbortSignal): Promise<void> {
    const remaining = this.remainingMs(deadline);
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(handle);
        signal?.removeEventListener('abort', onAbort);
        reject(signal?.reason);
      };
      const handle = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, Math.min(10, remaining));
      handle.unref?.();
      if (!signal) return;
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private createStartupBudget(): {
    deadline: number;
    signal: AbortSignal;
    dispose(): void;
  } {
    const controller = new AbortController();
    const deadline = Date.now() + this.options.startupTimeoutMs;
    const lifecycleSignal = this.gate.signal();
    const onLifecycleAbort = () => controller.abort(lifecycleSignal.reason);
    if (lifecycleSignal.aborted) onLifecycleAbort();
    else lifecycleSignal.addEventListener('abort', onLifecycleAbort, { once: true });
    const timeout = setTimeout(() => {
      controller.abort(new Error('operation_server_lifecycle_startup_timeout'));
    }, this.options.startupTimeoutMs);
    timeout.unref?.();
    return {
      deadline,
      signal: controller.signal,
      dispose: () => {
        clearTimeout(timeout);
        lifecycleSignal.removeEventListener('abort', onLifecycleAbort);
      },
    };
  }

  private async withinStartupBudget<T>(
    signal: AbortSignal,
    operation: Promise<T>,
  ): Promise<T> {
    signal.throwIfAborted();
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      operation.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
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
