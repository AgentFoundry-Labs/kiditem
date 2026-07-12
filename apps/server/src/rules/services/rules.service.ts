import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../../agent-os/application/port/in/agent-runner.port';
import { AgentObservabilityService } from '../../agent-os/application/service/agent-observability.service';
import { PANEL_EVENTS } from '../../automation/adapter/out/panel-event/panel-events';
import { LEGACY_FAMILY_MASTER_SCOPE } from '../../common/legacy-family-master-scope';
import { alertPanelMapper } from '../../automation/mapper/panel-event/alert.mapper';
import {
  RULES_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../application/port/out/cross-domain/operation-alert.port';
import type { RuleItem } from '@kiditem/shared/rules';
import type { EvaluationResult, ProductEvalResult } from './types';

const RULES_EVALUATION_AGENT_TYPE = 'rules_evaluation';
const RULES_SUGGEST_AGENT_TYPE = 'rules_suggest';
const RULES_EVALUATION_SOURCE = 'rules.evaluation';
const RULES_SUGGEST_SOURCE = 'rules.suggest';

/**
 * Public payload describing a rules-evaluation result that the rules domain
 * post-processes (healthScore bulk update + activity events + critical
 * alerts + panel emission).
 *
 * Under Agent OS the run runtime writes its `resultJson` to the
 * `AgentRun` row. Adapters that bridge Agent OS run completion back to the
 * rules domain pass this shape into `RulesService.processEvaluationResult`.
 */
export interface RulesEvaluationResultPayload {
  organizationId: string;
  runId: string;
  /**
   * Optional identity of the originating `AgentRunRequest`. When the bridging
   * adapter passes this, the rules domain closes the user-triggered operation
   * alert keyed by `rules.evaluation:<requestId>`.
   */
  requestId?: string;
  products: ProductEvalResult[];
}

@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);

  private static readonly PANEL_EMIT_BATCH_CAP = 50;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
    private readonly observability: AgentObservabilityService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(RULES_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
  ) {}

  async evaluateAll(
    organizationId: string,
    triggeredByUserId: string | null,
  ): Promise<EvaluationResult> {
    const result = await this.agentRunner.runByType(RULES_EVALUATION_AGENT_TYPE, {
      organizationId,
      sourceType: RULES_EVALUATION_SOURCE,
      payload: { organization_id: organizationId },
      ...(triggeredByUserId ? { requestedByUserId: triggeredByUserId } : {}),
    });

    if (!result.ok) {
      this.logger.warn(
        `Rules evaluation could not be queued (reason=${result.reason ?? 'unknown'})`,
      );
      return { requestId: undefined, status: result.status ?? 'unavailable' };
    }

    // Operation alert: surface the queued evaluation in the dashboard
    // notification ledger. The closing transition (succeed/fail) lands when
    // the bridging adapter calls `processEvaluationResult` with `requestId`.
    if (result.requestId) {
      await this.operationAlerts.start({
        organizationId,
        operationKey: `rules.evaluation:${result.requestId}`,
        type: 'rules_evaluation',
        title: '룰 평가 진행 중',
        sourceType: 'agent_run_request',
        sourceId: result.requestId,
        actorUserId: triggeredByUserId,
        href: '/dashboard',
        metadata: { agentType: RULES_EVALUATION_AGENT_TYPE },
      });
    }

    this.logger.log(`Rules evaluation queued: requestId=${result.requestId}`);
    return { requestId: result.requestId, status: result.status ?? 'pending' };
  }

  /**
   * Post-process a rules-evaluation run result. Replaces the legacy
   * `@OnEvent(AGENT_EVENTS.RESULT_READY)` callback. Agent OS writes the
   * result to `AgentRun.resultJson` on completion; the bridging adapter
   * invokes this method with the parsed product list.
   */
  async processEvaluationResult(payload: RulesEvaluationResultPayload): Promise<void> {
    const { organizationId, runId, requestId, products } = payload;
    if (!organizationId || products.length === 0) {
      return;
    }

    try {
      // 1. healthScore 일괄 업데이트 — Prisma updateMany + $transaction.
      // organizationId 가 신뢰 경계. 각 update 는 (id, organizationId) 로 스코프 → 다른 회사 master 가 섞일 수 없음.
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

      // 3. critical alerts 생성
      // Alert.targetType='master' 규약 (alert.mapper spec + drift spec 참조): rule_violation 은 MasterProduct 단위.
      const criticals = products.flatMap((r) =>
        r.violations
          .filter((v) => v.severity === 'critical')
          .map((v) => ({
            organizationId,
            targetType: 'master',
            targetId: r.masterId,
            type: 'rule_violation',
            severity: 'critical',
            title: v.message,
            message: v.actionType ?? '',
            href: `/product-hub/${r.masterId}`,
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
      this.logger.error(`Rules post-processing failed for run ${runId}: ${err}`);
      if (requestId) {
        await this.operationAlerts.fail(
          organizationId,
          `rules.evaluation:${requestId}`,
          { message: err instanceof Error ? err.message : String(err) },
        );
      }
      const violationCount = products.reduce((sum, r) => sum + r.violations.length, 0);
      this.logger.log(
        `Rules evaluation complete: ${products.length} products, ${violationCount} violations`,
      );
      return;
    }

    const violationCount = products.reduce((sum, r) => sum + r.violations.length, 0);
    if (requestId) {
      await this.operationAlerts.succeed(
        organizationId,
        `rules.evaluation:${requestId}`,
        {
          metadata: {
            productCount: products.length,
            violationCount,
            criticalCount: products.reduce(
              (sum, r) => sum + r.violations.filter((v) => v.severity === 'critical').length,
              0,
            ),
            runId,
          },
        },
      );
    }
    this.logger.log(
      `Rules evaluation complete: ${products.length} products, ${violationCount} violations`,
    );
  }

  /**
   * Read run-request status from Agent OS observability. Replaces the legacy
   * direct AgentTask row lookup.
   */
  async getEvaluationStatus(organizationId: string, requestId: string) {
    const request = await this.observability.findRequest({ organizationId, requestId });
    if (!request) {
      throw new NotFoundException('Rules evaluation request not found');
    }
    return request;
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
          isDeleted: false,
          ...LEGACY_FAMILY_MASTER_SCOPE,
          healthScore: { gte: 70 },
        },
      }),
      this.prisma.masterProduct.count({
        where: {
          organizationId,
          isDeleted: false,
          ...LEGACY_FAMILY_MASTER_SCOPE,
          healthScore: { gte: 40, lt: 70 },
        },
      }),
      this.prisma.masterProduct.count({
        where: {
          organizationId,
          isDeleted: false,
          ...LEGACY_FAMILY_MASTER_SCOPE,
          healthScore: { lt: 40 },
        },
      }),
      this.prisma.masterProduct.count({
        where: { organizationId, isDeleted: false, ...LEGACY_FAMILY_MASTER_SCOPE },
      }),
      this.prisma.masterProduct.findFirst({
        where: {
          organizationId,
          isDeleted: false,
          ...LEGACY_FAMILY_MASTER_SCOPE,
          healthUpdatedAt: { not: null },
        },
        orderBy: { healthUpdatedAt: 'desc' },
        select: { healthUpdatedAt: true },
      }),
    ]);

    const notEvaluated = total - healthy - warning - critical;

    const topCritical = await this.prisma.masterProduct.findMany({
      where: {
        organizationId,
        isDeleted: false,
        ...LEGACY_FAMILY_MASTER_SCOPE,
        healthScore: { lt: 40 },
      },
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
  ): Promise<{ requestId: string | undefined; status: string }> {
    const result = await this.agentRunner.runByType(RULES_SUGGEST_AGENT_TYPE, {
      organizationId,
      sourceType: RULES_SUGGEST_SOURCE,
      payload: { organization_id: organizationId },
      ...(triggeredByUserId ? { requestedByUserId: triggeredByUserId } : {}),
    });

    if (!result.ok) {
      return { requestId: undefined, status: result.status ?? 'unavailable' };
    }

    if (result.requestId) {
      await this.operationAlerts.start({
        organizationId,
        operationKey: `rules.suggest:${result.requestId}`,
        type: 'rules_suggest',
        title: '룰 임계값 제안 진행 중',
        sourceType: 'agent_run_request',
        sourceId: result.requestId,
        actorUserId: triggeredByUserId,
        href: '/dashboard',
        metadata: { agentType: RULES_SUGGEST_AGENT_TYPE },
      });
    }

    return { requestId: result.requestId, status: result.status ?? 'pending' };
  }
}
