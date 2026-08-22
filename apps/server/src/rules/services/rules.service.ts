import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../operations/application/port/in/operation-runner.port';
import { PANEL_EVENTS } from '../../automation/adapter/out/panel-event/panel-events';
import { alertPanelMapper } from '../../automation/mapper/panel-event/alert.mapper';
import {
  RULES_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../application/port/out/cross-domain/operation-alert.port';
import {
  RULES_JUDGMENT_PORT,
  type RulesJudgmentPort,
} from '../application/port/out/cross-domain/rules-judgment.port';
import {
  RULES_EVALUATION_OPERATION_KEY,
} from '../domain/operation/rules.operations';
import type { ApplyRulesEvaluationPort } from '../application/port/in/apply-rules-evaluation.port';
import type { RuleItem } from '@kiditem/shared/rules';
import type { EvaluationResult } from './types';

const RULES_SUGGEST_AGENT_DEFINITION = 'rules_suggest';

@Injectable()
export class RulesService implements ApplyRulesEvaluationPort {
  private readonly logger = new Logger(RulesService.name);

  private static readonly PANEL_EMIT_BATCH_CAP = 50;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OPERATION_RUNNER_PORT)
    private readonly operations: OperationRunnerPort,
    @Inject(RULES_JUDGMENT_PORT)
    private readonly judgment: RulesJudgmentPort,
    private readonly eventEmitter: EventEmitter2,
    @Inject(RULES_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
  ) {}

  async evaluateAll(
    organizationId: string,
    triggeredByUserId: string | null,
  ): Promise<EvaluationResult> {
    if (!triggeredByUserId) {
      throw new Error('RULES_EVALUATION_ACTOR_REQUIRED');
    }

    const operation = await this.operations.start({
      organizationId,
      operationKey: RULES_EVALUATION_OPERATION_KEY,
      triggerSource: 'dashboard',
      input: {},
      requestedByUserId: triggeredByUserId,
      idempotencyKey: `rules.evaluation.manual:${organizationId}:${triggeredByUserId}`,
    });
    await this.operationAlerts.start({
      organizationId,
      operationKey: `rules.evaluation:${operation.id}`,
      type: 'rules_evaluation',
      title: '룰 평가 진행 중',
      sourceType: 'operation_run',
      sourceId: operation.id,
      actorUserId: triggeredByUserId,
      href: '/dashboard',
      metadata: { operationKey: RULES_EVALUATION_OPERATION_KEY },
    });

    this.logger.log(`Rules evaluation queued: operationId=${operation.id}`);
    return { operationId: operation.id, status: operation.status };
  }

  async apply(input: Parameters<ApplyRulesEvaluationPort['apply']>[0]) {
    const { organizationId, operationId, products } = input;
    const operation = await this.operations.get(organizationId, operationId);
    if (operation.operationKey !== RULES_EVALUATION_OPERATION_KEY) {
      throw new NotFoundException('Rules evaluation operation not found');
    }

    try {
      // KidItem 운영 상품별 healthScore 일괄 업데이트.
      const now = new Date();
      await this.prisma.$transaction(
        products.map((r) =>
          this.prisma.masterProduct.updateMany({
            where: { id: r.masterId, organizationId },
            data: { healthScore: r.healthScore, healthUpdatedAt: now },
          }),
        ),
      );

      // 2. activity_events 기록
      const events = products.flatMap((r) =>
        r.violations.map((v) => ({
          organizationId,
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

      // 3. critical alerts 생성 — 평가 payload의 masterId와 동일한
      // KidItem 운영 상품을 대상으로 연결한다.
      const criticals = products.flatMap((r) =>
        r.violations
          .filter((v) => v.severity === 'critical')
          .map((v) => ({
            organizationId,
            targetType: 'product',
            targetId: r.masterId,
            type: 'rule_violation',
            severity: 'critical',
            title: v.message,
            message: v.actionType ?? '',
            href: '/product-hub',
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
                organizationId,
                targetType: null,
                targetId: null,
                kind: 'signal',
                status: 'open',
                type: 'batch_summary',
                severity: 'info',
                title: `${inserted.length}건의 새 알림`,
                message: null,
                operationKey: null,
                sourceType: null,
                sourceId: null,
                actorUserId: null,
                href: '/product-hub',
                progress: null,
                metadata: {},
                isRead: false,
                readAt: null,
                actionTaskId: null,
                startedAt: null,
                finishedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              }),
              organizationId,
            });
          } else {
            for (const alert of inserted) {
              this.eventEmitter.emit(PANEL_EVENTS.UPSERT, {
                item: alertPanelMapper.mapToItem(alert),
                organizationId,
              });
            }
          }
        } catch (err) {
          this.logger.warn(
            `Panel emit failed after alert createManyAndReturn (count=${inserted.length}): ${err}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`Rules evaluation result application failed for operation ${operationId}: ${err}`);
      await this.operationAlerts.fail(
        organizationId,
        `rules.evaluation:${operationId}`,
        { message: err instanceof Error ? err.message : String(err) },
      );
      throw err;
    }

    const violationCount = products.reduce((sum, r) => sum + r.violations.length, 0);
    const criticalCount = products.reduce(
      (sum, r) => sum + r.violations.filter((v) => v.severity === 'critical').length,
      0,
    );
    await this.operationAlerts.succeed(
      organizationId,
      `rules.evaluation:${operationId}`,
      { metadata: { productCount: products.length, violationCount, criticalCount } },
    );
    this.logger.log(
      `Rules evaluation complete: ${products.length} products, ${violationCount} violations`,
    );
    return { productCount: products.length, violationCount, criticalCount };
  }

  async getEvaluationStatus(organizationId: string, operationId: string) {
    const operation = await this.operations.get(organizationId, operationId);
    if (operation.operationKey !== RULES_EVALUATION_OPERATION_KEY) {
      throw new NotFoundException('Rules evaluation operation not found');
    }
    return operation;
  }

  async getSummary(organizationId: string): Promise<{
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
        where: {
          organizationId,
          isActive: true,
          healthScore: { gte: 70 },
        },
      }),
      this.prisma.masterProduct.count({
        where: {
          organizationId,
          isActive: true,
          healthScore: { gte: 40, lt: 70 },
        },
      }),
      this.prisma.masterProduct.count({
        where: {
          organizationId,
          isActive: true,
          healthScore: { lt: 40 },
        },
      }),
      this.prisma.masterProduct.count({
        where: { organizationId, isActive: true },
      }),
      this.prisma.masterProduct.findFirst({
        where: {
          organizationId,
          isActive: true,
          healthUpdatedAt: { not: null },
        },
        orderBy: { healthUpdatedAt: 'desc' },
        select: { healthUpdatedAt: true },
      }),
    ]);

    const notEvaluated = total - healthy - warning - critical;

    const topCriticalRows = await this.prisma.masterProduct.findMany({
      where: {
        organizationId,
        isActive: true,
        healthScore: { lt: 40 },
      },
      orderBy: { healthScore: 'asc' },
      take: 5,
      select: {
        id: true,
        name: true,
        healthScore: true,
        abcGrade: true,
      },
    });
    const topCritical = topCriticalRows.map((product) => ({
      id: product.id,
      name: product.name,
      healthScore: product.healthScore,
      abcGrade: product.abcGrade,
    }));

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

  async findAllRules(organizationId: string, category?: string) {
    const rows = await this.prisma.businessRule.findMany({
      where: {
        organizationId,
        ...(category ? { category } : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
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
    organizationId: string,
    data: { threshold?: unknown; active?: boolean; autoExecute?: boolean },
  ) {
    // Tenant-scoped read first — IDOR prevention. Mirrors AlertsService.markAsRead
    // and the kiditem standard pattern in apps/server/AGENTS.md
    // (멀티테넌트 격리 — 회사 스코프).
    const existing = await this.prisma.businessRule.findFirst({
      where: { id, organizationId },
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

  async suggestThresholds(
    organizationId: string,
    triggeredByUserId: string | null,
  ): Promise<{
    session: string;
    task: string;
    execution: string;
    operation: string;
    status: 'pending';
  }> {
    if (!triggeredByUserId) {
      throw new Error('RULES_SUGGEST_JUDGMENT_ACTOR_REQUIRED');
    }
    const result = await this.judgment.submit({
      organizationId,
      actorUserId: triggeredByUserId,
      objective: 'Suggest business-rule thresholds using the organization data.',
      idempotencyKey: `rules.suggest.manual:${organizationId}:${triggeredByUserId}`,
    });
    await this.operationAlerts.start({
      organizationId,
      operationKey: `rules.suggest:${result.operation}`,
      type: 'rules_suggest',
      title: '룰 임계값 제안 진행 중',
      sourceType: 'operation_run',
      sourceId: result.operation,
      actorUserId: triggeredByUserId,
      href: '/dashboard',
      metadata: { agentDefinition: RULES_SUGGEST_AGENT_DEFINITION },
    });
    return { ...result, status: 'pending' };
  }
}
