import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_LIMIT = 3;
const MAX_SCAN = 50;
const REDACTED_PLACEHOLDER = '[REDACTED]';
const ERROR_SECRET_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'openai_api_key', re: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: 'bearer_token', re: /(?:^|\s)Bearer\s+[A-Za-z0-9_.-]+/gi },
  { name: 'aws_access_key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'gemini_api_key', re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'jwt', re: /eyJ[A-Za-z0-9_-]+?\.eyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+/g },
  { name: 'pem_block', re: /-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----/g },
  { name: 'wing_cookie', re: /WING[A-Z_]*SESSION[A-Za-z0-9_=-]*/gi },
  { name: 'basic_auth', re: /Basic\s+[A-Za-z0-9+/=]{20,}/gi },
];

function scrubExecutionError(input: string): string {
  if (!input) return input;
  let out = input;
  for (const { name, re } of ERROR_SECRET_PATTERNS) {
    out = out.replace(re, (match) => {
      if (name === 'bearer_token') {
        const lead = match.match(/^\s/)?.[0] ?? '';
        return `${lead}${REDACTED_PLACEHOLDER}`;
      }
      return REDACTED_PLACEHOLDER;
    });
  }
  return out;
}

@Injectable()
export class AdExecutionService {
  constructor(private readonly prisma: PrismaService) {}

  async lease(
    workerKey: string,
    options: { label?: string; pageType?: string; limit?: number } | undefined,
    companyId: string,
  ) {
    const requestedPageType = (options?.pageType || '').trim().toLowerCase();
    const limit = Math.min(Math.max(options?.limit || DEFAULT_LIMIT, 1), 10);

    const existing = await this.prisma.executionWorker.findFirst({
      where: { workerKey, companyId },
      select: { id: true },
    });

    let worker: { id: string; workerKey: string };
    if (existing) {
      const updated = await this.prisma.executionWorker.updateMany({
        where: { id: existing.id, companyId },
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
      worker = { id: existing.id, workerKey };
    } else {
      worker = await this.prisma.executionWorker.create({
        data: {
          companyId,
          workerKey,
          label: options?.label ?? null,
          status: 'online',
          currentPageType: requestedPageType || null,
        },
        select: { id: true, workerKey: true },
      });
    }

    const candidates = await this.prisma.executionTask.findMany({
      where: {
        status: 'queued',
        action: {
          companyId,
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
          where: { id: task.id, status: 'queued', action: { companyId } },
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
          where: { id: worker.id, companyId },
          data: { currentTaskRef: leasedTasks[0].taskId, lastHeartbeatAt: now },
        });
        if (updated.count === 0) {
          throw new NotFoundException(`Worker ${workerKey}를 찾을 수 없습니다.`);
        }
      }
    });

    return { workerId: worker.workerKey, tasks: leasedTasks };
  }

  async heartbeat(
    workerKey: string,
    meta: { currentUrl?: string; currentPageType?: string } | undefined,
    companyId: string,
  ) {
    const result = await this.prisma.executionWorker.updateMany({
      where: { workerKey, companyId },
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

  async report(
    body: {
      taskId: string;
      workerKey: string;
      status: 'running' | 'done' | 'failed';
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
      errorMessage?: string;
      screenshotPath?: string;
      logs?: Array<{ level?: string; step: string; message: string; payload?: Record<string, unknown> }>;
    },
    companyId: string,
  ) {
    const task = await this.prisma.executionTask.findFirst({
      where: { id: body.taskId, action: { companyId } },
      include: { action: true },
    });

    if (!task) throw new NotFoundException('작업을 찾을 수 없습니다.');

    const worker = task.workerId
      ? await this.prisma.executionWorker.findFirst({
          where: { id: task.workerId, companyId },
          select: { workerKey: true },
        })
      : null;

    if (task.workerId && worker?.workerKey !== body.workerKey) {
      throw new ConflictException('다른 worker가 lease한 작업입니다.');
    }

    const now = new Date();
    const json = (v: unknown): Prisma.InputJsonValue | undefined =>
      v != null ? (v as Prisma.InputJsonValue) : undefined;

    await this.prisma.$transaction(async (tx) => {
      const updateTaskOrThrow = async (
        data: Prisma.ExecutionTaskUpdateManyMutationInput,
      ) => {
        const updated = await tx.executionTask.updateMany({
          where: { id: body.taskId, action: { companyId } },
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
          where: { id: task.actionId, companyId },
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
        where: { workerKey: body.workerKey, companyId },
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
}
