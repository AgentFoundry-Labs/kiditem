import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_LEASE_LIMIT,
  MAX_LEASE_LIMIT,
  findScopedExecutionTask,
  findTaskWorkerKey,
  heartbeatWorkerOrThrow,
  leaseQueuedTasks,
  reportExecutionTask,
  upsertExecutionWorkerForLease,
  type ExecutionReportInput,
  type LeaseOptions,
} from '../adapter/out/prisma/ad-execution.persistence';

/**
 * Application orchestration for the worker execution loop. The service:
 *
 * - claims (or creates) a worker row scoped to the company,
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
  constructor(private readonly prisma: PrismaService) {}

  async lease(
    workerKey: string,
    options: LeaseOptions | undefined,
    companyId: string,
  ) {
    const requestedPageType = (options?.pageType || '').trim().toLowerCase();
    const limit = Math.min(
      Math.max(options?.limit || DEFAULT_LEASE_LIMIT, 1),
      MAX_LEASE_LIMIT,
    );

    const worker = await upsertExecutionWorkerForLease(
      this.prisma,
      workerKey,
      options,
      companyId,
    );

    const tasks = await leaseQueuedTasks(
      this.prisma,
      worker,
      requestedPageType,
      limit,
      companyId,
    );

    return { workerId: worker.workerKey, tasks };
  }

  async heartbeat(
    workerKey: string,
    meta: { currentUrl?: string; currentPageType?: string } | undefined,
    companyId: string,
  ) {
    await heartbeatWorkerOrThrow(this.prisma, workerKey, meta, companyId);
  }

  async report(body: ExecutionReportInput, companyId: string) {
    const task = await findScopedExecutionTask(this.prisma, body.taskId, companyId);
    if (!task) throw new NotFoundException('작업을 찾을 수 없습니다.');

    if (task.workerId) {
      const ownerWorkerKey = await findTaskWorkerKey(this.prisma, task.workerId, companyId);
      if (ownerWorkerKey !== body.workerKey) {
        throw new ConflictException('다른 worker가 lease한 작업입니다.');
      }
    }

    await reportExecutionTask(this.prisma, body, task, companyId);
  }
}
