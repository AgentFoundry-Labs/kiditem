import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { OPERATION_REPOSITORY_PORT } from '../port/out/repository/operation.repository.port';
import type { OperationRunRepositoryPort } from '../port/out/repository/operation.repository.port';
import {
  resolveOperationRunLeaseMs,
  resolveOperationRuntimeWorkerEnabled,
  resolveOperationRuntimeWorkerIntervalMs,
} from './operation-runtime.config';
import { OperationDispatcherService } from './operation-dispatcher.service';

@Injectable()
export class OperationRunWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperationRunWorkerService.name);
  private readonly enabled = resolveOperationRuntimeWorkerEnabled();
  private readonly intervalMs = resolveOperationRuntimeWorkerIntervalMs();
  private readonly leaseMs = resolveOperationRunLeaseMs();
  private readonly workerId = `operations-${process.pid}`;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    private readonly dispatcher: OperationDispatcherService,
    @Inject(OPERATION_REPOSITORY_PORT)
    private readonly repository: OperationRunRepositoryPort,
  ) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Operation runtime worker disabled (set OPERATION_RUNTIME_WORKER_ENABLED=1 to enable).');
      return;
    }
    this.intervalHandle = setInterval(() => void this.tick(), this.intervalMs);
    this.intervalHandle.unref?.();
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.intervalHandle = null;
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = new Date();
      const run = await this.repository.claimNextRun({
        workerId: this.workerId,
        now,
        leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
      });
      if (run) await this.dispatcher.dispatch(run);
    } catch (error) {
      this.logger.warn(
        `Operation run worker tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.busy = false;
    }
  }
}
