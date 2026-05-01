import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { scrubSecrets } from '@kiditem/shared/security';
import type { ActionTask, ActionTaskRelatedProduct } from '@kiditem/shared/action-task';
import {
  buildPerListingMetrics,
  type PerListingMetrics,
} from '../../../common/per-listing-profit';
import { kstDayStart, kstMonthStart } from '../../../common/kst';
import { PrismaService } from '../../../prisma/prisma.service';
import { generateActionTaskSeeds } from '../../domain/policy/action-seeds';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
type RelatedProduct = ActionTaskRelatedProduct;

@Injectable()
export class ActionBoardService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveTodayContext(now: Date = new Date()) {
    const today = kstDayStart(now);
    const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
    const year = kstNow.getUTCFullYear();
    const month = kstNow.getUTCMonth() + 1;
    return {
      today,
      from: kstMonthStart(year, month),
      to: kstMonthStart(year, month + 1),
    };
  }

  async getTasks(organizationId: string) {
    const { today, from, to } = this.resolveTodayContext();

    // 1. Gather warnings data (same logic as dashboard)
    const [metrics, inventoryRows, lowCtrCount, lowReviewCount] =
      await Promise.all([
        buildPerListingMetrics(this.prisma, organizationId, from, to),
        this.prisma.inventory.findMany({
          where: { organizationId, currentStock: { gt: 0 } },
          select: { currentStock: true, reorderPoint: true },
        }),
        this.prisma.thumbnail.count({
          where: { organizationId, ctr: { gt: 0, lt: 1.5 } },
        }),
        this.prisma.masterProduct
          .findMany({
            where: { organizationId, isDeleted: false, abcGrade: 'A' },
            include: {
              listings: {
                where: { organizationId, isDeleted: false },
                select: { _count: { select: { reviews: true } } },
              },
            },
          })
          .then((products) =>
            products.filter(
              (p) => p.listings.reduce((sum, l) => sum + l._count.reviews, 0) < 10,
            ).length,
          ),
      ]);

    const minusProducts = metrics.filter((metric) => metric.netProfit < 0).length;
    const lowProfitProducts = metrics.filter(
      (metric) => metric.profitRate >= 0 && metric.profitRate <= 3,
    ).length;
    const highAdProducts = metrics.filter(
      (metric) =>
        metric.revenue > 0 &&
        metric.adCost > 0 &&
        (metric.adCost / metric.revenue) * 100 > 15,
    ).length;
    const needReorder = inventoryRows.filter(
      (inv) => inv.reorderPoint > 0 && inv.currentStock <= inv.reorderPoint,
    ).length;

    const totalRevenue = metrics.reduce((sum, metric) => sum + metric.revenue, 0);
    const totalAdCost = metrics.reduce((sum, metric) => sum + metric.adCost, 0);
    const adRate = totalRevenue > 0 ? (totalAdCost / totalRevenue) * 100 : 0;

    // 2. Generate task seeds
    const seeds = generateActionTaskSeeds({
      minusProducts,
      lowProfitProducts,
      highAdProducts,
      needReorder,
      adRate,
      lowCtrProducts: lowCtrCount,
      lowReviewProducts: lowReviewCount,
    });

    // 3. Upsert tasks for today
    for (const seed of seeds) {
      await this.prisma.actionTask.upsert({
        where: {
          organizationId_taskKey_date: { organizationId, taskKey: seed.taskKey, date: today },
        },
        create: {
          organizationId,
          taskKey: seed.taskKey,
          type: seed.type,
          label: seed.label,
          detail: seed.detail ?? null,
          where: seed.where ?? null,
          href: seed.href ?? null,
          priority: seed.priority,
          role: seed.role ?? null,
          apiCall: (seed.apiCall ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          date: today,
        },
        update: {
          label: seed.label,
          detail: seed.detail ?? null,
          priority: seed.priority,
        },
      });
    }

    // 4. Fetch today's tasks (sort by priority weight: urgent→high→medium)
    const priorityWeight: Record<string, number> = { urgent: 0, high: 1, medium: 2 };
    const tasks = await this.prisma.actionTask.findMany({
      where: { organizationId, date: today },
      orderBy: { createdAt: 'asc' },
    });
    tasks.sort((a, b) =>
      (priorityWeight[a.priority] ?? 9) - (priorityWeight[b.priority] ?? 9),
    );

    // 5. Attach related products
    const relatedMap = await this.getRelatedProducts(organizationId, metrics);

    const result = tasks.map((t) => ({
      ...t,
      apiCall: t.apiCall as ActionTask['apiCall'],
      result: t.result as ActionTask['result'],
      notes: (t.notes ?? []) as ActionTask['notes'],
      activityLog: (t.activityLog ?? []) as ActionTask['activityLog'],
      date: t.date.toISOString().split('T')[0],
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      relatedProducts: relatedMap[t.taskKey] ?? [],
    })) satisfies ActionTask[];

    return result;
  }

  async updateTask(id: string, organizationId: string, data: { status?: string; priority?: string }) {
    const task = await this.prisma.actionTask.findFirst({ where: { id, organizationId } });
    if (!task) throw new NotFoundException('Task not found');

    const log = (task.activityLog as Array<Record<string, unknown>>) || [];
    const updates: Record<string, unknown> = {};

    if (data.status && data.status !== task.status) {
      log.push({
        action: 'status_changed',
        from: task.status,
        to: data.status,
        timestamp: new Date().toISOString(),
      });
      updates.status = data.status;
    }
    if (data.priority && data.priority !== task.priority) {
      log.push({
        action: 'priority_changed',
        from: task.priority,
        to: data.priority,
        timestamp: new Date().toISOString(),
      });
      updates.priority = data.priority;
    }

    return this.updateActionTaskOrThrow(id, organizationId, {
      ...updates,
      activityLog: log as unknown as Prisma.InputJsonValue,
    });
  }

  async addNote(id: string, organizationId: string, text: string) {
    const task = await this.prisma.actionTask.findFirst({ where: { id, organizationId } });
    if (!task) throw new NotFoundException('Task not found');

    const notes = (task.notes as Array<Record<string, unknown>>) || [];
    notes.push({ text, createdAt: new Date().toISOString() });

    const log = (task.activityLog as Array<Record<string, unknown>>) || [];
    log.push({ action: 'note_added', timestamp: new Date().toISOString() });

    return this.updateActionTaskOrThrow(id, organizationId, {
      notes: notes as unknown as Prisma.InputJsonValue,
      activityLog: log as unknown as Prisma.InputJsonValue,
    });
  }

  async executeTask(id: string, organizationId: string) {
    const task = await this.prisma.actionTask.findFirst({ where: { id, organizationId } });
    if (!task) throw new NotFoundException('Task not found');
    if (!task.apiCall) throw new NotFoundException('No apiCall defined for this task');

    const call = task.apiCall as { url: string; method: string; body?: Record<string, unknown> };
    const baseUrl = process.env.API_SELF_URL || 'http://localhost:4000';

    try {
      const fetchOpts: RequestInit = {
        method: call.method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (call.method !== 'GET' && call.body) {
        fetchOpts.body = JSON.stringify(call.body);
      }

      const res = await fetch(`${baseUrl}${call.url}`, fetchOpts);
      const result = await res.json();

      const log = (task.activityLog as Array<Record<string, unknown>>) || [];
      log.push({
        action: 'executed',
        timestamp: new Date().toISOString(),
        success: res.ok,
      });

      return this.updateActionTaskOrThrow(id, organizationId, {
        result: result as Prisma.InputJsonValue,
        status: 'done',
        activityLog: log as unknown as Prisma.InputJsonValue,
      });
    } catch (err) {
      if (err instanceof NotFoundException) throw err;

      const log = (task.activityLog as Array<Record<string, unknown>>) || [];
      log.push({
        action: 'executed',
        timestamp: new Date().toISOString(),
        success: false,
        detail: err instanceof Error ? err.message : 'Unknown error',
      });

      return this.updateActionTaskOrThrow(id, organizationId, {
        result: { error: scrubSecrets(err instanceof Error ? err.message : String(err)) } as Prisma.InputJsonValue,
        status: 'done',
        activityLog: log as unknown as Prisma.InputJsonValue,
      });
    }
  }

  async claim(taskId: string, organizationId: string, userId: string) {
    const { count } = await this.prisma.actionTask.updateMany({
      where: { id: taskId, organizationId, assigneeUserId: null },
      data: { assigneeUserId: userId },
    });
    if (count === 0) throw new ConflictException('Already claimed or task not found');
    return this.prisma.actionTask.findFirstOrThrow({
      where: { id: taskId, organizationId },
      include: { assigneeUser: { select: { id: true, name: true } } },
    });
  }

  async unclaim(taskId: string, organizationId: string, userId: string) {
    const { count } = await this.prisma.actionTask.updateMany({
      where: { id: taskId, organizationId, assigneeUserId: userId },
      data: { assigneeUserId: null },
    });
    if (count === 0) throw new ConflictException('Not assigned to you or task not found');
    return this.prisma.actionTask.findFirstOrThrow({
      where: { id: taskId, organizationId },
      include: { assigneeUser: { select: { id: true, name: true } } },
    });
  }

  async list(
    organizationId: string,
    currentUserId: string,
    opts: { assignedTo?: 'me' | 'team' | 'all' } = {},
  ) {
    const { assignedTo = 'all' } = opts;
    const where: Prisma.ActionTaskWhereInput = { organizationId };
    if (assignedTo === 'me') {
      where.assigneeUserId = currentUserId;
    } else if (assignedTo === 'team') {
      where.AND = [
        { assigneeUserId: { not: null } },
        { assigneeUserId: { not: currentUserId } },
      ];
    }

    const tasks = await this.prisma.actionTask.findMany({
      where,
      include: { assigneeUser: { select: { id: true, name: true } } },
      orderBy: [{ priority: 'asc' }, { date: 'desc' }],
    });

    // Batch-load sourceAlerts (N+1 방지)
    const taskIds = tasks.map((t) => t.id);
    const sourceAlerts = taskIds.length > 0
      ? await this.prisma.alert.findMany({
          where: { organizationId, actionTaskId: { in: taskIds } },
          select: { id: true, actionTaskId: true, severity: true, type: true, title: true },
        })
      : [];
    const alertByTaskId = new Map(sourceAlerts.map((a) => [a.actionTaskId!, a]));

    return tasks.map((t) => ({
      ...t,
      sourceAlert: alertByTaskId.get(t.id) ?? null,
    }));
  }

  private async updateActionTaskOrThrow(
    id: string,
    organizationId: string,
    data: Prisma.ActionTaskUpdateManyMutationInput,
  ) {
    const { count } = await this.prisma.actionTask.updateMany({
      where: { id, organizationId },
      data,
    });
    if (count === 0) throw new NotFoundException('Task not found');
    return this.prisma.actionTask.findFirstOrThrow({ where: { id, organizationId } });
  }

  // ── Private helpers ──

  private async getRelatedProducts(
    organizationId: string,
    metrics: PerListingMetrics[],
  ): Promise<Record<string, RelatedProduct[]>> {
    const map: Record<string, RelatedProduct[]> = {};
    const highAdRows = metrics
      .filter(
        (metric) =>
          metric.revenue > 0 &&
          metric.adCost > 0 &&
          (metric.adCost / metric.revenue) * 100 > 15,
      )
      .slice(0, 20)
      .map((metric) => ({
        id: metric.masterId,
        name: metric.masterName,
        metric: '광고비율',
        value: `${Math.round((metric.adCost / metric.revenue) * 1000) / 10}%`,
      })) satisfies ActionTaskRelatedProduct[];
    map['h-ad-bid'] = highAdRows;
    map['analyze-ad'] = highAdRows;

    const minusProducts = metrics
      .filter((metric) => metric.netProfit < 0)
      .slice(0, 20)
      .map((metric) => ({
        id: metric.masterId,
        name: metric.masterName,
        metric: '이익률',
        value: metric.revenue > 0 ? `${Math.round(metric.profitRate * 10) / 10}%` : '매출 0',
      })) satisfies ActionTaskRelatedProduct[];
    map['h-minus-ad-stop'] = minusProducts;
    map['h-minus-price'] = minusProducts;
    map['h-price-reset'] = minusProducts;
    map['analyze-deficit'] = minusProducts;

    // Reorder products — Inventory → option → master (2-hop, B2c.dashboard C-03)
    const invWithOption = await this.prisma.inventory.findMany({
      where: {
        organizationId,
        currentStock: { gt: 0 },
        reorderPoint: { gt: 0 },
      },
      include: {
        option: { include: { master: { select: { id: true, name: true } } } },
      },
    });
    map['h-reorder'] = invWithOption
      .filter((inv) => inv.currentStock <= inv.reorderPoint)
      .slice(0, 20)
      .map((inv) => ({
        id: inv.option?.master.id ?? inv.optionId,
        name: inv.option?.master.name ?? 'N/A',
        metric: '재고',
        value: `${inv.currentStock}개 (기준 ${inv.reorderPoint})`,
      })) satisfies ActionTaskRelatedProduct[];
    map['analyze-stock'] = map['h-reorder'];

    return map;
  }
}
