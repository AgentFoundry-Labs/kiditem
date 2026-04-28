import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { scrubSecrets } from '@kiditem/shared';
import type { ActionTask, ActionTaskRelatedProduct } from '@kiditem/shared';
import {
  buildPerListingMetrics,
  type PerListingMetrics,
} from '../common/per-listing-profit';
import { kstDayStart, kstMonthStart } from '../common/kst';
import { PrismaService } from '../prisma/prisma.service';
import type { TaskSeed, RelatedProduct } from './types';

export type { RelatedProduct } from './types';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

@Injectable()
export class ActionTaskService {
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

  async getTasks(companyId: string) {
    const { today, from, to } = this.resolveTodayContext();

    // 1. Gather warnings data (same logic as dashboard)
    const [metrics, inventoryRows, lowCtrCount, lowReviewCount] =
      await Promise.all([
        buildPerListingMetrics(this.prisma, companyId, from, to),
        this.prisma.inventory.findMany({
          where: { companyId, currentStock: { gt: 0 } },
          select: { currentStock: true, reorderPoint: true },
        }),
        this.prisma.thumbnail.count({
          where: { companyId, ctr: { gt: 0, lt: 1.5 } },
        }),
        this.prisma.masterProduct
          .findMany({
            where: { companyId, isDeleted: false, abcGrade: 'A' },
            include: {
              listings: {
                where: { companyId, isDeleted: false },
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
    const seeds = this.generateSeeds({
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
          companyId_taskKey_date: { companyId, taskKey: seed.taskKey, date: today },
        },
        create: {
          companyId,
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
      where: { companyId, date: today },
      orderBy: { createdAt: 'asc' },
    });
    tasks.sort((a, b) =>
      (priorityWeight[a.priority] ?? 9) - (priorityWeight[b.priority] ?? 9),
    );

    // 5. Attach related products
    const relatedMap = await this.getRelatedProducts(companyId, metrics);

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

  async updateTask(id: string, companyId: string, data: { status?: string; priority?: string }) {
    const task = await this.prisma.actionTask.findFirst({ where: { id, companyId } });
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

    return this.prisma.actionTask.update({
      where: { id },
      data: { ...updates, activityLog: log as unknown as Prisma.InputJsonValue },
    });
  }

  async addNote(id: string, companyId: string, text: string) {
    const task = await this.prisma.actionTask.findFirst({ where: { id, companyId } });
    if (!task) throw new NotFoundException('Task not found');

    const notes = (task.notes as Array<Record<string, unknown>>) || [];
    notes.push({ text, createdAt: new Date().toISOString() });

    const log = (task.activityLog as Array<Record<string, unknown>>) || [];
    log.push({ action: 'note_added', timestamp: new Date().toISOString() });

    return this.prisma.actionTask.update({
      where: { id },
      data: {
        notes: notes as unknown as Prisma.InputJsonValue,
        activityLog: log as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async executeTask(id: string, companyId: string) {
    const task = await this.prisma.actionTask.findFirst({ where: { id, companyId } });
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

      return this.updateActionTaskOrThrow(id, companyId, {
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

      return this.updateActionTaskOrThrow(id, companyId, {
        result: { error: scrubSecrets(err instanceof Error ? err.message : String(err)) } as Prisma.InputJsonValue,
        status: 'done',
        activityLog: log as unknown as Prisma.InputJsonValue,
      });
    }
  }

  async claim(taskId: string, companyId: string, userId: string) {
    const { count } = await this.prisma.actionTask.updateMany({
      where: { id: taskId, companyId, assigneeUserId: null },
      data: { assigneeUserId: userId },
    });
    if (count === 0) throw new ConflictException('Already claimed or task not found');
    return this.prisma.actionTask.findFirstOrThrow({
      where: { id: taskId, companyId },
      include: { assigneeUser: { select: { id: true, name: true } } },
    });
  }

  async unclaim(taskId: string, companyId: string, userId: string) {
    const { count } = await this.prisma.actionTask.updateMany({
      where: { id: taskId, companyId, assigneeUserId: userId },
      data: { assigneeUserId: null },
    });
    if (count === 0) throw new ConflictException('Not assigned to you or task not found');
    return this.prisma.actionTask.findFirstOrThrow({
      where: { id: taskId, companyId },
      include: { assigneeUser: { select: { id: true, name: true } } },
    });
  }

  async list(
    companyId: string,
    currentUserId: string,
    opts: { assignedTo?: 'me' | 'team' | 'all' } = {},
  ) {
    const { assignedTo = 'all' } = opts;
    const where: Prisma.ActionTaskWhereInput = { companyId };
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
          where: { companyId, actionTaskId: { in: taskIds } },
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
    companyId: string,
    data: Prisma.ActionTaskUpdateManyMutationInput,
  ) {
    const { count } = await this.prisma.actionTask.updateMany({
      where: { id, companyId },
      data,
    });
    if (count === 0) throw new NotFoundException('Task not found');
    return this.prisma.actionTask.findFirstOrThrow({ where: { id, companyId } });
  }

  // ── Private helpers ──

  private generateSeeds(w: {
    minusProducts: number;
    lowProfitProducts: number;
    highAdProducts: number;
    needReorder: number;
    adRate: number;
    lowCtrProducts: number;
    lowReviewProducts: number;
  }): TaskSeed[] {
    const seeds: TaskSeed[] = [];

    if (w.highAdProducts > 0) {
      seeds.push({
        taskKey: 'h-ad-bid', type: 'human',
        label: `광고비 초과 ${w.highAdProducts}개 — 입찰가 하향 조정`,
        detail: '쿠팡 광고센터에서 해당 상품 입찰가를 낮추거나 일예산 축소',
        where: '쿠팡 광고센터', priority: 'urgent', role: 'ad', href: '/ads-hub',
      });
    }
    if (w.minusProducts > 0) {
      seeds.push({
        taskKey: 'h-minus-ad-stop', type: 'human',
        label: `적자 상품 ${w.minusProducts}개 — 광고 중단 처리`,
        detail: '쿠팡 광고센터에서 적자 상품 캠페인 OFF 처리',
        where: '쿠팡 광고센터', priority: 'urgent', role: 'ad', href: '/cleanup',
      });
      seeds.push({
        taskKey: 'h-minus-price', type: 'human',
        label: `적자 상품 ${w.minusProducts}개 — 판매가 인상 검토`,
        detail: '경쟁사 가격 확인 후 마진 확보 가능한 상품 가격 조정',
        where: '쿠팡 윙', priority: 'high', role: 'finance', href: '/cleanup',
      });
    }
    if (w.needReorder > 0) {
      seeds.push({
        taskKey: 'h-reorder', type: 'human',
        label: `${w.needReorder}개 상품 — 매입처에 발주`,
        detail: '안전재고 이하 상품을 매입처에 발주서 전송',
        where: '매입처/1688', priority: 'high', role: 'inventory', href: '/purchase-orders',
      });
    }
    if (w.adRate > 12) {
      seeds.push({
        taskKey: 'h-ad-rate', type: 'human',
        label: `전체 광고비율 ${Math.round(w.adRate * 10) / 10}% — 비효율 캠페인 정리`,
        detail: 'ROAS 200% 미만 캠페인을 쿠팡 광고센터에서 OFF 또는 입찰가 50% 하향',
        where: '쿠팡 광고센터', priority: 'high', role: 'ad',
      });
    }
    if (w.lowProfitProducts > 0) {
      seeds.push({
        taskKey: 'h-low-profit', type: 'human',
        label: `저이익 ${w.lowProfitProducts}개 — 소싱처/수수료 재검토`,
        detail: '원가 절감 가능한 소싱처 확인, 카테고리 수수료율 점검',
        where: '소싱처/쿠팡 윙', priority: 'medium', role: 'finance', href: '/cleanup',
      });
    }
    if (w.lowCtrProducts > 0) {
      seeds.push({
        taskKey: 'h-thumbnail', type: 'human',
        label: `썸네일 개선 필요 ${w.lowCtrProducts}개 — CTR 1.5% 미만`,
        detail: '메인 이미지 교체, 텍스트 삽입, 배경 정리로 클릭률 개선',
        where: '포토샵/쿠팡 윙', priority: 'high', role: 'data', href: '/thumbnails',
      });
    }
    if (w.lowReviewProducts > 0) {
      seeds.push({
        taskKey: 'h-review', type: 'human',
        label: `A등급 리뷰 부족 ${w.lowReviewProducts}개 — 리뷰 확보 필요`,
        detail: '리뷰 이벤트 진행, 구매 후 리뷰 요청 문자 발송',
        where: '쿠팡 윙/CS', priority: 'medium', role: 'data', href: '/reviews',
      });
    }
    if (w.minusProducts > 0) {
      seeds.push({
        taskKey: 'h-price-reset', type: 'human',
        label: `적자 ${w.minusProducts}개 — 가격 구성 전략 재검토`,
        detail: '원가+수수료+광고비 합산 후 최소 마진 확보 가격으로 재설정',
        where: '쿠팡 윙', priority: 'high', role: 'finance', href: '/profit-loss',
      });
    }
    seeds.push({
      taskKey: 'h-ad-csv', type: 'human',
      label: '쿠팡 광고센터 리포트 다운로드 & 업로드',
      detail: '광고센터 → 리포트 다운로드(CSV) → 여기에 업로드해서 데이터 갱신',
      where: '쿠팡 광고센터 → 업로드', priority: 'medium', role: 'ad',
    });

    // AI actions
    seeds.push({
      taskKey: 'recalc-grade', type: 'ai',
      label: 'ABC 등급 재계산', detail: '14일 매출 기반 등급 재산정 + 변동 리포트',
      priority: 'high', role: 'data',
      apiCall: { url: '/api/products/calculate-grades', method: 'POST', body: {} },
    });
    if (w.minusProducts > 0) {
      seeds.push({
        taskKey: 'analyze-deficit', type: 'ai',
        label: `적자 상품 ${w.minusProducts}개 분석`,
        detail: '적자 원인 분석: 광고비 과다 / 원가 문제 / 가격 오류',
        priority: 'urgent', role: 'finance',
        apiCall: { url: '/api/products?status=active&sortBy=profitRate&sortDir=asc&period=14', method: 'GET' },
      });
    }
    seeds.push({
      taskKey: 'analyze-ad-rules', type: 'ai',
      label: '광고 자동규칙 전략 분석',
      detail: 'A/B/C 등급별 광고 규칙 평가 → 수정 요청 생성',
      priority: 'urgent', role: 'ad',
      apiCall: { url: '/api/ad-rules', method: 'GET' },
    });
    if (w.highAdProducts > 0) {
      seeds.push({
        taskKey: 'analyze-ad', type: 'ai',
        label: `광고비 초과 ${w.highAdProducts}개 분석`,
        detail: 'ROAS/CTR 분석 → 중단/축소/유지 판단',
        priority: 'high', role: 'ad',
        apiCall: { url: '/api/products?sortBy=revenue&sortDir=desc&period=14', method: 'GET' },
      });
    }
    if (w.needReorder > 0) {
      seeds.push({
        taskKey: 'analyze-stock', type: 'ai',
        label: `재고 부족 ${w.needReorder}개 분석`,
        detail: '판매속도 대비 재고일수 계산 → 발주 추천량',
        priority: 'high', role: 'inventory',
        apiCall: { url: '/api/inventory', method: 'GET' },
      });
    }
    if (w.lowCtrProducts > 0) {
      seeds.push({
        taskKey: 'analyze-ctr', type: 'ai',
        label: `썸네일 CTR 분석 (${w.lowCtrProducts}개)`,
        detail: 'CTR 1.5% 미만 상품 → 개선 우선순위',
        priority: 'medium', role: 'data',
        apiCall: { url: '/api/products?sortBy=revenue&sortDir=desc&period=14', method: 'GET' },
      });
    }
    seeds.push({
      taskKey: 'analyze-category', type: 'ai',
      label: '카테고리별 성과 분석',
      detail: '카테고리별 매출/이익률/ROAS 비교',
      priority: 'medium', role: 'finance',
      apiCall: { url: '/api/coupang/category', method: 'GET' },
    });

    return seeds;
  }

  private async getRelatedProducts(
    companyId: string,
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
        companyId,
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
