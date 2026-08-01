import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ProductAbcEvaluationSchema,
  ProductAbcFormulaSummarySchema,
  type ProductAbcEvaluation,
  type ProductAbcFormulaSummary,
} from '@kiditem/shared/product-abc';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  MasterProductAbcFormulaStateRecord,
  MasterProductAbcRepositoryPort,
} from '../../../application/port/out/repository/master-product-abc.repository.port';

@Injectable()
export class MasterProductAbcRepositoryAdapter implements MasterProductAbcRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveMasterProductIds(organizationId: string): Promise<readonly string[]> {
    const products = await this.prisma.masterProduct.findMany({
      where: { organizationId, isActive: true },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return products.map((product) => product.id);
  }

  async getFormulaState(organizationId: string): Promise<MasterProductAbcFormulaStateRecord> {
    const state = await this.prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId },
      include: { activeFormulaVersion: true },
    });
    return state ? stateRecord(state) : { revision: 0, formulaVersionId: null, formula: null };
  }

  async ensureInitialFormula(input: {
    organizationId: string;
    expectedRevision: number;
    formula: ProductAbcFormulaSummary;
  }): Promise<{ state: MasterProductAbcFormulaStateRecord; created: boolean; stale: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await lockOrganization(tx, input.organizationId);
      const current = await tx.masterProductAbcFormulaState.findUnique({
        where: { organizationId: input.organizationId },
        include: { activeFormulaVersion: true },
      });
      if (current?.activeFormulaVersionId || (current?.revision ?? 0) !== input.expectedRevision) {
        return { state: current ? stateRecord(current) : emptyState(), created: false, stale: true };
      }
      const formulaVersion = await tx.masterProductAbcFormulaVersion.create({
        data: {
          organizationId: input.organizationId,
          formulaKey: input.formula.formulaKey,
          version: input.formula.version,
          calculationCodeChecksum: input.formula.calculationCodeChecksum,
          formulaJson: input.formula as unknown as Prisma.InputJsonValue,
          formulaChecksum: input.formula.formulaChecksum,
          trainingStartDate: atUtcCalendarDate(input.formula.trainingRange.from),
          trainingEndDate: atUtcCalendarDate(input.formula.trainingRange.to),
          sampleCount: input.formula.sampleCount,
          foldCount: input.formula.foldCount,
          calibrationMetricsJson: input.formula.calibrationMetrics as unknown as Prisma.InputJsonValue,
          firstActivatedAt: dateOrNull(input.formula.activatedAt),
        },
      });
      const next = await tx.masterProductAbcFormulaState.upsert({
        where: { organizationId: input.organizationId },
        create: {
          organizationId: input.organizationId,
          activeFormulaVersionId: formulaVersion.id,
          activatedAt: dateOrNull(input.formula.activatedAt),
          revision: 1,
        },
        update: {
          activeFormulaVersionId: formulaVersion.id,
          activatedAt: dateOrNull(input.formula.activatedAt),
          revision: { increment: 1 },
        },
        include: { activeFormulaVersion: true },
      });
      return { state: stateRecord(next), created: true, stale: false };
    });
  }

  async findCurrentEvaluations(input: {
    organizationId: string;
    masterProductIds: readonly string[];
  }): Promise<ReadonlyMap<string, ProductAbcEvaluation>> {
    const ids = [...new Set(input.masterProductIds)];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.masterProductAbcEvaluation.findMany({
      where: { organizationId: input.organizationId, masterProductId: { in: ids } },
      include: { formulaVersion: true, masterProduct: { select: { abcGrade: true } } },
    });
    return new Map(rows.flatMap((row) => {
      const evaluation = evaluationRecord(row);
      return evaluation ? [[row.masterProductId, evaluation] as const] : [];
    }));
  }

  async publishEvaluations(input: {
    organizationId: string;
    expectedFormulaStateRevision: number;
    formulaVersionId: string | null;
    evaluations: ReadonlyMap<string, ProductAbcEvaluation>;
    reason: string;
  }): Promise<{ changedProductCount: number; stale: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await lockOrganization(tx, input.organizationId);
      const state = await tx.masterProductAbcFormulaState.findUnique({
        where: { organizationId: input.organizationId },
      });
      if (
        (state?.revision ?? 0) !== input.expectedFormulaStateRevision
        || (state?.activeFormulaVersionId ?? null) !== input.formulaVersionId
      ) {
        return { changedProductCount: 0, stale: true };
      }
      const ids = [...input.evaluations.keys()].sort();
      const products = ids.length === 0 ? [] : await tx.masterProduct.findMany({
        where: { organizationId: input.organizationId, id: { in: ids }, isActive: true },
        select: { id: true, abcGrade: true },
      });
      const changed = products.flatMap((product) => {
        const evaluation = input.evaluations.get(product.id)!;
        return product.abcGrade === evaluation.abcGrade
          ? []
          : [{ id: product.id, oldGrade: product.abcGrade, evaluation }];
      });
      for (const row of changed) {
        await tx.masterProduct.updateMany({
          where: { id: row.id, organizationId: input.organizationId, abcGrade: row.oldGrade },
          data: { abcGrade: row.evaluation.abcGrade },
        });
      }
      for (const product of products) {
        const evaluation = input.evaluations.get(product.id)!;
        await tx.masterProductAbcEvaluation.upsert({
          where: {
            masterProductId_organizationId: {
              masterProductId: product.id,
              organizationId: input.organizationId,
            },
          },
          create: evaluationData({
            organizationId: input.organizationId,
            masterProductId: product.id,
            formulaVersionId: input.formulaVersionId,
            evaluation,
          }),
          update: evaluationData({
            organizationId: input.organizationId,
            masterProductId: product.id,
            formulaVersionId: input.formulaVersionId,
            evaluation,
          }),
        });
      }
      if (input.formulaVersionId) {
        await tx.masterProductAbcGradeHistory.createMany({
          data: changed.map((row) => ({
            organizationId: input.organizationId,
            masterProductId: row.id,
            formulaVersionId: input.formulaVersionId!,
            oldGrade: row.oldGrade,
            newGrade: row.evaluation.abcGrade,
            calculationStatus: row.evaluation.calculationStatus,
            adjustedScore: decimalOrNull(row.evaluation.adjustedScore),
            weightedContributionProfit: decimalOrNull(row.evaluation.weightedContributionProfit),
            weightedContributionMargin: decimalOrNull(row.evaluation.weightedContributionMargin),
            sourceCutoffDate: atUtcCalendarDate(row.evaluation.sourceFreshness.evaluationCutoffDate),
            reason: input.reason,
            calculatedAt: dateOrNull(row.evaluation.calculatedAt) ?? new Date(),
          })),
        });
      }
      return { changedProductCount: changed.length, stale: false };
    });
  }
}

