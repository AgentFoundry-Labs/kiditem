import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ProductAbcEvaluationSchema,
  ProductAbcFormulaSummarySchema,
  type ProductAbcEvaluation,
  type ProductAbcFormulaSummary,
} from '@kiditem/shared/product-abc';
import { PrismaService } from '../../../../prisma/prisma.service';
import { listSellingMasterProductIds } from './selling-master-product.query';
import type { ActiveOperationAttemptTransaction } from '../../../../operations/application/port/active-browser-attempt-transaction';
import type {
  MasterProductAbcFormulaStateRecord,
  MasterProductAbcRepositoryPort,
  EnsureInitialMasterProductAbcFormulaInput,
  PublishMasterProductAbcEvaluationsInput,
} from '../../../application/port/out/repository/master-product-abc.repository.port';

const ABC_PUBLICATION_INSERT_CHUNK = 1_000;

@Injectable()
export class MasterProductAbcRepositoryAdapter implements MasterProductAbcRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listSellingMasterProductIds(organizationId: string): Promise<readonly string[]> {
    return listSellingMasterProductIds(this.prisma, organizationId);
  }

  async reconcileInventoryActivity(organizationId: string): Promise<{
    deactivatedMasterProductIds: readonly string[];
    reactivatedMasterProductIds: readonly string[];
  }> {
    const deactivatedMasterProductIds = await this.deactivateZeroStockProducts(organizationId);
    const reactivatedMasterProductIds = await this.reactivateInStockProducts(organizationId);
    return { deactivatedMasterProductIds, reactivatedMasterProductIds };
  }

  private async deactivateZeroStockProducts(organizationId: string): Promise<readonly string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE master_products mp
      SET is_active = FALSE,
          abc_grade = NULL,
          updated_at = NOW()
      WHERE mp.organization_id = ${organizationId}::uuid
        AND mp.is_active = TRUE
        AND EXISTS (
          SELECT 1
          FROM sellpia_inventory_skus sku
          WHERE sku.organization_id = mp.organization_id
            AND sku.master_product_id = mp.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM sellpia_inventory_skus sku
          WHERE sku.organization_id = mp.organization_id
            AND sku.master_product_id = mp.id
            AND sku.is_active = TRUE
            AND sku.current_stock > 0
        )
      RETURNING mp.id
    `);
    return rows.map(({ id }) => id).sort();
  }

  private async reactivateInStockProducts(organizationId: string): Promise<readonly string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE master_products mp
      SET is_active = TRUE,
          updated_at = NOW()
      WHERE mp.organization_id = ${organizationId}::uuid
        AND mp.is_active = FALSE
        AND EXISTS (
          SELECT 1
          FROM sellpia_inventory_skus sku
          WHERE sku.organization_id = mp.organization_id
            AND sku.master_product_id = mp.id
            AND sku.is_active = TRUE
            AND sku.current_stock > 0
        )
      RETURNING mp.id
    `);
    return rows.map(({ id }) => id).sort();
  }

  async getFormulaState(organizationId: string): Promise<MasterProductAbcFormulaStateRecord> {
    const state = await this.prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId },
      include: { activeFormulaVersion: true },
    });
    return state ? stateRecord(state) : { revision: 0, formulaVersionId: null, formula: null };
  }

  async ensureInitialFormula(
    input: EnsureInitialMasterProductAbcFormulaInput,
  ): Promise<{ state: MasterProductAbcFormulaStateRecord; created: boolean; stale: boolean }> {
    return this.prisma.$transaction((tx) => this.ensureInitialFormulaTx(tx, input));
  }

  ensureInitialFormulaInAttempt(
    transaction: ActiveOperationAttemptTransaction,
    input: EnsureInitialMasterProductAbcFormulaInput,
  ): Promise<{ state: MasterProductAbcFormulaStateRecord; created: boolean; stale: boolean }> {
    return this.ensureInitialFormulaTx(asTransaction(transaction), input);
  }

  private async ensureInitialFormulaTx(
    tx: Prisma.TransactionClient,
    input: EnsureInitialMasterProductAbcFormulaInput,
  ): Promise<{ state: MasterProductAbcFormulaStateRecord; created: boolean; stale: boolean }> {
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

  async publishEvaluations(
    input: PublishMasterProductAbcEvaluationsInput,
  ): Promise<{ changedProductCount: number; stale: boolean }> {
    return this.prisma.$transaction((tx) => this.publishEvaluationsTx(tx, input));
  }

  publishEvaluationsInAttempt(
    transaction: ActiveOperationAttemptTransaction,
    input: PublishMasterProductAbcEvaluationsInput,
  ): Promise<{ changedProductCount: number; stale: boolean }> {
    return this.publishEvaluationsTx(asTransaction(transaction), input);
  }

  private async publishEvaluationsTx(
    tx: Prisma.TransactionClient,
    input: PublishMasterProductAbcEvaluationsInput,
  ): Promise<{ changedProductCount: number; stale: boolean }> {
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
      const candidateIds = [...input.evaluations.keys()].sort();
      const ids = candidateIds.length === 0
        ? []
        : await listSellingMasterProductIds(tx, input.organizationId, candidateIds);
      const cleared = await tx.masterProduct.updateMany({
        where: {
          organizationId: input.organizationId,
          abcGrade: { not: null },
          ...(ids.length > 0 ? { id: { notIn: ids } } : {}),
        },
        data: { abcGrade: null },
      });
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

      const gradeChangeGroups = new Map<string, {
        oldGrade: string | null;
        newGrade: ProductAbcEvaluation['abcGrade'];
        ids: string[];
      }>();
      for (const row of changed) {
        const key = JSON.stringify([row.oldGrade, row.evaluation.abcGrade]);
        const group = gradeChangeGroups.get(key) ?? {
          oldGrade: row.oldGrade,
          newGrade: row.evaluation.abcGrade,
          ids: [],
        };
        group.ids.push(row.id);
        gradeChangeGroups.set(key, group);
      }
      for (const group of gradeChangeGroups.values()) {
        const updated = await tx.masterProduct.updateMany({
          where: {
            organizationId: input.organizationId,
            id: { in: group.ids },
            abcGrade: group.oldGrade,
          },
          data: { abcGrade: group.newGrade },
        });
        if (updated.count !== group.ids.length) {
          throw new ConflictException('MasterProduct ABC grade changed during publication');
        }
      }

      if (products.length > 0) {
        await tx.masterProductAbcEvaluation.deleteMany({
          where: {
            organizationId: input.organizationId,
            masterProductId: { in: products.map(({ id }) => id) },
          },
        });
        const evaluationRows = products.map((product) => evaluationData({
          organizationId: input.organizationId,
          masterProductId: product.id,
          formulaVersionId: input.formulaVersionId,
          evaluation: input.evaluations.get(product.id)!,
        }));
        for (let offset = 0; offset < evaluationRows.length; offset += ABC_PUBLICATION_INSERT_CHUNK) {
          const batch = evaluationRows.slice(offset, offset + ABC_PUBLICATION_INSERT_CHUNK);
          const inserted = await tx.masterProductAbcEvaluation.createMany({ data: batch });
          if (inserted.count !== batch.length) {
            throw new ConflictException('MasterProduct ABC evaluation publication was incomplete');
          }
        }
      }
      if (input.formulaVersionId && changed.length > 0) {
        const historyRows = changed.map((row) => ({
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
        }));
        for (let offset = 0; offset < historyRows.length; offset += ABC_PUBLICATION_INSERT_CHUNK) {
          const batch = historyRows.slice(offset, offset + ABC_PUBLICATION_INSERT_CHUNK);
          const inserted = await tx.masterProductAbcGradeHistory.createMany({ data: batch });
          if (inserted.count !== batch.length) {
            throw new ConflictException('MasterProduct ABC grade history publication was incomplete');
          }
        }
      }
      return { changedProductCount: changed.length + cleared.count, stale: false };
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
    evaluationCutoffDate: atUtcCalendarDate(evaluation.sourceFreshness.evaluationCutoffDate),
    sellpiaCoverageStartDate: atUtcCalendarDateOrNull(evaluation.sourceFreshness.sellpia.coverageStartDate),
    sellpiaCoverageEndDate: atUtcCalendarDateOrNull(evaluation.sourceFreshness.sellpia.coverageEndDate),
    sellpiaSourceStatus: evaluation.sourceFreshness.sellpia.status,
    sellpiaSourceCapturedAt: dateOrNull(evaluation.sourceFreshness.sellpia.capturedAt),
    advertisingCoverageStartDate: atUtcCalendarDateOrNull(evaluation.sourceFreshness.advertising.coverageStartDate),
    advertisingCoverageEndDate: atUtcCalendarDateOrNull(evaluation.sourceFreshness.advertising.coverageEndDate),
    advertisingSourceStatus: evaluation.sourceFreshness.advertising.status,
    advertisingSourceCapturedAt: dateOrNull(evaluation.sourceFreshness.advertising.capturedAt),
    ordersSourceStatus: evaluation.sourceFreshness.orders.status,
    ordersCoverageStartDate: atUtcCalendarDateOrNull(evaluation.sourceFreshness.orders.coverageStartDate),
    ordersCoverageEndDate: atUtcCalendarDateOrNull(evaluation.sourceFreshness.orders.coverageEndDate),
    ordersSourceCapturedAt: dateOrNull(evaluation.sourceFreshness.orders.capturedAt),
    mappingSourceStatus: evaluation.sourceFreshness.mapping.status,
    mappingInventoryGeneration: bigIntOrNull(evaluation.sourceFreshness.mapping.inventoryGeneration),
    mappingVerifiedAt: dateOrNull(evaluation.sourceFreshness.mapping.verifiedAt),
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
  evaluationCutoffDate: Date | null;
  sellpiaCoverageStartDate: Date | null;
  sellpiaCoverageEndDate: Date | null;
  sellpiaSourceStatus: string;
  sellpiaSourceCapturedAt: Date | null;
  advertisingCoverageStartDate: Date | null;
  advertisingCoverageEndDate: Date | null;
  advertisingSourceStatus: string;
  advertisingSourceCapturedAt: Date | null;
  ordersSourceStatus: string;
  ordersCoverageStartDate: Date | null;
  ordersCoverageEndDate: Date | null;
  ordersSourceCapturedAt: Date | null;
  mappingSourceStatus: string;
  mappingInventoryGeneration: bigint | null;
  mappingVerifiedAt: Date | null;
  costComponentsJson: Prisma.JsonValue | null;
  statusDetail: string | null;
  calculatedAt: Date | null;
  formulaVersion: { formulaJson: Prisma.JsonValue } | null;
}): ProductAbcEvaluation | null {
  const cutoff = row.evaluationCutoffDate ?? row.sourceCoverageEndDate ?? row.calculatedAt;
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
        coverageStartDate: row.sellpiaCoverageStartDate ?? row.sourceCoverageStartDate
          ? calendarDate((row.sellpiaCoverageStartDate ?? row.sourceCoverageStartDate)!)
          : null,
        coverageEndDate: row.sellpiaCoverageEndDate ?? row.sourceCoverageEndDate
          ? calendarDate((row.sellpiaCoverageEndDate ?? row.sourceCoverageEndDate)!)
          : null,
        capturedAt: row.sellpiaSourceCapturedAt,
      },
      advertising: {
        status: row.advertisingSourceStatus,
        coverageStartDate: row.advertisingCoverageStartDate
          ? calendarDate(row.advertisingCoverageStartDate)
          : null,
        coverageEndDate: row.advertisingCoverageEndDate
          ? calendarDate(row.advertisingCoverageEndDate)
          : null,
        capturedAt: row.advertisingSourceCapturedAt,
      },
      orders: {
        status: row.ordersSourceStatus,
        coverageStartDate: row.ordersCoverageStartDate
          ? calendarDate(row.ordersCoverageStartDate)
          : null,
        coverageEndDate: row.ordersCoverageEndDate
          ? calendarDate(row.ordersCoverageEndDate)
          : null,
        capturedAt: row.ordersSourceCapturedAt,
      },
      mapping: {
        status: row.mappingSourceStatus,
        inventoryGeneration: row.mappingInventoryGeneration?.toString() ?? null,
        verifiedAt: row.mappingVerifiedAt,
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

function bigIntOrNull(value: string | null): bigint | null {
  return value && /^\d+$/.test(value) ? BigInt(value) : null;
}

function asTransaction(
  transaction: ActiveOperationAttemptTransaction,
): Prisma.TransactionClient {
  return transaction as unknown as Prisma.TransactionClient;
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
