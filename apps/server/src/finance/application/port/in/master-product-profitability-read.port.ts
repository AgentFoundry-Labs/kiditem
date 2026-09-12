export const MASTER_PRODUCT_PROFITABILITY_READ_PORT = Symbol(
  'MASTER_PRODUCT_PROFITABILITY_READ_PORT',
);

export type SourceGenerationView = Readonly<{
  sourceImportRunId: string | null;
  publicationSequence: string | null;
  mappingGeneration: string | null;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  capturedAt: string | null;
}>;

export type SourceReadiness = Readonly<{
  ready: boolean;
  actualCutoff: string | null;
  latestAttemptState: 'RUNNING' | 'COMPLETE' | 'FAILED' | null;
  errorCode: string | null;
}>;

/**
 * Finance's formula input. Finance assembles facts and provenance; Products
 * remains the only owner of the ABC formula and evaluator.
 */
export type MasterProductAbcFormulaReadyMonthlyFact = Readonly<{
  yearMonth: string;
  coverageStartDate: string;
  coverageEndDate: string;
  coveredDays: number;
  recognizedRevenue: number;
  orderTimeSupplyCost: number;
  advertisingSpend: number | null;
  provenance: Readonly<{
    costBasis: 'ORDER_TIME_SUPPLY_COST';
    vatIncluded: true;
    advertisingEvidence: 'OBSERVED' | 'CONFIRMED_ZERO' | 'NOT_APPLIED';
  }>;
}>;

export type MasterProductAbcFormulaReadyFacts = Readonly<{
  masterProductId: string;
  cutoffDate: string;
  saleStartDate: string | null;
  evaluationPeriodComplete: boolean;
  monthlyFacts: readonly MasterProductAbcFormulaReadyMonthlyFact[];
}>;

export type ProductProfitabilityEvidence = Readonly<{
  masterProductId: string;
  selling: boolean;
  mappingValid: boolean;
  /** Earliest valid mapped channel sale date, normalized to a KST day. */
  saleStartDate: string | null;
  /** Every month in the selected source interval has valid evidence. */
  evaluationPeriodComplete: boolean;
  validObservationDays: number;
  formulaReadyFacts: MasterProductAbcFormulaReadyFacts | null;
}>;

export type ProfitabilityEvidenceSnapshot = Readonly<{
  targetCutoff: string;
  actualCutoff: string | null;
  mappingGeneration: string | null;
  contributionBasis: Readonly<{
    basisFromDate: string;
    basisCutoffDate: string;
  }> | null;
  sourceVector: Readonly<{
    sellpia: SourceGenerationView;
    advertising: SourceGenerationView;
  }>;
  sources: Readonly<{
    sellpia: SourceReadiness;
    advertising: SourceReadiness;
  }>;
  products: readonly ProductProfitabilityEvidence[];
}>;

/** The one Finance-owned read seam consumed by Products. */
export interface ProfitabilityEvidence {
  load(input: {
    organizationId: string;
    targetCutoff: string;
  }): Promise<ProfitabilityEvidenceSnapshot>;
}
