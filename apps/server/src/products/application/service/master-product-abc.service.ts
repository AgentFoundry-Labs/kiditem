import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  evaluateMasterProductAbc,
  type MasterProductAbcCandidate,
} from '../../domain/master-product-abc';
import {
  MASTER_PRODUCT_PROFITABILITY_READ_PORT,
  type ProfitabilityEvidence,
  type ProfitabilityEvidenceSnapshot,
  type ProductProfitabilityEvidence,
} from '../../../finance/application/port/in/master-product-profitability-read.port';
import {
  MASTER_PRODUCT_ABC_REPOSITORY_PORT,
  type MasterProductAbcCandidateRecord,
  type ProductAbcRepositoryPort,
  type ProductAbcPublicationInput,
} from '../port/out/repository/master-product-abc.repository.port';
import { productAbcSaleAgeDays } from '@kiditem/shared/product-abc';
import type {
  MasterProductAbcRecalculationInput,
  MasterProductAbcRecalculationPort,
  ProductAbcRecalculationResult,
} from '../port/in/master-product-abc-recalculation.port';

/**
 * Products owns the formula and the only publication command. Finance supplies
 * one immutable, coherent source snapshot; it does not publish product state.
 */
@Injectable()
export class MasterProductAbcService implements MasterProductAbcRecalculationPort {
  constructor(
    @Inject(MASTER_PRODUCT_ABC_REPOSITORY_PORT)
    private readonly repository: ProductAbcRepositoryPort,
    @Inject(MASTER_PRODUCT_PROFITABILITY_READ_PORT)
    private readonly profitability: ProfitabilityEvidence,
  ) {}

  async recalculate(
    input: MasterProductAbcRecalculationInput,
  ): Promise<ProductAbcRecalculationResult> {
    assertOrganizationId(input.organizationId);

    const state = await this.repository.getFormulaState(input.organizationId);
    if (!state.formula || !state.activeFormulaVersionId) {
      throw new Error('ABC formula is not initialized');
    }

    const calculatedAt = new Date();
    const targetCutoff = latestClosedKstDate(calculatedAt);
    const targetProductIds = uniqueSorted(
      await this.repository.listCurrentAbcTargetIds(input.organizationId),
    );
    const snapshot = await this.profitability.load({
      organizationId: input.organizationId,
      targetCutoff,
    });
    if (!isReadyForPublication(snapshot, state.mappingGeneration, targetCutoff)) {
      return {
        outcome: 'SOURCE_NOT_READY',
        publicationRevision: state.publicationRevision,
        officialCutoff: state.officialCutoffDate,
        actualCutoff: snapshot.actualCutoff,
        sources: snapshot.sources,
      };
    }

    const evidenceById = new Map(
      snapshot.products.map((product) => [product.masterProductId, product] as const),
    );
    if (evidenceById.size !== snapshot.products.length) {
      throw new Error('Profitability evidence contains duplicate product IDs');
    }
    const candidates: MasterProductAbcCandidateRecord[] = [];
    let unclassifiedProductCount = 0;

    for (const masterProductId of targetProductIds) {
      const evidence = evidenceById.get(masterProductId);
      if (!evidence || !evidence.selling) {
        throw new ConflictException({ code: 'INPUT_CHANGED' });
      }
      if (!isEligibleEvidence(evidence, state.formula)) {
        unclassifiedProductCount += 1;
        continue;
      }
      candidates.push(candidateRecord(
        evaluateMasterProductAbc({
          facts: evidence.formulaReadyFacts!,
          formula: state.formula,
        }),
        snapshot,
        state.mappingGeneration,
      ));
    }

    const publication: ProductAbcPublicationInput = {
      organizationId: input.organizationId,
      expectedFormulaRevision: state.formulaRevision,
      expectedPublicationRevision: state.publicationRevision,
      formulaVersionId: state.activeFormulaVersionId,
      targetCutoff,
      actualCutoff: snapshot.actualCutoff!,
      mappingGeneration: state.mappingGeneration,
      sourceFences: {
        sellpia: {
          selectedComplete: snapshot.sourceVector.sellpia,
        },
        advertising: {
          selectedComplete: snapshot.sourceVector.advertising,
        },
      },
      saleAgeInputs: targetProductIds.map((masterProductId) => ({
        masterProductId,
        mappingValid: evidenceById.get(masterProductId)?.mappingValid ?? false,
        saleStartDate: evidenceById.get(masterProductId)?.saleStartDate ?? null,
      })),
      targetProductIds,
      candidates,
      calculatedAt,
    };
    const published = await this.repository.publish(publication);
    if (published.outcome === 'INPUT_CHANGED') {
      throw new ConflictException({ code: 'INPUT_CHANGED' });
    }
    return {
      outcome: 'PUBLISHED',
      publicationRevision: published.publicationRevision,
      formulaRevision: state.formulaRevision,
      officialCutoff: snapshot.actualCutoff!,
      classifiedProductCount: candidates.length,
      unclassifiedProductCount,
      changedProductCount: published.changedProductCount,
    };
  }
}

