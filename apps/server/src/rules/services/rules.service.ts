import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AGENT_EVENTS, AgentResultReadyEvent } from '../../agent-registry/events/agent-events';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../../automation/application/port/in/agent-runner.port';
import { PANEL_EVENTS } from '../../automation/adapter/out/panel-event/panel-events';
import { alertPanelMapper } from '../../automation/mapper/panel-event/alert.mapper';
import type { RuleItem } from '@kiditem/shared/rules';
import type { EvaluationResult, ProductEvalResult } from './types';

@Injectable()
export class RulesService implements OnModuleInit {
  private readonly logger = new Logger(RulesService.name);

  private static readonly PANEL_EMIT_BATCH_CAP = 50;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedRulesIfEmpty();
  }

  async evaluateAll(companyId: string): Promise<EvaluationResult> {
    const result = await this.agentRunner.runByType('rules_evaluation', {
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
      // 2-1. healthScore 일괄 업데이트 — Prisma updateMany + $transaction.
      // event.companyId 가 신뢰 경계. 각 update 는 (id, companyId) 로 스코프 → 다른 회사 master 가 섞일 수 없음.
      if (products.length > 0) {
        const now = new Date();
        await this.prisma.$transaction(
          products.map((r) =>
            this.prisma.masterProduct.updateMany({
              where: { id: r.masterId, companyId },
              data: { healthScore: r.healthScore, healthUpdatedAt: now },
            }),
          ),
        );
      }

      // 2-2. activity_events 기록
      const events = products.flatMap((r) =>
        r.violations.map((v) => ({
          companyId,
          objectType: 'product',
          objectId: r.masterId,
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
      // Alert.targetType='master' 규약 (alert.mapper spec + drift spec 참조): rule_violation 은 MasterProduct 단위.
      const criticals = products.flatMap((r) =>
        r.violations
          .filter((v) => v.severity === 'critical')
          .map((v) => ({
            companyId,
            targetType: 'master',
            targetId: r.masterId,
            type: 'rule_violation',
            severity: 'critical',
            title: v.message,
            message: v.actionType ?? '',
          })),
      );
      if (criticals.length) {
        const inserted = await this.prisma.alert.createManyAndReturn({ data: criticals });
        // Panel Live Ops: emit after insert — batch cap prevents SSE flood
        try {
          if (inserted.length > RulesService.PANEL_EMIT_BATCH_CAP) {
            // Single summary item instead of N individual emits
            this.eventEmitter.emit(PANEL_EVENTS.UPSERT, {
              item: alertPanelMapper.mapToItem({
                id: randomUUID(),
                companyId,
                targetType: null,
                targetId: null,
                type: 'batch_summary',
                severity: 'info',
                title: `${inserted.length}건의 새 알림`,
                message: null,
                isRead: false,
                actionTaskId: null,
                createdAt: new Date(),
              }),
              companyId,
            });
          } else {
            for (const alert of inserted) {
              this.eventEmitter.emit(PANEL_EVENTS.UPSERT, {
                item: alertPanelMapper.mapToItem(alert),
                companyId,
              });
            }
          }
        } catch (err) {
          this.logger.warn(`Panel emit failed after alert createManyAndReturn (count=${inserted.length}): ${err}`);
        }
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
      this.prisma.masterProduct.count({
        where: { companyId, isDeleted: false, healthScore: { gte: 70 } },
      }),
      this.prisma.masterProduct.count({
        where: { companyId, isDeleted: false, healthScore: { gte: 40, lt: 70 } },
      }),
      this.prisma.masterProduct.count({
        where: { companyId, isDeleted: false, healthScore: { lt: 40 } },
      }),
      this.prisma.masterProduct.count({
        where: { companyId, isDeleted: false },
      }),
      this.prisma.masterProduct.findFirst({
        where: { companyId, isDeleted: false, healthUpdatedAt: { not: null } },
        orderBy: { healthUpdatedAt: 'desc' },
        select: { healthUpdatedAt: true },
      }),
    ]);

    const notEvaluated = total - healthy - warning - critical;

    const topCritical = await this.prisma.masterProduct.findMany({
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

  async updateRule(
    id: string,
    companyId: string,
    data: { threshold?: unknown; active?: boolean; autoExecute?: boolean },
  ) {
    // Tenant-scoped read first — IDOR prevention. Mirrors AlertsService.markAsRead
    // and the kiditem standard pattern in apps/server/AGENTS.md
    // (멀티테넌트 격리 — 회사 스코프).
    const existing = await this.prisma.businessRule.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException('Rule not found');

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
    const result = await this.agentRunner.runByType('rules_suggest', {
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
