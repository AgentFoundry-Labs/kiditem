import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ProductAbcRecalculationResult } from '@kiditem/shared/product-abc';
import {
  MASTER_PRODUCT_PROFITABILITY_READ_PORT,
  type MasterProductProfitabilityEvidence,
  type MasterProductProfitabilityReadPort,
} from '../../../finance/application/port/in/master-product-profitability-read.port';
import {
  createFixedProductAbcFormula,
  type ProductAbcFormulaObservation,
} from '../../domain/master-product-abc-calibration';
import {
  applyMasterProductAbcQuantiles,
  evaluateMasterProductAbc,
} from '../../domain/master-product-abc';
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

  async reconcileInventoryActivity(
    organizationId: string,
  ): Promise<{
    deactivatedMasterProductIds: readonly string[];
    reactivatedMasterProductIds: readonly string[];
  }> {
    return this.repository.reconcileInventoryActivity(organizationId);
  }

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
      const evaluated = new Map(evidence.map((row) => [row.masterProductId, evaluateMasterProductAbc({
        evidence: row,
        formula: state.formula,
        calculatedAt,
        previousNormalEvaluation: previous.get(row.masterProductId),
      })] as const));
      const evaluations = applyMasterProductAbcQuantiles(evaluated);
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
    const formula = createFixedProductAbcFormula({
      observations: formulaObservations(historical),
      version: 1,
      activatedAt: input.calculatedAt,
    });
    if (!formula) return input.state;
    const stored = await this.repository.ensureInitialFormula({
      organizationId: input.organizationId,
      expectedRevision: input.state.revision,
      formula: formula.formula,
    });
    return stored.state;
  }
}

function formulaObservations(
  evidence: readonly MasterProductProfitabilityEvidence[],
): ProductAbcFormulaObservation[] {
  return evidence.flatMap((product) => {
    if (product.sellpiaStatus !== 'READY' || product.mappingStatus !== 'READY') return [];
    const facts = [...product.monthlyFacts]
      .filter((fact) => fact.contributionProfit !== null && fact.adSpend !== null && fact.negativeCoveredDays !== null)
      .sort((left, right) => left.coverageEndDate.getTime() - right.coverageEndDate.getTime())
      .map((fact) => ({
        coverageStartDate: fact.coverageStartDate,
        coverageEndDate: fact.coverageEndDate,
        coveredDays: fact.coveredDays,
        revenue: fact.revenue,
        orderTimeCogs: fact.sellpiaInAmount,
        adSpend: fact.adSpend!,
        contributionProfit: fact.contributionProfit!,
        negativeCoveredDays: fact.negativeCoveredDays!,
      }));
    if (facts.length === 0) return [];
    return [{
      masterProductId: product.masterProductId,
      facts,
      asOfDate: product.asOfDate,
      observationDays: product.observationDays,
    }];
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
