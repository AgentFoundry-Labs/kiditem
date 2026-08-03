import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ProductAbcRecalculationResult } from '@kiditem/shared/product-abc';
import {
  MASTER_PRODUCT_PROFITABILITY_READ_PORT,
  type MasterProductProfitabilityEvidence,
  type MasterProductProfitabilityReadPort,
} from '../../../finance/application/port/in/master-product-profitability-read.port';
import { calibrateProductAbcFormula, type ProductAbcCalibrationExample } from '../../domain/master-product-abc-calibration';
import { evaluateMasterProductAbc } from '../../domain/master-product-abc';
import {
  MASTER_PRODUCT_ABC_REPOSITORY_PORT,
  type MasterProductAbcFormulaStateRecord,
  type MasterProductAbcRepositoryPort,
} from '../port/out/repository/master-product-abc.repository.port';

const MAX_PUBLICATION_ATTEMPTS = 2;

@Injectable()
export class MasterProductAbcService {
  constructor(
    @Inject(MASTER_PRODUCT_ABC_REPOSITORY_PORT)
    private readonly repository: MasterProductAbcRepositoryPort,
    @Inject(MASTER_PRODUCT_PROFITABILITY_READ_PORT)
    private readonly profitability: MasterProductProfitabilityReadPort,
  ) {}

  /** Rebuilds active products from persisted source facts and the frozen formula. */
  async recalculate(organizationId: string): Promise<ProductAbcRecalculationResult> {
    for (let attempt = 0; attempt < MAX_PUBLICATION_ATTEMPTS; attempt += 1) {
      const calculatedAt = new Date();
      const asOfDate = completedKstCalendarDate(calculatedAt);
      let state = await this.repository.getFormulaState(organizationId);
      state = await this.ensureInitialFormula({ organizationId, state, asOfDate, calculatedAt });
      const activeIds = await this.repository.listSellingMasterProductIds(organizationId);
      const [evidence, previous] = await Promise.all([
        activeIds.length === 0
          ? Promise.resolve([] as readonly MasterProductProfitabilityEvidence[])
          : this.profitability.readMany({
            organizationId,
            masterProductIds: activeIds,
            asOfDate,
            scope: 'ACTIVE_EVALUATION',
          }),
        this.repository.findCurrentEvaluations({ organizationId, masterProductIds: activeIds }),
      ]);
      const evaluations = new Map(evidence.map((row) => [row.masterProductId, evaluateMasterProductAbc({
        evidence: row,
        formula: state.formula,
        calculatedAt,
        previousNormalEvaluation: previous.get(row.masterProductId),
      })] as const));
      const published = await this.repository.publishEvaluations({
        organizationId,
        expectedFormulaStateRevision: state.revision,
        formulaVersionId: state.formulaVersionId,
        evaluations,
        reason: 'AUTOMATIC_PROFITABILITY_RECALCULATION',
      });
      if (!published.stale) return resultFor(evaluations, published.changedProductCount);
    }
    throw new ConflictException('MasterProduct ABC formula changed during recalculation');
  }

  private async ensureInitialFormula(input: {
    organizationId: string;
    state: MasterProductAbcFormulaStateRecord;
    asOfDate: Date;
    calculatedAt: Date;
  }): Promise<MasterProductAbcFormulaStateRecord> {
    if (input.state.formula) return input.state;
    const historical = await this.profitability.readMany({
      organizationId: input.organizationId,
      asOfDate: input.asOfDate,
      scope: 'HISTORICAL_CALIBRATION',
    });
    const calibration = calibrateProductAbcFormula({
      examples: calibrationExamples(historical),
      version: 1,
      activatedAt: input.calculatedAt,
    });
    if (!calibration) return input.state;
    const stored = await this.repository.ensureInitialFormula({
      organizationId: input.organizationId,
      expectedRevision: input.state.revision,
      formula: calibration.formula,
    });
    return stored.state;
  }
}

function calibrationExamples(
  evidence: readonly MasterProductProfitabilityEvidence[],
): ProductAbcCalibrationExample[] {
  return evidence.flatMap((product) => {
    if (product.sellpiaStatus !== 'READY'
      || (product.adStatus !== 'READY' && product.adStatus !== 'CONFIRMED_ZERO')
      || product.mappingStatus !== 'READY') return [];
    const facts = [...product.monthlyFacts]
      .filter((fact) => fact.contributionProfit !== null && fact.adSpend !== null && fact.negativeCoveredDays !== null)
      .sort((left, right) => left.coverageEndDate.getTime() - right.coverageEndDate.getTime());
    const examples: ProductAbcCalibrationExample[] = [];
    for (let index = 0; index < facts.length - 1; index += 1) {
      const origin = facts[index]!;
      const next = facts[index + 1]!;
      const observationStart = facts
        .slice(0, index + 1)
        .find((fact) => fact.revenue > 0 || fact.sellpiaInAmount > 0)
        ?.coverageStartDate ?? null;
      const observationDays = observationStart
        ? kstCalendarDaysInclusive(observationStart, origin.coverageEndDate)
        : 0;
      examples.push({
        masterProductId: product.masterProductId,
        originMonth: origin.yearMonth,
        asOfDate: origin.coverageEndDate,
        facts: facts.slice(0, index + 1).map((fact) => ({
          coverageStartDate: fact.coverageStartDate,
          coverageEndDate: fact.coverageEndDate,
          coveredDays: fact.coveredDays,
          revenue: fact.revenue,
          orderTimeCogs: fact.sellpiaInAmount,
          adSpend: fact.adSpend!,
          contributionProfit: fact.contributionProfit!,
          negativeCoveredDays: fact.negativeCoveredDays!,
        })),
        observationDays,
        nextMonthProfitVelocity: 30 * next.contributionProfit! / next.coveredDays,
      });
    }
    return examples;
  });
}

function resultFor(
  evaluations: ReadonlyMap<string, ReturnType<typeof evaluateMasterProductAbc>>,
  changedProductCount: number,
): ProductAbcRecalculationResult {
  const grades = [...evaluations.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([masterProductId, evaluation]) => ({
      masterProductId,
      abcGrade: evaluation.abcGrade,
      evaluation,
    }));
  return {
    changedProductCount,
    classifiedProductCount: grades.filter((grade) => grade.abcGrade !== null).length,
    unclassifiedProductCount: grades.filter((grade) => grade.abcGrade === null).length,
    grades,
  };
}

function completedKstCalendarDate(now: Date): Date {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - 1));
}

function kstCalendarDaysInclusive(first: Date, last: Date): number {
  const firstDay = kstEpochDay(first);
  const lastDay = kstEpochDay(last);
  return Math.max(0, lastDay - firstDay + 1);
}

function kstEpochDay(date: Date): number {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return Math.floor(Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(),
  ) / 86_400_000);
}
