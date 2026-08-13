import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { OperationResourceClass } from '@kiditem/shared/operations';
import { OPERATION_REPOSITORY_PORT } from '../port/out/repository/operation.repository.port';
import type { OperationRunRepositoryPort } from '../port/out/repository/operation.repository.port';
import {
  resolveOperationRunLeaseMs,
  resolveOperationResourceClassLimits,
  resolveOperationRuntimeWorkerEnabled,
  resolveOperationRuntimeWorkerIntervalMs,
} from './operation-runtime.config';
import { OperationAttemptExecutorService } from './operation-attempt-executor.service';
import {
  COMPOSITE_OPERATION_COORDINATOR_PORT,
  type CompositeOperationCoordinatorPort,
} from '../port/in/composite-operation-coordinator.port';

const RESOURCE_CLASSES: readonly OperationResourceClass[] = [
  'default',
  'naver_api',
  'extension_coupang',
  'playwright_1688',
  'snapshot_compute',
];
const DEADLINE_SWEEP_LIMIT = 100;

@Injectable()
export class OperationRunWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperationRunWorkerService.name);
  private readonly enabled = resolveOperationRuntimeWorkerEnabled();
  private readonly intervalMs = resolveOperationRuntimeWorkerIntervalMs();
  private readonly leaseMs = resolveOperationRunLeaseMs();
  private readonly resourceClassLimits = resolveOperationResourceClassLimits();
  private readonly workerId = `operations-${process.pid}`;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private stopping = false;
  private tickInFlight: Promise<void> | null = null;
  private compositeResumeInFlight: Promise<void> | null = null;
  private readonly activeAttempts = new Map<
    OperationResourceClass,
    Set<Promise<void>>
  >(RESOURCE_CLASSES.map((resourceClass) => [resourceClass, new Set()]));

  constructor(
    private readonly attemptExecutor: OperationAttemptExecutorService,
    @Inject(OPERATION_REPOSITORY_PORT)
    private readonly repository: OperationRunRepositoryPort,
    @Inject(COMPOSITE_OPERATION_COORDINATOR_PORT)
    private readonly compositeCoordinator: CompositeOperationCoordinatorPort,
  ) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log(
        'Operation runtime worker disabled (set OPERATION_RUNTIME_WORKER_ENABLED=1 to enable).',
      );
      return;
    }
    this.intervalHandle = setInterval(() => void this.tick(), this.intervalMs);
    this.intervalHandle.unref?.();
  }

  onModuleDestroy(): void {
    this.stopping = true;
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    this.attemptExecutor.abortAll(new Error('operation_worker_shutdown'));
  }

  async tick(): Promise<void> {
    if (this.stopping) return;
    if (this.tickInFlight) return this.tickInFlight;
    const tick = this.fillAvailableSlots();
    this.tickInFlight = tick;
    try {
      await tick;
    } catch (error) {
      this.logger.warn(
        `Operation run worker tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (this.tickInFlight === tick) this.tickInFlight = null;
    }
  }

  private async fillAvailableSlots(): Promise<void> {
    const now = new Date();
    await this.repository.expirePastDeadlineRuns({
      now,
      limit: DEADLINE_SWEEP_LIMIT,
    });
    if (this.stopping) return;
    this.startCompositeResume(now);
    await Promise.all(
      RESOURCE_CLASSES.map((resourceClass) =>
        this.fillResourceClass(resourceClass),
      ),
    );
  }

  private startCompositeResume(now: Date): void {
    if (this.compositeResumeInFlight) return;
    const resume = this.compositeCoordinator
      .resumeTerminalChildren(now)
      .catch((error: unknown) => {
        this.logger.warn(
          `Operation composite resume failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        if (this.compositeResumeInFlight === resume) {
          this.compositeResumeInFlight = null;
        }
      });
    this.compositeResumeInFlight = resume;
  }

  private async fillResourceClass(
    resourceClass: OperationResourceClass,
  ): Promise<void> {
    const active = this.activeAttempts.get(resourceClass) as Set<Promise<void>>;
    const limit = this.resourceClassLimits[resourceClass];
    while (!this.stopping && active.size < limit) {
      const now = new Date();
      const claimed = await this.repository.claimNextRun({
        resourceClass,
        workerId: this.workerId,
        now,
        leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
      });
      if (!claimed) return;

      let attempt!: Promise<void>;
      attempt = this.attemptExecutor
        .execute(claimed)
        .catch((error: unknown) => {
          this.logger.warn(
            `Operation attempt failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        })
        .finally(() => {
          active.delete(attempt);
        });
      active.add(attempt);
    }
  }
}
