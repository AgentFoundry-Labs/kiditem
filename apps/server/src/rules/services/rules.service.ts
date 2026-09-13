import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canonicalOwnerInputHash } from '../../common/owner-idempotency-key';
import { PrismaService } from '../../prisma/prisma.service';
import { SourceFailureAlerts, type RuleViolationAlertInput } from '../../alerts/alerts.service';
import {
  readProductAbcPublication,
  readPublishedProductAbcGrades,
} from '../../products/read/product-abc-publication.reader';
import {
  evaluateProductRules,
  type EvaluatedProductRules,
  type RuleEvaluationDefinition,
  type RuleFactValue,
} from '../domain/rule-evaluator';
import type { RuleItem } from '@kiditem/shared/rules';
import type { ProductAbcEvaluation } from '@kiditem/shared/product-abc';
import type { EvaluationResult } from './types';

type ProductHealthSummary = Readonly<{
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  notEvaluated: number;
  lastEvaluatedAt: Date | null;
  topCritical: { id: string; name: string; healthScore: number | null; abcGrade: string | null }[];
}>;

@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async evaluateAll(
    input: {
      organizationId: string;
      requestedByUserId: string | null;
      idempotencyKey: string;
    },
  ): Promise<EvaluationResult> {
    const { organizationId, requestedByUserId, idempotencyKey } = input;
    if (!requestedByUserId) {
      throw new Error('RULES_EVALUATION_ACTOR_REQUIRED');
    }
    if (!idempotencyKey.trim()) {
      throw new Error('RULES_EVALUATION_IDEMPOTENCY_KEY_REQUIRED');
    }
    const requestId = rulesRequestId(organizationId, requestedByUserId, idempotencyKey);

    try {
      const receipt = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.rulesEvaluationApplication.findUnique({
          where: {
            organizationId_requestId: { organizationId, requestId },
          },
          select: {
            requestId: true,
            productCount: true,
            violationCount: true,
            criticalCount: true,
            appliedAt: true,
          },
        });
        if (existing) return existing;

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
              adTier: true,
              adBudgetLimit: true,
              healthScore: true,
              inventorySkus: {
                where: { isActive: true },
                select: { currentStock: true },
              },
            },
          }),
        ]);
        const publication = await readProductAbcPublication(tx, {
          organizationId,
          masterProductIds: products.map(({ id }) => id),
        });
        const evaluationByProductId = new Map(publication.products.map((product) => [
          product.masterProductId,
          product.evaluation,
        ]));
        const definitions = rules as RuleEvaluationDefinition[];
        const evaluated = products.map((product) => evaluateProductRules(
          {
            masterId: product.id,
            values: productFacts({
              ...product,
              abcEvaluation: evaluationByProductId.get(product.id) ?? null,
            }),
          },
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
        const events = evaluationEvents(organizationId, requestId, evaluated);
        if (events.length > 0) await tx.activityEvent.createMany({ data: events });
        // The Alert row shape is the alerts module's, not this one's.
        await this.alerts.openRuleViolations(tx, evaluationViolations(
          organizationId,
          requestId,
          requestedByUserId,
          evaluated,
        ));
        const result = evaluationCounts(evaluated);
        return tx.rulesEvaluationApplication.create({
          data: { organizationId, requestId, ...result },
          select: {
            requestId: true,
            productCount: true,
            violationCount: true,
            criticalCount: true,
            appliedAt: true,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return evaluationResult(receipt);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === 'P2002' || error.code === 'P2034')) {
        // A concurrent identical request can commit while this snapshot is
        // waiting to update a product. Return only that exact committed receipt.
        const existing = await this.prisma.rulesEvaluationApplication.findUnique({
          where: {
            organizationId_requestId: { organizationId, requestId },
          },
          select: {
            requestId: true,
            productCount: true,
            violationCount: true,
            criticalCount: true,
            appliedAt: true,
          },
        });
        if (existing) return evaluationResult(existing);
      }
      this.logger.error(
        `Rules deterministic evaluation failed for request ${requestId}: ${error}`,
      );
      throw error;
    }
  }

  async getSummary(organizationId: string): Promise<ProductHealthSummary> {
    return this.prisma.$transaction(
      (tx) => this.getSummarySnapshot(tx, organizationId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async getSummarySnapshot(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<ProductHealthSummary> {
    const healthy = await tx.masterProduct.count({
      where: {
        organizationId,
        isActive: true,
        healthScore: { gte: 70 },
      },
    });
    const warning = await tx.masterProduct.count({
      where: {
        organizationId,
        isActive: true,
        healthScore: { gte: 40, lt: 70 },
      },
    });
    const critical = await tx.masterProduct.count({
      where: {
        organizationId,
        isActive: true,
        healthScore: { lt: 40 },
      },
    });
    const total = await tx.masterProduct.count({
      where: { organizationId, isActive: true },
    });
    const lastEval = await tx.masterProduct.findFirst({
      where: {
        organizationId,
        isActive: true,
        healthUpdatedAt: { not: null },
      },
      orderBy: { healthUpdatedAt: 'desc' },
      select: { healthUpdatedAt: true },
    });

    const notEvaluated = total - healthy - warning - critical;

    const topCriticalRows = await tx.masterProduct.findMany({
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
      },
    });
    const gradeByProductId = await readPublishedProductAbcGrades(tx, {
      organizationId,
      masterProductIds: topCriticalRows.map(({ id }) => id),
    });
    const topCritical = topCriticalRows.map((product) => ({
      id: product.id,
      name: product.name,
      healthScore: product.healthScore,
      abcGrade: gradeByProductId.get(product.id) ?? null,
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
    // and the kiditem standard pattern in apps/server/CLAUDE.md
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

}

function productFacts(product: {
  adTier: string | null;
  adBudgetLimit: number | null;
  healthScore: number | null;
  abcEvaluation: Pick<
    ProductAbcEvaluation,
    | 'abcGrade'
    | 'weightedRevenue'
    | 'weightedOrderTimeSupplyCost'
    | 'weightedAdvertisingSpend'
    | 'weightedOperatingProfit'
    | 'operatingMargin'
  > | null;
  inventorySkus: Array<{ currentStock: number }>;
}): Record<string, RuleFactValue> {
  const evaluation = product.abcEvaluation;
  const revenue = finiteNumber(evaluation?.weightedRevenue);
  const cogs = finiteNumber(evaluation?.weightedOrderTimeSupplyCost);
  const adSpend = finiteNumber(evaluation?.weightedAdvertisingSpend);
  const operatingProfit = finiteNumber(evaluation?.weightedOperatingProfit);
  const operatingMargin = finiteNumber(evaluation?.operatingMargin);
  const currentStock = product.inventorySkus.length > 0
    ? product.inventorySkus.reduce((sum, sku) => sum + sku.currentStock, 0)
    : null;
  const adRate = revenue !== null && revenue !== 0 && adSpend !== null
    ? (adSpend / revenue) * 100
    : null;
  return {
    abcGrade: evaluation?.abcGrade ?? null,
    adTier: product.adTier,
    adBudgetLimit: product.adBudgetLimit,
    healthScore: product.healthScore,
    revenue,
    netProfit: operatingProfit,
    profitRate: operatingMargin === null ? null : operatingMargin * 100,
    margin: operatingMargin === null ? null : operatingMargin * 100,
    costRate: revenue !== null && revenue !== 0 && cogs !== null ? (cogs / revenue) * 100 : null,
    adRate,
    adCostRate: adRate,
    currentStock,
    avgDailySales: null,
    daysOfStock: null,
    orderCount: null,
  };
}

function finiteNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) ? value : null;
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

type EvaluationReceipt = {
  requestId: string;
  productCount: number;
  violationCount: number;
  criticalCount: number;
  appliedAt: Date;
};

function rulesRequestId(
  organizationId: string,
  requestedByUserId: string,
  idempotencyKey: string,
): string {
  return canonicalOwnerInputHash({
    organizationId,
    requestedByUserId,
    idempotencyKey: idempotencyKey.trim(),
  });
}

function evaluationResult(receipt: EvaluationReceipt): EvaluationResult {
  return {
    requestId: receipt.requestId,
    status: 'completed',
    productCount: receipt.productCount,
    violationCount: receipt.violationCount,
    criticalCount: receipt.criticalCount,
    evaluatedAt: receipt.appliedAt,
  };
}

function evaluationEvents(
  organizationId: string,
  requestId: string,
  products: readonly EvaluatedProductRules[],
) {
  return products.flatMap((product) => product.violations.map((violation) => ({
    organizationId,
    objectType: 'product',
    objectId: product.masterId,
    eventType: 'rule_violation',
    source: 'rules.evaluate',
    title: violation.message,
    data: { ...violation, requestId },
  })));
}

/** What was violated, in Rules' own words. The row shape belongs to alerts. */
function evaluationViolations(
  organizationId: string,
  requestId: string,
  requestedByUserId: string,
  products: readonly EvaluatedProductRules[],
): RuleViolationAlertInput[] {
  return products.flatMap((product) => product.violations
    .filter((violation) => violation.severity === 'critical')
    .map((violation) => ({
      organizationId,
      masterProductId: product.masterId,
      ruleName: violation.ruleName,
      title: violation.message,
      message: violation.actionType ?? '',
      evaluationId: requestId,
      actorUserId: requestedByUserId,
      metadata: { requestId, ruleName: violation.ruleName, field: violation.field },
    })));
}
