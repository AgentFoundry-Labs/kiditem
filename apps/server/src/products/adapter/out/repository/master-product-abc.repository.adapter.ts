import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { MasterProductAbcEvaluation, ProductAbcGrade } from '@kiditem/shared/product-abc';
import type {
  MasterProductAbcPolicyRecord,
  MasterProductAbcRepositoryPort,
} from '../../../application/port/out/repository/master-product-abc.repository.port';

@Injectable()
export class MasterProductAbcRepositoryAdapter implements MasterProductAbcRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findPolicy(organizationId: string): Promise<MasterProductAbcPolicyRecord | null> {
    const row = await this.prisma.masterProductAbcPolicy.findUnique({ where: { organizationId } });
    return row ? toPolicy(row) : null;
  }

  async publishGrades(input: {
    organizationId: string;
    policy: MasterProductAbcPolicyRecord;
    sourceCapturedAt: Date | null;
    grades: ReadonlyMap<string, ProductAbcGrade | null>;
    evaluations: ReadonlyMap<string, MasterProductAbcEvaluation>;
    metricValues: ReadonlyMap<string, number | null>;
    allowPolicyReplacement?: boolean;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`kiditem.master-product-abc:${input.organizationId}`}, 0::bigint)
        )::text AS "lock"
      `);
      const persistedPolicy = await tx.masterProductAbcPolicy.findUnique({
        where: { organizationId: input.organizationId },
      });
      const persistedRevision = persistedPolicy?.revision ?? 0;
      if (
        persistedRevision !== input.policy.revision
        || (
          persistedPolicy
          && !input.allowPolicyReplacement
          && !samePolicyConfig(persistedPolicy, input.policy)
        )
      ) {
        return {
          changedProductCount: 0,
          policy: persistedPolicy
            ? toPolicy(persistedPolicy)
            : {
              ...input.policy,
              revision: 0,
              lastCalculatedAt: null,
              sourceCapturedAt: null,
            },
          stale: true,
        };
      }
      const ids = [...input.grades.keys()].sort();
      const current = ids.length === 0 ? [] : await tx.masterProduct.findMany({
        where: { organizationId: input.organizationId, id: { in: ids } },
        select: { id: true, abcGrade: true, isActive: true },
      });
      const changed = current.flatMap((row) => {
        const nextGrade = input.grades.get(row.id) ?? null;
        return row.abcGrade === nextGrade ? [] : [{ id: row.id, oldGrade: row.abcGrade, newGrade: nextGrade }];
      });
      const calculatedAt = dateOrNull([...input.evaluations.values()][0]?.calculatedAt) ?? new Date();
      const applied: typeof changed = [];
      for (const row of changed) {
        const update = await tx.masterProduct.updateMany({
          where: { id: row.id, organizationId: input.organizationId, abcGrade: row.oldGrade },
          data: { abcGrade: row.newGrade },
        });
        if (update.count === 1) applied.push(row);
      }
      if (applied.length > 0) {
        await tx.masterProductAbcGradeHistory.createMany({
          data: applied.map((row) => ({
            organizationId: input.organizationId,
            masterProductId: row.id,
            oldGrade: row.oldGrade,
            newGrade: row.newGrade,
            metric: input.policy.metric,
            periodDays: input.policy.periodDays,
            metricValue: input.metricValues.get(row.id) ?? null,
            calculatedAt,
          })),
        });
      }
      const activeEvaluationIds = current
        .filter((product) => product.isActive && input.evaluations.has(product.id))
        .map((product) => product.id);
      await tx.masterProductAbcEvaluation.deleteMany({
        where: activeEvaluationIds.length === 0
          ? { organizationId: input.organizationId }
          : {
            organizationId: input.organizationId,
            masterProductId: { notIn: activeEvaluationIds },
          },
      });
      for (const masterProductId of activeEvaluationIds) {
        const evaluation = input.evaluations.get(masterProductId)!;
        await tx.masterProductAbcEvaluation.upsert({
          where: {
            masterProductId_organizationId: {
              masterProductId,
              organizationId: input.organizationId,
            },
          },
          create: evaluationData({
            organizationId: input.organizationId,
            masterProductId,
            evaluation,
            calculatedAt,
            sourceCapturedAt: input.sourceCapturedAt,
          }),
          update: evaluationData({
            organizationId: input.organizationId,
            masterProductId,
            evaluation,
            calculatedAt,
            sourceCapturedAt: input.sourceCapturedAt,
          }),
        });
      }
      const policy = await tx.masterProductAbcPolicy.upsert({
        where: { organizationId: input.organizationId },
        create: {
          organizationId: input.organizationId,
          metric: input.policy.metric,
          periodDays: input.policy.periodDays,
          aCumulativeThreshold: input.policy.aCumulativeThreshold,
          bCumulativeThreshold: input.policy.bCumulativeThreshold,
          minProvisionalMonths: input.policy.minProvisionalMonths,
          minClassifiedMonths: input.policy.minClassifiedMonths,
          revision: 1,
          lastCalculatedAt: calculatedAt,
          sourceCapturedAt: input.sourceCapturedAt,
        },
        update: {
          metric: input.policy.metric,
          periodDays: input.policy.periodDays,
          aCumulativeThreshold: input.policy.aCumulativeThreshold,
          bCumulativeThreshold: input.policy.bCumulativeThreshold,
          minProvisionalMonths: input.policy.minProvisionalMonths,
          minClassifiedMonths: input.policy.minClassifiedMonths,
          revision: { increment: 1 },
          lastCalculatedAt: calculatedAt,
          sourceCapturedAt: input.sourceCapturedAt,
        },
      });
      return { changedProductCount: applied.length, policy: toPolicy(policy), stale: false };
    });
  }
}

function evaluationData(input: {
  organizationId: string;
  masterProductId: string;
  evaluation: MasterProductAbcEvaluation;
  calculatedAt: Date;
  sourceCapturedAt: Date | null;
}) {
  const { evaluation } = input;
  return {
    organizationId: input.organizationId,
    masterProductId: input.masterProductId,
    provisionalGrade: evaluation.provisionalGrade,
    lifecycleStage: evaluation.lifecycleStage,
    confidence: evaluation.confidence,
    eligibilityReason: evaluation.eligibilityReason,
    riskFlags: [...evaluation.riskFlags],
    observedCompleteMonths: evaluation.observedCompleteMonths,
    observationStartMonth: evaluation.observationStartMonth,
    periodMetricValue: decimalOrNull(evaluation.periodMetricValue),
    rankingValue: decimalOrNull(evaluation.rankingValue),
    grossRevenue: evaluation.grossRevenue,
    grossCost: evaluation.grossCost,
    grossProfit: evaluation.grossProfit,
    grossMarginRate: decimalOrNull(evaluation.grossMarginRate),
    contributionRate: decimalOrNull(evaluation.contributionRate),
    cumulativeContributionRate: decimalOrNull(evaluation.cumulativeContributionRate),
    calculatedAt: dateOrNull(evaluation.calculatedAt) ?? input.calculatedAt,
    sourceCapturedAt: dateOrNull(evaluation.sourceCapturedAt) ?? input.sourceCapturedAt,
  };
}

function decimalOrNull(value: number | null): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value);
}

function dateOrNull(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function samePolicyConfig(
  persisted: {
    metric: string;
    periodDays: number;
    aCumulativeThreshold: number;
    bCumulativeThreshold: number;
    minProvisionalMonths: number;
    minClassifiedMonths: number;
  },
  candidate: MasterProductAbcPolicyRecord,
): boolean {
  return persisted.metric === candidate.metric
    && persisted.periodDays === candidate.periodDays
    && persisted.aCumulativeThreshold === candidate.aCumulativeThreshold
    && persisted.bCumulativeThreshold === candidate.bCumulativeThreshold
    && persisted.minProvisionalMonths === candidate.minProvisionalMonths
    && persisted.minClassifiedMonths === candidate.minClassifiedMonths;
}

function toPolicy(row: {
  metric: string; periodDays: number; aCumulativeThreshold: number; bCumulativeThreshold: number;
  minProvisionalMonths: number; minClassifiedMonths: number;
  revision: number;
  lastCalculatedAt: Date | null; sourceCapturedAt: Date | null;
}): MasterProductAbcPolicyRecord {
  return {
    metric: row.metric as MasterProductAbcPolicyRecord['metric'],
    periodDays: row.periodDays as MasterProductAbcPolicyRecord['periodDays'],
    aCumulativeThreshold: row.aCumulativeThreshold,
    bCumulativeThreshold: row.bCumulativeThreshold,
    minProvisionalMonths: row.minProvisionalMonths,
    minClassifiedMonths: row.minClassifiedMonths,
    revision: row.revision,
    lastCalculatedAt: row.lastCalculatedAt,
    sourceCapturedAt: row.sourceCapturedAt,
  };
}
