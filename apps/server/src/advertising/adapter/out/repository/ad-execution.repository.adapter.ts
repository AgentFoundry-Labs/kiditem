// Ad-action execution runtime adapter: `ExecutionWorker` / `ExecutionTask` /
// `ExecutionLog`. Each method holds its own race-guard and tenant-scoped
// `updateMany` invariants; `reportExecutionTask` owns the cross-row
// transaction.

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { scrubExecutionError } from '../../../domain/ad-execution-error-scrubber';
import type {
  AdExecutionRepositoryPort,
  ExecutionReportInput,
  LeaseOptions,
  LeasedExecutionTask,
  ScopedExecutionTaskRow,
  WorkerHeartbeatMeta,
} from '../../../application/port/out/repository/ad-execution.repository.port';

const MAX_LEASE_SCAN = 50;

const json = (v: unknown): Prisma.InputJsonValue | undefined =>
  v != null ? (v as Prisma.InputJsonValue) : undefined;

@Injectable()
export class AdExecutionRepositoryAdapter
  implements AdExecutionRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async upsertWorkerForLease(
    workerKey: string,
    options: LeaseOptions | undefined,
    organizationId: string,
  ): Promise<{ id: string; workerKey: string }> {
    const requestedPageType = (options?.pageType || '').trim().toLowerCase();

    const existing = await this.prisma.executionWorker.findFirst({
      where: { workerKey, organizationId },
      select: { id: true },
    });

    if (existing) {
      const updated = await this.prisma.executionWorker.updateMany({
        where: { id: existing.id, organizationId },
        data: {
          label: options?.label ?? undefined,
          status: 'online',
          currentPageType: requestedPageType || null,
          lastHeartbeatAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new NotFoundException(
          `Worker ${workerKey}를 찾을 수 없습니다.`,
        );
      }
      return { id: existing.id, workerKey };
    }

    return this.prisma.executionWorker.create({
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

  async leaseQueuedTasks(
    worker: { id: string; workerKey: string },
    requestedPageType: string,
    limit: number,
    organizationId: string,
  ): Promise<LeasedExecutionTask[]> {
    const candidates = await this.prisma.executionTask.findMany({
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

    await this.prisma.$transaction(async (tx) => {
      for (const task of selected) {
        const updated = await tx.executionTask.updateMany({
          where: {
            id: task.id,
            status: 'queued',
            action: { organizationId },
          },
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
          data: {
            currentTaskRef: leasedTasks[0].taskId,
            lastHeartbeatAt: now,
          },
        });
        if (updated.count === 0) {
          throw new NotFoundException(
            `Worker ${worker.workerKey}를 찾을 수 없습니다.`,
          );
        }
      }
    });

    return leasedTasks;
  }

  async heartbeatWorkerOrThrow(
    workerKey: string,
    meta: WorkerHeartbeatMeta | undefined,
    organizationId: string,
  ): Promise<void> {
    const result = await this.prisma.executionWorker.updateMany({
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

  async findScopedExecutionTask(
    taskId: string,
    organizationId: string,
  ): Promise<ScopedExecutionTaskRow | null> {
    return this.prisma.executionTask.findFirst({
      where: { id: taskId, action: { organizationId } },
      include: { action: true },
    });
  }

  async findTaskWorkerKey(
    workerId: string,
    organizationId: string,
  ): Promise<string | null> {
    const worker = await this.prisma.executionWorker.findFirst({
      where: { id: workerId, organizationId },
      select: { workerKey: true },
    });
    return worker?.workerKey ?? null;
  }

  async reportExecutionTask(
    body: ExecutionReportInput,
    task: ScopedExecutionTaskRow,
    organizationId: string,
  ): Promise<void> {
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
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
        throw new NotFoundException(
          `Worker ${body.workerKey}를 찾을 수 없습니다.`,
        );
      }
    });
  }
}
