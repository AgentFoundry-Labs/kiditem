import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { scrubSecrets } from '@kiditem/shared';

const DEFAULT_LIMIT = 3;
const MAX_SCAN = 50;

@Injectable()
export class AdExecutionService {
  constructor(private readonly prisma: PrismaService) {}

  private async getDefaultCompanyId(): Promise<string> {
    const company = await this.prisma.company.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!company) throw new InternalServerErrorException('회사 정보를 찾을 수 없습니다');
    return company.id;
  }

  async lease(workerKey: string, options?: { label?: string; pageType?: string; limit?: number }) {
    const companyId = await this.getDefaultCompanyId();
    const requestedPageType = (options?.pageType || '').trim().toLowerCase();
    const limit = Math.min(Math.max(options?.limit || DEFAULT_LIMIT, 1), 10);

    const worker = await this.prisma.executionWorker.upsert({
      where: { workerKey },
      update: {
        label: options?.label ?? undefined,
        status: 'online',
        currentPageType: requestedPageType || null,
        lastHeartbeatAt: new Date(),
      },
      create: {
        companyId,
        workerKey,
        label: options?.label ?? null,
        status: 'online',
        currentPageType: requestedPageType || null,
      },
    });

    const candidates = await this.prisma.executionTask.findMany({
      where: {
        status: 'queued',
        action: {
          approvalStatus: 'approved',
          executeStatus: { in: ['queued', 'failed'] },
        },
      },
      include: { action: true },
      orderBy: [{ createdAt: 'asc' }],
      take: MAX_SCAN,
    });

    const selected = candidates
      .filter((task) => {
        const payload = task.action.payload as Record<string, unknown> | null;
        const pageType = String(payload?.pageType || '').toLowerCase();
        if (!requestedPageType || !pageType) return true;
        return pageType === requestedPageType;
      })
      .slice(0, limit);

    if (selected.length === 0) {
      return { workerId: worker.workerKey, tasks: [] };
    }

    const leasedTasks: Array<{
      actionId: string;
      taskId: string;
      actionType: string;
      targetType: string;
      targetLabel: string;
      targetRef: string;
      priority: string;
      executionMode: string;
      payload: Record<string, unknown>;
    }> = [];
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const task of selected) {
        const updated = await tx.executionTask.updateMany({
          where: { id: task.id, status: 'queued' },
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
        await tx.executionWorker.update({
          where: { id: worker.id },
          data: { currentTaskRef: leasedTasks[0].taskId, lastHeartbeatAt: now },
        });
      }
    });

    return { workerId: worker.workerKey, tasks: leasedTasks };
  }

  async heartbeat(workerKey: string, meta?: { currentUrl?: string; currentPageType?: string }) {
    const result = await this.prisma.executionWorker.updateMany({
      where: { workerKey },
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

  async report(body: {
    taskId: string;
    workerKey: string;
    status: 'running' | 'done' | 'failed';
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    errorMessage?: string;
    screenshotPath?: string;
    logs?: Array<{ level?: string; step: string; message: string; payload?: Record<string, unknown> }>;
  }) {
    const task = await this.prisma.executionTask.findUnique({
      where: { id: body.taskId },
      include: { action: true, worker: true },
    });

    if (!task) throw new NotFoundException('작업을 찾을 수 없습니다.');

    if (task.worker?.workerKey && task.worker.workerKey !== body.workerKey) {
      throw new ConflictException('다른 worker가 lease한 작업입니다.');
    }

    const now = new Date();
    const json = (v: unknown): Prisma.InputJsonValue | undefined =>
      v != null ? (v as Prisma.InputJsonValue) : undefined;

    await this.prisma.$transaction(async (tx) => {
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
        await tx.executionTask.update({
          where: { id: body.taskId },
          data: {
            status: 'running',
            startedAt: task.startedAt || now,
            beforeJson: json(body.before) ?? json(task.beforeJson),
          },
        });
        await tx.adAction.update({
          where: { id: task.actionId },
          data: {
            executeStatus: 'running',
            beforeJson: json(body.before) ?? json(task.action.beforeJson),
            errorMessage: null,
          },
        });
      }

      if (body.status === 'done') {
        await tx.executionTask.update({
          where: { id: body.taskId },
          data: {
            status: 'done',
            startedAt: task.startedAt || now,
            finishedAt: now,
            beforeJson: json(body.before) ?? json(task.beforeJson),
            afterJson: json(body.after) ?? json(task.afterJson),
            screenshotPath: body.screenshotPath || task.screenshotPath,
            errorMessage: null,
          },
        });
        await tx.adAction.update({
          where: { id: task.actionId },
          data: {
            executeStatus: 'done',
            executedAt: now,
            beforeJson: json(body.before) ?? json(task.action.beforeJson),
            afterJson: json(body.after) ?? json(task.action.afterJson),
            errorMessage: null,
          },
        });
      }

      if (body.status === 'failed') {
        await tx.executionTask.update({
          where: { id: body.taskId },
          data: {
            status: 'failed',
            startedAt: task.startedAt || now,
            finishedAt: now,
            beforeJson: json(body.before) ?? json(task.beforeJson),
            afterJson: json(body.after) ?? json(task.afterJson),
            screenshotPath: body.screenshotPath || task.screenshotPath,
            errorMessage: scrubSecrets(body.errorMessage || '실행 실패'),
          },
        });
        await tx.adAction.update({
          where: { id: task.actionId },
          data: {
            executeStatus: 'failed',
            beforeJson: json(body.before) ?? json(task.action.beforeJson),
            afterJson: json(body.after) ?? json(task.action.afterJson),
            errorMessage: scrubSecrets(body.errorMessage || '실행 실패'),
          },
        });
      }

      await tx.executionWorker.updateMany({
        where: { workerKey: body.workerKey },
        data: {
          currentTaskRef: body.status === 'running' ? body.taskId : null,
          lastHeartbeatAt: now,
          status: 'online',
        },
      });
    });
  }
}
