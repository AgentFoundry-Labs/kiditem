import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { scrubSecrets } from '@kiditem/shared/security';
import type {
  ActionTask,
  ActionTaskRelatedProduct,
} from '@kiditem/shared/action-task';
import { kstDayStart, kstMonthStart } from '../../../common/kst';
import { generateActionTaskSeeds } from '../../domain/policy/action-seeds';
import {
  ACTION_BOARD_REPOSITORY_PORT,
  type ActionBoardPerListingMetrics,
  type ActionBoardRepositoryPort,
} from '../port/out/repository/action-board.repository.port';
import type { JsonValue } from '../port/persistence-records';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
type RelatedProduct = ActionTaskRelatedProduct;

@Injectable()
export class ActionBoardService {
  constructor(
    @Inject(ACTION_BOARD_REPOSITORY_PORT)
    private readonly repository: ActionBoardRepositoryPort,
  ) {}

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

    const [
      metrics,
      outOfStockSkus,
      mappingAttentionSkus,
      lowCtrCount,
      aGradeReviewRows,
    ] =
      await Promise.all([
        this.repository.fetchPerListingMetrics(organizationId, from, to),
        this.repository.countOutOfStockInventorySkus(organizationId),
        this.repository.countMappingAttentionChannelSkus(organizationId),
        this.repository.countLowCtrThumbnails(organizationId),
        this.repository.findAGradeReviewCounts(organizationId),
      ]);

    const lowReviewCount = aGradeReviewRows.filter(
      (row) => row.reviewCount < 10,
    ).length;

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
    const totalRevenue = metrics.reduce((sum, metric) => sum + metric.revenue, 0);
    const totalAdCost = metrics.reduce((sum, metric) => sum + metric.adCost, 0);
    const adRate = totalRevenue > 0 ? (totalAdCost / totalRevenue) * 100 : 0;

    const seeds = generateActionTaskSeeds({
      minusProducts,
      lowProfitProducts,
      highAdProducts,
      outOfStockSkus,
      mappingAttentionSkus,
      adRate,
      lowCtrProducts: lowCtrCount,
      lowReviewProducts: lowReviewCount,
    });

    for (const seed of seeds) {
      await this.repository.upsertActionTaskSeed({
        organizationId,
        taskKey: seed.taskKey,
        type: seed.type,
        label: seed.label,
        detail: seed.detail ?? null,
        where: seed.where ?? null,
        href: seed.href ?? null,
        priority: seed.priority,
        role: seed.role ?? null,
        apiCall: seed.apiCall ?? null,
        date: today,
      });
    }

    const priorityWeight: Record<string, number> = { urgent: 0, high: 1, medium: 2 };
    const tasks = await this.repository.findActionTasksForDay(organizationId, today);
    tasks.sort((a, b) =>
      (priorityWeight[a.priority] ?? 9) - (priorityWeight[b.priority] ?? 9),
    );

    const relatedMap = this.getRelatedProducts(metrics);

    return tasks.map((t) => ({
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
  }

  async updateTask(
    id: string,
    organizationId: string,
    data: { status?: string; priority?: string },
  ) {
    const task = await this.repository.findActionTaskScoped(id, organizationId);
    if (!task) throw new NotFoundException('Task not found');

    const log = (task.activityLog as Array<Record<string, unknown>>) || [];
    const updates: { status?: string; priority?: string } = {};

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

    return this.repository.updateActionTaskOrThrow(id, organizationId, {
      ...updates,
      activityLog: log as unknown as JsonValue,
    });
  }

  async addNote(id: string, organizationId: string, text: string) {
    const task = await this.repository.findActionTaskScoped(id, organizationId);
    if (!task) throw new NotFoundException('Task not found');

    const notes = (task.notes as Array<Record<string, unknown>>) || [];
    notes.push({ text, createdAt: new Date().toISOString() });

    const log = (task.activityLog as Array<Record<string, unknown>>) || [];
    log.push({ action: 'note_added', timestamp: new Date().toISOString() });

    return this.repository.updateActionTaskOrThrow(id, organizationId, {
      notes: notes as unknown as JsonValue,
      activityLog: log as unknown as JsonValue,
    });
  }

  async executeTask(id: string, organizationId: string) {
    const task = await this.repository.findActionTaskScoped(id, organizationId);
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

      return this.repository.updateActionTaskOrThrow(id, organizationId, {
        result: result as JsonValue,
        status: 'done',
        activityLog: log as unknown as JsonValue,
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

      return this.repository.updateActionTaskOrThrow(id, organizationId, {
        result: { error: scrubSecrets(err instanceof Error ? err.message : String(err)) },
        status: 'done',
        activityLog: log as unknown as JsonValue,
      });
    }
  }

  claim(taskId: string, organizationId: string, userId: string) {
    return this.repository.claimActionTask(taskId, organizationId, userId);
  }

  unclaim(taskId: string, organizationId: string, userId: string) {
    return this.repository.unclaimActionTask(taskId, organizationId, userId);
  }

  async list(
    organizationId: string,
    currentUserId: string,
    opts: { assignedTo?: 'me' | 'team' | 'all' } = {},
  ) {
    const tasks = await this.repository.listActionTasks(organizationId, {
      assignedTo: opts.assignedTo ?? 'all',
      currentUserId,
    });

    const taskIds = tasks.map((t) => t.id);
    const sourceAlerts = await this.repository.findAlertsByTaskIds(
      organizationId,
      taskIds,
    );
    const alertByTaskId = new Map(
      sourceAlerts.map((a) => [a.actionTaskId!, a]),
    );

    return tasks.map((t) => ({
      ...t,
      sourceAlert: alertByTaskId.get(t.id) ?? null,
    }));
  }

  // ── Private helpers ──

  private getRelatedProducts(
    metrics: ActionBoardPerListingMetrics[],
  ): Record<string, RelatedProduct[]> {
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

    return map;
  }
}
