import { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { scrubExecutionError } from '../../../domain/ad-execution-error-scrubber';

/**
 * Tenant-scoped writers for the `ExecutionWorker` / `ExecutionTask` /
 * `ExecutionLog` runtime. Each helper is the single place that holds the
 * cross-row invariant the service used to mix with orchestration:
 *
 * - `upsertExecutionWorkerForLease` — find-or-create the worker row scoped
 *   to `(workerKey, organizationId)` so cross-tenant `workerKey` collisions cannot
 *   pin the wrong row.
 * - `leaseQueuedTasks` — atomically claim N queued tasks for the worker via
 *   tenant-scoped `updateMany` race-guards and update the worker pointer in
 *   the same transaction.
 * - `heartbeatWorkerOrThrow` — tenant-scoped heartbeat that throws when no
 *   row matches so a stale worker key cannot silently no-op.
 * - `findScopedExecutionTask` / `reportExecutionTask` — split read/write so
 *   the orchestration layer can run the worker-key conflict check before
 *   committing a task/action transition.
 */

export const DEFAULT_LEASE_LIMIT = 3;
export const MAX_LEASE_SCAN = 50;
export const MAX_LEASE_LIMIT = 10;

export type LeaseOptions = { label?: string; pageType?: string; limit?: number };

export type LeasedExecutionTask = {
  actionId: string;
  taskId: string;
  actionType: string;
  targetType: string;
  targetLabel: string;
  targetRef: string;
  priority: string;
  executionMode: 'browser';
  payload: Record<string, unknown>;
};

export type ScopedExecutionTask = Prisma.ExecutionTaskGetPayload<{
  include: { action: true };
}>;

export type ExecutionReportInput = {
  taskId: string;
  workerKey: string;
  status: 'running' | 'done' | 'failed';
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  errorMessage?: string;
  screenshotPath?: string;
  logs?: Array<{
    level?: string;
    step: string;
    message: string;
    payload?: Record<string, unknown>;
  }>;
};

const json = (v: unknown): Prisma.InputJsonValue | undefined =>
  v != null ? (v as Prisma.InputJsonValue) : undefined;

/**
 * Find or create the worker row scoped to `(workerKey, organizationId)`. The
 * tenant scope is applied to the update path via `updateMany` so a worker
 * row from another organization cannot be reused by mistake.
 */
export async function upsertExecutionWorkerForLease(
  prisma: PrismaService,
  workerKey: string,
  options: LeaseOptions | undefined,
  organizationId: string,
): Promise<{ id: string; workerKey: string }> {
  const requestedPageType = (options?.pageType || '').trim().toLowerCase();

  const existing = await prisma.executionWorker.findFirst({
    where: { workerKey, organizationId },
    select: { id: true },
  });

  if (existing) {
    const updated = await prisma.executionWorker.updateMany({
      where: { id: existing.id, organizationId },
      data: {
        label: options?.label ?? undefined,
        status: 'online',
        currentPageType: requestedPageType || null,
        lastHeartbeatAt: new Date(),
      },
    });
    if (updated.count === 0) {
      throw new NotFoundException(`Worker ${workerKey}를 찾을 수 없습니다.`);
    }
    return { id: existing.id, workerKey };
  }

  return prisma.executionWorker.create({
    data: {
      organizationId,
      workerKey,
      label: options?.label ?? null,
      status: 'online',
      currentPageType: requestedPageType || null,
    },
    select: { id: true, workerKey: true },
  });
}

/**
 * Atomically lease up to `limit` queued tasks owned by `organizationId`. The
 * `updateMany` race-guard (`status: 'queued'` predicate) ensures only the
 * winning worker captures a contended task — losers simply skip the row.
 *
 * The worker pointer (`currentTaskRef`) and heartbeat are updated inside the
 * same transaction so the lease is observable atomically.
 */
export async function leaseQueuedTasks(
  prisma: PrismaService,
  worker: { id: string; workerKey: string },
  requestedPageType: string,
  limit: number,
  organizationId: string,
): Promise<LeasedExecutionTask[]> {
  const candidates = await prisma.executionTask.findMany({
    where: {
      status: 'queued',
      action: {
        organizationId,
        approvalStatus: 'approved',
        executeStatus: { in: ['queued', 'failed'] },
      },
    },
    include: { action: true },
    orderBy: [{ createdAt: 'asc' }],
    take: MAX_LEASE_SCAN,
  });

  const selected = candidates
    .filter((task) => {
      const payload = task.action.payload as Record<string, unknown> | null;
      const pageType = String(payload?.pageType || '').toLowerCase();
      if (!requestedPageType || !pageType) return true;
      return pageType === requestedPageType;
    })
    .slice(0, limit);

  if (selected.length === 0) return [];

  const leasedTasks: LeasedExecutionTask[] = [];
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const task of selected) {
      const updated = await tx.executionTask.updateMany({
        where: { id: task.id, status: 'queued', action: { organizationId } },
        data: {
          status: 'leased',
          workerId: worker.id,
          leasedAt: now,
          attempt: { increment: 1 },
        },
      });
      if (updated.count === 0) continue;

      leasedTasks.push({
        actionId: task.actionId,
        taskId: task.id,
        actionType: task.action.actionType,
        targetType: task.action.targetType,
        targetLabel: task.action.targetLabel,
        targetRef: task.action.externalId || task.action.targetLabel,
        priority: task.action.priority,
        executionMode: 'browser',
        payload: (task.action.payload as Record<string, unknown>) ?? {},
      });
    }

    if (leasedTasks.length > 0) {
      const updated = await tx.executionWorker.updateMany({
        where: { id: worker.id, organizationId },
        data: { currentTaskRef: leasedTasks[0].taskId, lastHeartbeatAt: now },
      });
      if (updated.count === 0) {
        throw new NotFoundException(`Worker ${worker.workerKey}를 찾을 수 없습니다.`);
      }
    }
  });

  return leasedTasks;
}