function evaluationData(input: {
  organizationId: string;
  masterProductId: string;
  formulaVersionId: string | null;
  evaluation: ProductAbcEvaluation;
}) {
  const { evaluation } = input;
  return {
    organizationId: input.organizationId,
    masterProductId: input.masterProductId,
    formulaVersionId: evaluation.formula ? input.formulaVersionId : null,
    calculationStatus: evaluation.calculationStatus,
    rawScore: decimalOrNull(evaluation.rawScore),
    adjustedScore: decimalOrNull(evaluation.adjustedScore),
    reliability: decimalOrNull(evaluation.reliability),
    weightedRevenue: decimalOrNull(evaluation.weightedRevenue),
    weightedOrderTimeCogs: decimalOrNull(evaluation.weightedOrderTimeCogs),
    weightedAdSpend: decimalOrNull(evaluation.weightedAdSpend),
    weightedContributionProfit: decimalOrNull(evaluation.weightedContributionProfit),
    profitVelocity30: decimalOrNull(evaluation.profitVelocity30),
    weightedContributionMargin: decimalOrNull(evaluation.weightedContributionMargin),
    lossRecurrence: decimalOrNull(evaluation.lossRecurrence),
    paidOrderCount: evaluation.paidOrderCount,
    observationDays: evaluation.observationDays,
    firstValidPaidSaleAt: dateOrNull(evaluation.firstValidPaidSaleAt),
    sourceCoverageStartDate: atUtcCalendarDateOrNull(evaluation.sourceFreshness.sellpia.coverageStartDate),
    sourceCoverageEndDate: atUtcCalendarDateOrNull(evaluation.sourceFreshness.sellpia.coverageEndDate),
    sellpiaSourceStatus: evaluation.sourceFreshness.sellpia.status,
    sellpiaSourceCapturedAt: dateOrNull(evaluation.sourceFreshness.sellpia.capturedAt),
    advertisingSourceStatus: evaluation.sourceFreshness.advertising.status,
    advertisingSourceCapturedAt: dateOrNull(evaluation.sourceFreshness.advertising.capturedAt),
    costComponentsJson: evaluation.costBreakdown as unknown as Prisma.InputJsonValue,
    statusDetail: evaluation.statusDetail,
    calculatedAt: dateOrNull(evaluation.calculatedAt),
  };
}

function stateRecord(row: {
  revision: number;
  activeFormulaVersionId: string | null;
  activeFormulaVersion: { formulaJson: Prisma.JsonValue } | null;
}): MasterProductAbcFormulaStateRecord {
  return {
    revision: row.revision,
    formulaVersionId: row.activeFormulaVersionId,
    formula: row.activeFormulaVersion ? formulaRecord(row.activeFormulaVersion.formulaJson) : null,
  };
}

