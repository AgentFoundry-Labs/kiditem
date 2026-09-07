import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ProductAbcRecalculationResult } from '@kiditem/shared/product-abc';
import type { ActiveOperationAttemptTransaction } from '../../../operations/application/port/active-browser-attempt-transaction';
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
  type PublishMasterProductAbcEvaluationsInput,
} from '../port/out/repository/master-product-abc.repository.port';

const MAX_PUBLICATION_ATTEMPTS = 2;

export interface MasterProductAbcRecalculationControls {
  signal?: AbortSignal;
  checkpoint?: (stage: string) => Promise<void>;
  withinActiveOperationAttemptFence?: <T>(
    callback: (transaction: ActiveOperationAttemptTransaction) => Promise<T>,
  ) => Promise<T>;
}

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
  async recalculate(
    organizationId: string,
    controls: MasterProductAbcRecalculationControls = {},
  ): Promise<ProductAbcRecalculationResult> {
    for (let attempt = 0; attempt < MAX_PUBLICATION_ATTEMPTS; attempt += 1) {
      await cancellableCheckpoint(controls, 'reading_formula');
      const calculatedAt = new Date();
      const asOfDate = completedKstCalendarDate(calculatedAt);
      let state = await this.repository.getFormulaState(organizationId);
      await cancellableCheckpoint(controls, 'reading_evidence');
      state = await this.ensureInitialFormula(
        { organizationId, state, asOfDate, calculatedAt },
        controls,
      );
      await cancellableCheckpoint(controls, 'reading_evidence');
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
      await cancellableCheckpoint(controls, 'calculating_abc');
      const evaluated = new Map(evidence.map((row) => [row.masterProductId, evaluateMasterProductAbc({
        evidence: row,
        formula: state.formula,
        calculatedAt,
        previousNormalEvaluation: previous.get(row.masterProductId),
      })] as const));
      const evaluations = applyMasterProductAbcQuantiles(evaluated);
      const publication: PublishMasterProductAbcEvaluationsInput = {
        organizationId,
        expectedFormulaStateRevision: state.revision,
        formulaVersionId: state.formulaVersionId,
        evaluations,
        reason: 'AUTOMATIC_PROFITABILITY_RECALCULATION',
      };
      await cancellableCheckpoint(controls, 'publishing_abc');
      const published = controls.withinActiveOperationAttemptFence
        ? await controls.withinActiveOperationAttemptFence((transaction) =>
            this.repository.publishEvaluationsInAttempt(transaction, publication))
        : await this.repository.publishEvaluations(publication);
      controls.signal?.throwIfAborted();
      if (!published.stale) return resultFor(evaluations, published.changedProductCount);
    }
    throw new ConflictException('MasterProduct ABC formula changed during recalculation');
  }

  private async ensureInitialFormula(input: {
    organizationId: string;
    state: MasterProductAbcFormulaStateRecord;
    asOfDate: Date;
    calculatedAt: Date;
  }, controls: MasterProductAbcRecalculationControls): Promise<MasterProductAbcFormulaStateRecord> {
    if (input.state.formula) return input.state;
    const historical = await this.profitability.readMany({
      organizationId: input.organizationId,
      asOfDate: input.asOfDate,
      scope: 'HISTORICAL_CALIBRATION',
    });
    await cancellableCheckpoint(controls, 'calibrating_formula');
    const formula = createFixedProductAbcFormula({
      observations: formulaObservations(historical),
      version: 1,
      activatedAt: input.calculatedAt,
    });
    if (!formula) return input.state;
    const ensureInput = {
      organizationId: input.organizationId,
      expectedRevision: input.state.revision,
      formula: formula.formula,
    };
    const stored = controls.withinActiveOperationAttemptFence
      ? await controls.withinActiveOperationAttemptFence((transaction) =>
          this.repository.ensureInitialFormulaInAttempt(transaction, ensureInput))
      : await this.repository.ensureInitialFormula(ensureInput);
    controls.signal?.throwIfAborted();
    return stored.state;
  }
}

async function cancellableCheckpoint(
  controls: MasterProductAbcRecalculationControls,
  stage: string,
): Promise<void> {
  controls.signal?.throwIfAborted();
  await controls.checkpoint?.(stage);
  controls.signal?.throwIfAborted();
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
