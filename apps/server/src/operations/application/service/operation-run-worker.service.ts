import {
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { OperationResourceClass } from '@kiditem/shared/operations';
import { OPERATION_REPOSITORY_PORT } from '../port/out/repository/operation.repository.port';
import type { OperationRunRepositoryPort } from '../port/out/repository/operation.repository.port';
import {
  resolveOperationRunLeaseMs,
  resolveOperationResourceClassLimits,
  resolveOperationRuntimeWorkerIntervalMs,
} from './operation-runtime.config';
import { OperationAttemptExecutorService } from './operation-attempt-executor.service';
import {
  COMPOSITE_OPERATION_COORDINATOR_PORT,
  type CompositeOperationCoordinatorPort,
} from '../port/in/composite-operation-coordinator.port';
import { OperationLifecycleGateService } from './operation-lifecycle-gate.service';

const RESOURCE_CLASSES: readonly OperationResourceClass[] = [
  'default',
  'naver_api',
  'extension_coupang',
  'playwright_1688',
  'snapshot_compute',
];
const DEADLINE_SWEEP_LIMIT = 100;

@Injectable()
export class OperationRunWorkerService {
  private readonly logger = new Logger(OperationRunWorkerService.name);
  private readonly intervalMs = resolveOperationRuntimeWorkerIntervalMs();
  private readonly leaseMs = resolveOperationRunLeaseMs();
  private readonly resourceClassLimits = resolveOperationResourceClassLimits();
  private readonly workerId = `operations-${process.pid}`;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private stopping = false;
  private claimController = new AbortController();
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
    private readonly lifecycleGate: OperationLifecycleGateService,
  ) {}

  start(): void {
    if (this.intervalHandle || this.stopping) return;
    this.intervalHandle = setInterval(() => void this.tick(), this.intervalMs);
    this.intervalHandle.unref?.();
  }

  stopIntake(reason: unknown): void {
    if (this.stopping) return;
    this.stopping = true;
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    if (!this.claimController.signal.aborted) {
      this.claimController.abort(reason);
    }
  }

  abortActive(reason: unknown): void {
    this.attemptExecutor.abortAll(reason);
  }

  async drainUntil(deadline: number, includeAttempts = true): Promise<void> {
    const pending = [
      this.tickInFlight,
      this.compositeResumeInFlight,
      ...(includeAttempts
        ? [...this.activeAttempts.values()].flatMap((attempts) => [...attempts])
        : []),
    ].filter((promise): promise is Promise<void> => promise !== null);
    if (pending.length === 0) return;
    await settleUntil(Promise.allSettled(pending), deadline);
  }

  async tick(): Promise<void> {
    if (this.stopping) return;
    try {
      this.lifecycleGate.assertAccepting();
    } catch {
      return;
    }
    if (this.tickInFlight) return this.tickInFlight;
    const tick = this.fillAvailableSlots();
    this.tickInFlight = tick;
    try {
      await tick;
    } catch (error) {
      if (!this.isShutdownAbort(error)) {
        this.logger.warn(
          `Operation run worker tick failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      if (this.tickInFlight === tick) this.tickInFlight = null;
    }
  }

  private async fillAvailableSlots(): Promise<void> {
    this.lifecycleGate.assertAccepting();
    const now = new Date();
    await this.repository.expirePastDeadlineRuns({
      now,
      limit: DEADLINE_SWEEP_LIMIT,
    });
    if (this.stopping) return;
    await this.repository.cancelExpiredWorkerAttempts({
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
    this.lifecycleGate.assertAccepting();
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
      this.lifecycleGate.assertAccepting();
      const now = new Date();
      const claimed = await this.repository.claimNextRun({
        resourceClass,
        workerId: this.workerId,
        now,
        leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
        signal: this.claimController.signal,
      });
      if (!claimed) return;
      if (this.stopping) {
        if (claimed.attemptToken) {
          await this.repository.cancelClaimedAttemptForLifecycle({
            organizationId: claimed.organizationId,
            runId: claimed.id,
            expectedAttemptToken: claimed.attemptToken,
            claimedBy: this.workerId,
            errorCode: 'operation_server_shutdown',
            finishedAt: new Date(),
          }).catch(() => false);
        }
        return;
      }

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

  private isShutdownAbort(error: unknown): boolean {
    return this.stopping &&
      this.claimController.signal.aborted &&
      error === this.claimController.signal.reason;
  }
}

async function settleUntil(promise: Promise<unknown>, deadline: number): Promise<void> {
  const remaining = Math.max(0, deadline - Date.now());
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<void>((resolve) => {
    timeoutHandle = setTimeout(resolve, remaining);
    timeoutHandle.unref?.();
  });
  try {
    await Promise.race([promise.then(() => undefined, () => undefined), timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