/**
 * Tenant-scoped heartbeat that throws when no row matches so a stale or
 * cross-tenant `workerKey` cannot silently no-op.
 */
export async function heartbeatWorkerOrThrow(
  prisma: PrismaService,
  workerKey: string,
  meta: { currentUrl?: string; currentPageType?: string } | undefined,
  organizationId: string,
): Promise<void> {
  const result = await prisma.executionWorker.updateMany({
    where: { workerKey, organizationId },
    data: {
      lastHeartbeatAt: new Date(),
      status: 'online',
      currentUrl: meta?.currentUrl ?? undefined,
      currentPageType: meta?.currentPageType ?? undefined,
    },
  });

  if (result.count === 0) {
    throw new NotFoundException(`Worker ${workerKey}를 찾을 수 없습니다.`);
  }
}

/**
 * Tenant-scoped task lookup for the report path. Returns `null` when the
 * task does not exist for the organization so the orchestration layer can throw
 * a `NotFoundException` after the read but before any write.
 */
export async function findScopedExecutionTask(
  prisma: PrismaService,
  taskId: string,
  organizationId: string,
): Promise<ScopedExecutionTask | null> {
  return prisma.executionTask.findFirst({
    where: { id: taskId, action: { organizationId } },
    include: { action: true },
  });
}

/**
 * Look up the worker row that currently owns the task, scoped to the
 * organization. Returns the worker key for the conflict check or `null` when the
 * task is not currently leased to a worker in this organization.
 */
export async function findTaskWorkerKey(
  prisma: PrismaService,
  workerId: string,
  organizationId: string,
): Promise<string | null> {
  const worker = await prisma.executionWorker.findFirst({
    where: { id: workerId, organizationId },
    select: { workerKey: true },
  });
  return worker?.workerKey ?? null;
}

/**
 * Persist the worker-reported task transition together with the matching
 * `AdAction` state change in a single transaction. All writes are scoped to
 * `organizationId` and the helper throws `NotFoundException` when any row update
 * becomes a no-op so a partial report cannot land.
 *
 * Error messages are scrubbed via `scrubExecutionError` before they reach
 * either row.
 */
export async function reportExecutionTask(
  prisma: PrismaService,
  body: ExecutionReportInput,
  task: ScopedExecutionTask,
  organizationId: string,
): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const updateTaskOrThrow = async (
      data: Prisma.ExecutionTaskUpdateManyMutationInput,
    ) => {
      const updated = await tx.executionTask.updateMany({
        where: { id: body.taskId, action: { organizationId } },
        data,
      });
      if (updated.count === 0) {
        throw new NotFoundException('작업을 찾을 수 없습니다.');
      }
    };
    const updateActionOrThrow = async (
      data: Prisma.AdActionUpdateManyMutationInput,
    ) => {
      const updated = await tx.adAction.updateMany({
        where: { id: task.actionId, organizationId },
        data,
      });
      if (updated.count === 0) {
        throw new NotFoundException('액션을 찾을 수 없습니다.');
      }
    };

    if (body.logs && body.logs.length > 0) {
      await tx.executionLog.createMany({
        data: body.logs.map((log) => ({
          taskId: body.taskId,
          level: log.level || 'info',
          step: log.step,
          message: log.message,
          payloadJson: json(log.payload) ?? Prisma.JsonNull,
        })),
      });
    }

    if (body.status === 'running') {
      await updateTaskOrThrow({
        status: 'running',
        startedAt: task.startedAt || now,
        beforeJson: json(body.before) ?? json(task.beforeJson),
      });
      await updateActionOrThrow({
        executeStatus: 'running',
        beforeJson: json(body.before) ?? json(task.action.beforeJson),
        errorMessage: null,
      });
    }

    if (body.status === 'done') {
      await updateTaskOrThrow({
        status: 'done',
        startedAt: task.startedAt || now,
        finishedAt: now,
        beforeJson: json(body.before) ?? json(task.beforeJson),
        afterJson: json(body.after) ?? json(task.afterJson),
        screenshotPath: body.screenshotPath || task.screenshotPath,
        errorMessage: null,
      });
      await updateActionOrThrow({
        executeStatus: 'done',
        executedAt: now,
        beforeJson: json(body.before) ?? json(task.action.beforeJson),
        afterJson: json(body.after) ?? json(task.action.afterJson),
        errorMessage: null,
      });
    }

    if (body.status === 'failed') {
      await updateTaskOrThrow({
        status: 'failed',
        startedAt: task.startedAt || now,
        finishedAt: now,
        beforeJson: json(body.before) ?? json(task.beforeJson),
        afterJson: json(body.after) ?? json(task.afterJson),
        screenshotPath: body.screenshotPath || task.screenshotPath,
        errorMessage: scrubExecutionError(body.errorMessage || '실행 실패'),
      });
      await updateActionOrThrow({
        executeStatus: 'failed',
        beforeJson: json(body.before) ?? json(task.action.beforeJson),
        afterJson: json(body.after) ?? json(task.action.afterJson),
        errorMessage: scrubExecutionError(body.errorMessage || '실행 실패'),
      });
    }

    const workerUpdated = await tx.executionWorker.updateMany({
      where: { workerKey: body.workerKey, organizationId },
      data: {
        currentTaskRef: body.status === 'running' ? body.taskId : null,
        lastHeartbeatAt: now,
        status: 'online',
      },
    });
    if (workerUpdated.count === 0) {
      throw new NotFoundException(`Worker ${body.workerKey}를 찾을 수 없습니다.`);
    }
  });
}