function candidateRecord(
  candidate: MasterProductAbcCandidate,
  snapshot: ProfitabilityEvidenceSnapshot,
  mappingGeneration: string,
): MasterProductAbcCandidateRecord {
  const sellpia = snapshot.sourceVector.sellpia;
  const advertising = snapshot.sourceVector.advertising;
  if (
    !sellpia.sourceImportRunId
    || !sellpia.publicationSequence
    || !advertising.sourceImportRunId
    || !advertising.publicationSequence
  ) {
    throw new ConflictException({ code: 'SOURCE_NOT_READY' });
  }
  return {
    ...candidate,
    sellpiaSourceImportRunId: sellpia.sourceImportRunId,
    advertisingSourceImportRunId: advertising.sourceImportRunId,
    sellpiaGeneration: sellpia.publicationSequence,
    advertisingGeneration: advertising.publicationSequence,
    mappingGeneration,
  };
}

function isEligibleEvidence(
  evidence: ProductProfitabilityEvidence,
  formula: Parameters<typeof evaluateMasterProductAbc>[0]['formula'],
): boolean {
  const saleAgeDays = productAbcSaleAgeDays(
    evidence.saleStartDate,
    evidence.formulaReadyFacts?.cutoffDate ?? null,
  );
  return evidence.evaluationPeriodComplete
    && evidence.mappingValid
    && saleAgeDays !== null
    && saleAgeDays >= formula.minimumSaleAgeDays
    && evidence.formulaReadyFacts !== null;
}

function isReadyForPublication(
  snapshot: ProfitabilityEvidenceSnapshot,
  mappingGeneration: string,
  targetCutoff: string,
): boolean {
  if (
    snapshot.actualCutoff === null
    || snapshot.mappingGeneration !== mappingGeneration
    || snapshot.actualCutoff !== targetCutoff
  ) return false;

  for (const source of [snapshot.sources.sellpia, snapshot.sources.advertising]) {
    if (source.status !== 'READY'
      || source.latestAttemptState !== 'COMPLETE'
      || source.actualCutoff !== targetCutoff) return false;
  }
  for (const source of [snapshot.sourceVector.sellpia, snapshot.sourceVector.advertising]) {
    if (!source.sourceImportRunId
      || !source.publicationSequence
      || source.mappingGeneration !== mappingGeneration
      || !source.coverageEndDate
      || source.coverageEndDate < targetCutoff) return false;
  }
  return true;
}

function assertOrganizationId(organizationId: string): void {
  if (typeof organizationId !== 'string' || organizationId.trim().length === 0) {
    throw new Error('organizationId is required');
  }
}

/** Latest closed KST calendar date; ABC includes this partial cutoff month. */
function latestClosedKstDate(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - 1))
    .toISOString()
    .slice(0, 10);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
