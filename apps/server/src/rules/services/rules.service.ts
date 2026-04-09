import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';
import { AGENT_EVENTS, AgentResultReadyEvent } from '../../agent-registry/events/agent-events';
import type { RuleItem } from '@kiditem/shared';
import type { EvaluationResult, ProductEvalResult } from './types';

export type { EvaluationResult } from './types';

@Injectable()
export class RulesService implements OnModuleInit {
  private readonly logger = new Logger(RulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRegistry: AgentRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedRulesIfEmpty();
  }

  async evaluateAll(companyId: string): Promise<EvaluationResult> {
    const def = await this.agentRegistry.findByType('rules_evaluation');

    const result = await this.agentRegistry.run(def.id, {
      companyId,
      extra: { company_id: companyId },
    });

    this.logger.log(`Rules evaluation spawned: ${result.taskId}`);
    return { taskId: result.taskId, status: 'running' };
  }

  @OnEvent(AGENT_EVENTS.RESULT_READY)
  async onResultReady(event: AgentResultReadyEvent): Promise<void> {
    if (event.agentType !== 'rules_evaluation') return;

    const companyId = event.companyId;
    const products = (event.resultJson.products as ProductEvalResult[]) || [];

    try {
      // 2-1. healthScore 일괄 업데이트
      if (products.length > 0) {
        const cases = products
          .map((r) => `WHEN id = '${r.productId}'::uuid THEN ${r.healthScore}`)
          .join(' ');
        const ids = products.map((r) => `'${r.productId}'::uuid`).join(',');

        await this.prisma.$executeRawUnsafe(`
          UPDATE products
          SET health_score = CASE ${cases} END,
              health_updated_at = NOW()
          WHERE id IN (${ids})
        `);
      }

      // 2-2. activity_events 기록
      const events = products.flatMap((r) =>
        r.violations.map((v) => ({
          companyId,
          objectType: 'product',
          objectId: r.productId,
          eventType: 'rule_violation',
          source: 'agent:claude_cli',
          title: v.message,
          data: {
            severity: v.severity,
            category: v.category,
            actionType: v.actionType,
            value: v.value,
            field: v.field,
          },
        })),
      );
      if (events.length) {
        await this.prisma.activityEvent.createMany({ data: events });
      }

      // 2-3. critical alerts 생성
      const criticals = products.flatMap((r) =>
        r.violations
          .filter((v) => v.severity === 'critical')
          .map((v) => ({
            companyId,
            productId: r.productId,
            type: 'rule_violation',
            severity: 'critical',
            title: v.message,
            message: v.actionType ?? '',
          })),
      );
      if (criticals.length) {
        await this.prisma.alert.createMany({ data: criticals });
      }
    } catch (err) {
      this.logger.error(`Rules post-processing failed for run ${event.runId}: ${err}`);
    }

    const violationCount = products.reduce((sum, r) => sum + r.violations.length, 0);
    this.logger.log(
      `Rules evaluation complete: ${products.length} products, ${violationCount} violations`,
    );
  }

  async getEvaluationStatus(taskId: string) {
    return this.prisma.agentTask.findUnique({
      where: { id: taskId },
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
  }

  async getSummary(companyId: string): Promise<{
    total: number;
    healthy: number;
    warning: number;
    critical: number;
    notEvaluated: number;
    lastEvaluatedAt: Date | null;
    topCritical: { id: string; name: string; healthScore: number | null; abcGrade: string | null }[];
  }> {
    const [healthy, warning, critical, total, lastEval] = await Promise.all([
      this.prisma.product.count({
        where: { companyId, isDeleted: false, healthScore: { gte: 70 } },
      }),
      this.prisma.product.count({
        where: { companyId, isDeleted: false, healthScore: { gte: 40, lt: 70 } },
      }),
      this.prisma.product.count({
        where: { companyId, isDeleted: false, healthScore: { lt: 40 } },
      }),
      this.prisma.product.count({
        where: { companyId, isDeleted: false },
      }),
      this.prisma.product.findFirst({
        where: { companyId, isDeleted: false, healthUpdatedAt: { not: null } },
        orderBy: { healthUpdatedAt: 'desc' },
        select: { healthUpdatedAt: true },
      }),
    ]);

    const notEvaluated = total - healthy - warning - critical;

    const topCritical = await this.prisma.product.findMany({
      where: { companyId, isDeleted: false, healthScore: { lt: 40 } },
      orderBy: { healthScore: 'asc' },
      take: 5,
      select: { id: true, name: true, healthScore: true, abcGrade: true },
    });

    return {
      total,
      healthy,
      warning,
      critical,
      notEvaluated,
      lastEvaluatedAt: lastEval?.healthUpdatedAt ?? null,
      topCritical,
    };
  }

  async findAllRules(companyId: string, category?: string) {
    const rows = await this.prisma.businessRule.findMany({
      where: {
        companyId,
        ...(category ? { category } : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      name: r.name,
      displayName: r.displayName,
      description: r.description,
      category: r.category,
      severity: r.severity,
      field: r.field,
      operator: r.operator,
      threshold: r.threshold as Record<string, unknown>,
      messageTemplate: r.messageTemplate,
      actionType: r.actionType,
      conditions: r.conditions as Record<string, unknown> | null,
      autoExecute: r.autoExecute,
      active: r.active,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    } satisfies RuleItem));
  }

  async updateRule(id: string, data: { threshold?: unknown; active?: boolean; autoExecute?: boolean }) {
    return this.prisma.businessRule.update({
      where: { id },
      data: {
        ...(data.threshold !== undefined ? { threshold: data.threshold as object } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.autoExecute !== undefined ? { autoExecute: data.autoExecute } : {}),
      },
    });
  }

  async suggestThresholds(companyId: string): Promise<{ taskId: string | undefined; status: string }> {
    const def = await this.agentRegistry.findByType('rules_suggest');

    const result = await this.agentRegistry.run(def.id, {
      companyId,
      extra: { company_id: companyId },
    });

    return { taskId: result.taskId, status: 'running' };
  }

  // ── Private ──

  private async seedRulesIfEmpty(): Promise<void> {
    const firstCompany = await this.prisma.company.findFirst();
    if (!firstCompany) return;

    const existing = await this.prisma.businessRule.count({
      where: { companyId: firstCompany.id },
    });
    if (existing > 0) return;

    this.logger.warn('No rules in DB — seed manually or use RULES.md');
  }
}
