import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AD_EXECUTION_REPOSITORY_PORT,
  DEFAULT_LEASE_LIMIT,
  MAX_LEASE_LIMIT,
  type AdExecutionRepositoryPort,
  type ExecutionReportInput,
  type LeaseOptions,
  type WorkerHeartbeatMeta,
} from '../port/out/ad-execution.repository.port';

/**
 * Application orchestration for the worker execution loop. The service:
 *
 * - claims (or creates) a worker row scoped to the organization,
 * - delegates atomic task leasing to the persistence layer,
 * - performs the cross-row worker-key conflict check before reporting a
 *   task transition, and
 * - hands the actual transition write to the tenant-scoped persistence
 *   helper so the task / action / worker rows move together inside one
 *   transaction.
 *
 * Worker-reported error strings are scrubbed for known secret patterns by
 * the persistence helper (`domain/ad-execution-error-scrubber`).
 */
@Injectable()
export class AdExecutionService {
  constructor(
    @Inject(AD_EXECUTION_REPOSITORY_PORT)
    private readonly repo: AdExecutionRepositoryPort,
  ) {}

  async lease(
    workerKey: string,
    options: LeaseOptions | undefined,
    organizationId: string,
  ) {
    const requestedPageType = (options?.pageType || '').trim().toLowerCase();
    const limit = Math.min(
      Math.max(options?.limit || DEFAULT_LEASE_LIMIT, 1),
      MAX_LEASE_LIMIT,
    );

    const worker = await this.repo.upsertWorkerForLease(
      workerKey,
      options,
      organizationId,
    );

    const tasks = await this.repo.leaseQueuedTasks(
      worker,
      requestedPageType,
      limit,
      organizationId,
    );

    return { workerId: worker.workerKey, tasks };
  }

  async heartbeat(
    workerKey: string,
    meta: WorkerHeartbeatMeta | undefined,
    organizationId: string,
  ) {
    await this.repo.heartbeatWorkerOrThrow(workerKey, meta, organizationId);
  }

  async report(body: ExecutionReportInput, organizationId: string) {
    const task = await this.repo.findScopedExecutionTask(body.taskId, organizationId);
    if (!task) throw new NotFoundException('작업을 찾을 수 없습니다.');

    if (task.workerId) {
      const ownerWorkerKey = await this.repo.findTaskWorkerKey(task.workerId, organizationId);
      if (ownerWorkerKey !== body.workerKey) {
        throw new ConflictException('다른 worker가 lease한 작업입니다.');
      }
    }

    await this.repo.reportExecutionTask(body, task, organizationId);
  }
}
