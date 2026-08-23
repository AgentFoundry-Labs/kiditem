import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
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
import {
  formatOperationRunName,
  OperationRunIdSchema,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import type { EvaluationResult } from './types';
import {
  evaluateProductRules,
  type EvaluatedProductRules,
  type RuleEvaluationDefinition,
  type RuleFactValue,
} from '../domain/rule-evaluator';

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
    idempotencyKey: string,
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
      idempotencyKey: `rules.evaluation.manual:${triggeredByUserId}:${idempotencyKey}`,
    });
    await this.operationAlerts.start({
      organizationId,
      operationKey: `rules.evaluation:${operation.id}`,
      type: 'rules_evaluation',
      title: '룰 평가 진행 중',
      sourceType: 'operation_run',
      sourceId: formatOperationRunName(
        OrganizationIdSchema.parse(organizationId),
        OperationRunIdSchema.parse(operation.id),
      ),
      actorUserId: triggeredByUserId,
      href: '/dashboard',
      metadata: { operationKey: RULES_EVALUATION_OPERATION_KEY },
    });

    this.logger.log(`Rules evaluation queued: operationId=${operation.id}`);
    return { operationId: operation.id, status: operation.status };
  }

  async evaluateAndApply(
    input: Parameters<ApplyRulesEvaluationPort['evaluateAndApply']>[0],
  ) {
    const { organizationId, operationId } = input;
    const operation = await this.operations.get(organizationId, operationId);
    if (operation.operationKey !== RULES_EVALUATION_OPERATION_KEY) {
      throw new NotFoundException('Rules evaluation operation not found');
    }

    try {
      const applied = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.rulesEvaluationApplication.findUnique({
          where: {
            operationRunId_organizationId: { operationRunId: operationId, organizationId },
          },
          select: { productCount: true, violationCount: true, criticalCount: true },
        });
        if (existing) return { result: existing, insertedAlerts: [] };

        const exactOperation = await tx.operationRun.findFirst({
          where: {
            id: operationId,
            organizationId,
            operationKey: RULES_EVALUATION_OPERATION_KEY,
          },
          select: { id: true },
        });
        if (!exactOperation) throw new NotFoundException('Rules evaluation operation not found');
        const [rules, products] = await Promise.all([
          tx.businessRule.findMany({
            where: { organizationId, active: true },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: {
              name: true, displayName: true, category: true, severity: true,
              field: true, operator: true, threshold: true, messageTemplate: true,
              actionType: true, conditions: true, sortOrder: true,
            },
          }),
          tx.masterProduct.findMany({
            where: { organizationId, isActive: true },
            orderBy: [{ id: 'asc' }],
            select: {
              id: true,
              abcGrade: true,
              adTier: true,
              adBudgetLimit: true,
              healthScore: true,
              abcEvaluation: {
                select: {
                  weightedRevenue: true,
                  weightedOrderTimeCogs: true,
                  weightedAdSpend: true,
                  weightedContributionProfit: true,
                  weightedContributionMargin: true,
                  paidOrderCount: true,
                  observationDays: true,
                },
              },
              inventorySkus: {
                where: { isActive: true },
                select: { currentStock: true },
              },
            },
          }),
        ]);
        const definitions = rules as RuleEvaluationDefinition[];
        const evaluated = products.map((product) => evaluateProductRules(
          { masterId: product.id, values: productFacts(product) },
          definitions,
        ));
        const now = new Date();
        for (const product of evaluated) {
          const updated = await tx.masterProduct.updateMany({
            where: { id: product.masterId, organizationId, isActive: true },
            data: { healthScore: product.healthScore, healthUpdatedAt: now },
          });
          if (updated.count !== 1) throw new Error('RULES_EVALUATION_PRODUCT_DRIFT');
        }
        const events = evaluationEvents(organizationId, operationId, evaluated);
        if (events.length > 0) await tx.activityEvent.createMany({ data: events });
        const alerts = evaluationAlerts(organizationId, operationId, evaluated);
        const insertedAlerts = alerts.length > 0
          ? await tx.alert.createManyAndReturn({ data: alerts })
          : [];
        const result = evaluationCounts(evaluated);
        await tx.rulesEvaluationApplication.create({
          data: { organizationId, operationRunId: operationId, ...result },
        });
        return { result, insertedAlerts };
      });
      this.emitEvaluationAlerts(organizationId, applied.insertedAlerts);
      await this.operationAlerts.succeed(
        organizationId,
        `rules.evaluation:${operationId}`,
        { metadata: applied.result },
      );
      return applied.result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.rulesEvaluationApplication.findUnique({
          where: {
            operationRunId_organizationId: { operationRunId: operationId, organizationId },
          },
          select: { productCount: true, violationCount: true, criticalCount: true },
        });
        if (existing) return existing;
      }
      this.logger.error(
        `Rules deterministic evaluation failed for operation ${operationId}: ${error}`,
      );
      throw error;
    }
  }

  private emitEvaluationAlerts(
    organizationId: string,
    inserted: ReadonlyArray<Parameters<typeof alertPanelMapper.mapToItem>[0]>,
  ): void {
    try {
      if (inserted.length > RulesService.PANEL_EMIT_BATCH_CAP) {
        this.eventEmitter.emit(PANEL_EVENTS.UPSERT, {
          item: alertPanelMapper.mapToItem({
            id: randomUUID(), organizationId, targetType: null, targetId: null,
            kind: 'signal', status: 'open', type: 'batch_summary', severity: 'info',
            title: `${inserted.length}건의 새 알림`, message: null, operationKey: null,
            sourceType: null, sourceId: null, actorUserId: null, href: '/product-hub',
            progress: null, metadata: {}, isRead: false, readAt: null,
            actionTaskId: null, startedAt: null, finishedAt: null,
            createdAt: new Date(), updatedAt: new Date(),
          }),
          organizationId,
        });
        return;
      }
      for (const alert of inserted) {
        this.eventEmitter.emit(PANEL_EVENTS.UPSERT, {
          item: alertPanelMapper.mapToItem(alert),
          organizationId,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Panel emit failed after Rules evaluation alerts (count=${inserted.length}): ${error}`,
      );
    }
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
    idempotencyKey: string,
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
    const [summary, rules] = await Promise.all([
      this.getSummary(organizationId),
      this.findAllRules(organizationId),
    ]);
    const evidence = JSON.stringify({
      summary,
      rules: rules.slice(0, 100).map((rule) => ({
        id: rule.id,
        category: rule.category,
        severity: rule.severity,
        field: rule.field,
        operator: rule.operator,
        threshold: rule.threshold,
        active: rule.active,
      })),
    }).slice(0, 7_200);
    const result = await this.judgment.submit({
      organizationId,
      actorUserId: triggeredByUserId,
      objective: `Suggest business-rule thresholds from this current owner snapshot:\n${evidence}`,
      idempotencyKey: `rules.suggest.manual:${triggeredByUserId}:${idempotencyKey}`,
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

function productFacts(product: {
  abcGrade: string | null;
  adTier: string | null;
  adBudgetLimit: number | null;
  healthScore: number | null;
  abcEvaluation: {
    weightedRevenue: Prisma.Decimal | null;
    weightedOrderTimeCogs: Prisma.Decimal | null;
    weightedAdSpend: Prisma.Decimal | null;
    weightedContributionProfit: Prisma.Decimal | null;
    weightedContributionMargin: Prisma.Decimal | null;
    paidOrderCount: number;
    observationDays: number;
  } | null;
  inventorySkus: Array<{ currentStock: number }>;
}): Record<string, RuleFactValue> {
  const evaluation = product.abcEvaluation;
  const revenue = finiteDecimal(evaluation?.weightedRevenue);
  const cogs = finiteDecimal(evaluation?.weightedOrderTimeCogs);
  const adSpend = finiteDecimal(evaluation?.weightedAdSpend);
  const contributionProfit = finiteDecimal(evaluation?.weightedContributionProfit);
  const contributionMargin = finiteDecimal(evaluation?.weightedContributionMargin);
  const currentStock = product.inventorySkus.length > 0
    ? product.inventorySkus.reduce((sum, sku) => sum + sku.currentStock, 0)
    : null;
  const orderCount = evaluation?.paidOrderCount ?? null;
  const observationDays = evaluation?.observationDays ?? null;
  const avgDailySales = orderCount !== null && observationDays && observationDays > 0
    ? orderCount / observationDays
    : null;
  const adRate = revenue !== null && revenue !== 0 && adSpend !== null
    ? (adSpend / revenue) * 100
    : null;
  return {
    abcGrade: product.abcGrade,
    adTier: product.adTier,
    adBudgetLimit: product.adBudgetLimit,
    healthScore: product.healthScore,
    revenue,
    netProfit: contributionProfit,
    profitRate: revenue !== null && revenue !== 0 && contributionProfit !== null
      ? (contributionProfit / revenue) * 100
      : null,
    margin: contributionMargin === null ? null : contributionMargin * 100,
    costRate: revenue !== null && revenue !== 0 && cogs !== null ? (cogs / revenue) * 100 : null,
    adRate,
    adCostRate: adRate,
    currentStock,
    avgDailySales,
    daysOfStock: currentStock !== null && avgDailySales !== null && avgDailySales > 0
      ? currentStock / avgDailySales
      : null,
    orderCount,
  };
}

function finiteDecimal(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const number = value.toNumber();
  return Number.isFinite(number) ? number : null;
}

function evaluationCounts(products: readonly EvaluatedProductRules[]) {
  return {
    productCount: products.length,
    violationCount: products.reduce((sum, product) => sum + product.violations.length, 0),
    criticalCount: products.reduce(
      (sum, product) => sum + product.violations.filter((violation) => violation.severity === 'critical').length,
      0,
    ),
  };
}

function evaluationEvents(
  organizationId: string,
  operationId: string,
  products: readonly EvaluatedProductRules[],
) {
  return products.flatMap((product) => product.violations.map((violation) => ({
    organizationId,
    objectType: 'product',
    objectId: product.masterId,
    eventType: 'rule_violation',
    source: 'rules.evaluate',
    title: violation.message,
    data: { ...violation, operationId },
  })));
}

function evaluationAlerts(
  organizationId: string,
  operationId: string,
  products: readonly EvaluatedProductRules[],
) {
  return products.flatMap((product) => product.violations
    .filter((violation) => violation.severity === 'critical')
    .map((violation) => ({
      organizationId,
      targetType: 'product',
      targetId: product.masterId,
      type: 'rule_violation',
      severity: 'critical',
      title: violation.message,
      message: violation.actionType ?? '',
      operationKey: `rules.evaluation.violation:${operationId}:${product.masterId}:${violation.ruleName}`,
      sourceType: 'operation_run',
      sourceId: operationId,
      href: '/product-hub',
      metadata: { ruleName: violation.ruleName, field: violation.field },
    })));
}
