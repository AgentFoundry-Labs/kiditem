import { Inject, Injectable } from '@nestjs/common';
import {
  OPERATION_REPOSITORY_PORT,
  type OperationRunRecord,
  type OperationRunRepositoryPort,
} from '../port/out/repository/operation.repository.port';
import { OperationDispatcherService } from './operation-dispatcher.service';
import type { OperationDispatchControls } from './operation-dispatcher.service';
import { resolveOperationRunLeaseMs } from './operation-runtime.config';

@Injectable()
export class OperationAttemptExecutorService {
  private readonly leaseMs = resolveOperationRunLeaseMs();
  private readonly activeControllers = new Set<AbortController>();
  private shutdownReason: unknown;

  constructor(
    private readonly dispatcher: OperationDispatcherService,
    @Inject(OPERATION_REPOSITORY_PORT)
    private readonly repository: OperationRunRepositoryPort,
  ) {}

  abortAll(reason: unknown = new Error('operation_server_shutdown')): void {
    this.shutdownReason = reason;
    for (const controller of this.activeControllers) {
      if (!controller.signal.aborted) controller.abort(reason);
    }
  }

  async execute(run: OperationRunRecord): Promise<void> {
    if (!run.attemptToken) throw new Error('operation_attempt_token_missing');
    if (this.shutdownReason !== undefined) return;
    const attemptToken = run.attemptToken;
    const controller = new AbortController();
    this.activeControllers.add(controller);
    try {
      let deadlineExceeded = false;

      const performCheckpoint: OperationDispatchControls['checkpoint'] = async (
        update = {},
      ) => {
        controller.signal.throwIfAborted();
        const now = new Date();
        let heartbeat: OperationRunRecord | null;
        try {
          heartbeat = await this.repository.heartbeatRun({
            organizationId: run.organizationId,
            runId: run.id,
            attemptToken,
            now,
            leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
            ...update,
          });
        } catch (error) {
          const reason = new Error('operation_attempt_heartbeat_failed') as Error & {
            cause?: unknown;
          };
          reason.cause = error;
          controller.abort(reason);
          throw reason;
        }
        if (!heartbeat) {
          const reason = new Error('operation_attempt_fence_lost');
          controller.abort(reason);
          throw reason;
        }
      };
      let heartbeatQueue = Promise.resolve();
      const checkpoint: OperationDispatchControls['checkpoint'] = (
        update = {},
      ) => {
        const next = heartbeatQueue.then(() => performCheckpoint(update));
        heartbeatQueue = next.catch(() => undefined);
        return next;
      };

      const heartbeatInterval = setInterval(() => {
        void checkpoint().catch((error: unknown) => {
          if (!controller.signal.aborted) controller.abort(error);
        });
      }, Math.max(1, Math.floor(this.leaseMs / 3)));
      heartbeatInterval.unref?.();
      const deadlineDelayMs = run.deadlineAt
        ? Math.max(0, run.deadlineAt.getTime() - Date.now())
        : 0;
      const deadlineTimer = setTimeout(() => {
        deadlineExceeded = true;
        controller.abort(new Error('operation_deadline_exceeded'));
      }, deadlineDelayMs);
      deadlineTimer.unref?.();

      try {
        await this.dispatcher.dispatch(run, {
          signal: controller.signal,
          checkpoint,
        });
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      } finally {
        clearInterval(heartbeatInterval);
        clearTimeout(deadlineTimer);
        await heartbeatQueue;
      }

      if (deadlineExceeded) {
        const finishedAt = new Date();
        await this.repository.transition({
          organizationId: run.organizationId,
          runId: run.id,
          expectedStatuses: ['running'],
          expectedAttemptToken: attemptToken,
          status: 'failed',
          errorCode: 'operation_deadline_exceeded',
          errorMessage: 'Operation execution deadline exceeded',
          finishedAt,
          claimedBy: null,
          attemptToken: null,
          claimedAt: null,
          leaseExpiresAt: null,
        });
      } else if (
        isWorkerShutdown(controller.signal.reason) &&
        run.claimedBy !== null
      ) {
        await this.repository.cancelClaimedAttemptForLifecycle({
          organizationId: run.organizationId,
          runId: run.id,
          expectedAttemptToken: attemptToken,
          claimedBy: run.claimedBy,
          errorCode: 'operation_server_shutdown',
          finishedAt: new Date(),
        }).catch(() => false);
      }
    } finally {
      this.activeControllers.delete(controller);
    }
  }
}

function isWorkerShutdown(reason: unknown): boolean {
  return reason instanceof Error && reason.message === 'operation_server_shutdown';
}