function evaluationRecord(row: {
  masterProduct: { abcGrade: string | null };
  calculationStatus: string;
  rawScore: Prisma.Decimal | null;
  adjustedScore: Prisma.Decimal | null;
  reliability: Prisma.Decimal | null;
  weightedRevenue: Prisma.Decimal | null;
  weightedOrderTimeCogs: Prisma.Decimal | null;
  weightedAdSpend: Prisma.Decimal | null;
  weightedContributionProfit: Prisma.Decimal | null;
  profitVelocity30: Prisma.Decimal | null;
  weightedContributionMargin: Prisma.Decimal | null;
  lossRecurrence: Prisma.Decimal | null;
  paidOrderCount: number;
  observationDays: number;
  firstValidPaidSaleAt: Date | null;
  sourceCoverageStartDate: Date | null;
  sourceCoverageEndDate: Date | null;
  sellpiaSourceStatus: string;
  sellpiaSourceCapturedAt: Date | null;
  advertisingSourceStatus: string;
  advertisingSourceCapturedAt: Date | null;
  costComponentsJson: Prisma.JsonValue | null;
  statusDetail: string | null;
  calculatedAt: Date | null;
  formulaVersion: { formulaJson: Prisma.JsonValue } | null;
}): ProductAbcEvaluation | null {
  const cutoff = row.sourceCoverageEndDate ?? row.calculatedAt;
  if (!cutoff || !row.costComponentsJson) return null;
  const parsed = ProductAbcEvaluationSchema.safeParse({
    abcGrade: productGrade(row.masterProduct.abcGrade),
    calculationStatus: row.calculationStatus,
    rawScore: decimalToFinite(row.rawScore),
    adjustedScore: decimalToFinite(row.adjustedScore),
    reliability: decimalToFinite(row.reliability),
    weightedRevenue: decimalToFinite(row.weightedRevenue),
    weightedOrderTimeCogs: decimalToFinite(row.weightedOrderTimeCogs),
    weightedAdSpend: decimalToFinite(row.weightedAdSpend),
    weightedContributionProfit: decimalToFinite(row.weightedContributionProfit),
    profitVelocity30: decimalToFinite(row.profitVelocity30),
    weightedContributionMargin: decimalToFinite(row.weightedContributionMargin),
    lossRecurrence: decimalToFinite(row.lossRecurrence),
    paidOrderCount: row.paidOrderCount,
    observationDays: row.observationDays,
    firstValidPaidSaleAt: row.firstValidPaidSaleAt,
    formula: row.formulaVersion ? formulaRecord(row.formulaVersion.formulaJson) : null,
    sourceFreshness: {
      evaluationCutoffDate: calendarDate(cutoff),
      sellpia: {
        status: row.sellpiaSourceStatus,
        coverageStartDate: row.sourceCoverageStartDate ? calendarDate(row.sourceCoverageStartDate) : null,
        coverageEndDate: row.sourceCoverageEndDate ? calendarDate(row.sourceCoverageEndDate) : null,
        capturedAt: row.sellpiaSourceCapturedAt,
      },
      advertising: {
        status: row.advertisingSourceStatus,
        coverageStartDate: row.sourceCoverageStartDate ? calendarDate(row.sourceCoverageStartDate) : null,
        coverageEndDate: row.sourceCoverageEndDate ? calendarDate(row.sourceCoverageEndDate) : null,
        capturedAt: row.advertisingSourceCapturedAt,
      },
    },
    costBreakdown: row.costComponentsJson,
    statusDetail: row.statusDetail,
    calculatedAt: row.calculatedAt,
  });
  return parsed.success ? parsed.data : null;
}

function formulaRecord(json: Prisma.JsonValue): ProductAbcFormulaSummary {
  return ProductAbcFormulaSummarySchema.parse(json);
}

function emptyState(): MasterProductAbcFormulaStateRecord {
  return { revision: 0, formulaVersionId: null, formula: null };
}

async function lockOrganization(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`kiditem.master-product-abc:${organizationId}`}, 0::bigint)
    )::text AS "lock"
  `);
}

function decimalOrNull(value: number | null): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value);
}

function decimalToFinite(value: Prisma.Decimal | null): number | null {
  if (!value) return null;
  const number = value.toNumber();
  return Number.isFinite(number) ? number : null;
}

function dateOrNull(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function atUtcCalendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function atUtcCalendarDateOrNull(value: string | null): Date | null {
  return value ? atUtcCalendarDate(value) : null;
}

function calendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function productGrade(value: string | null): 'A' | 'B' | 'C' | null {
  return value === 'A' || value === 'B' || value === 'C' ? value : null;
}
