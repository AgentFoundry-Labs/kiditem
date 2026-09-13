import {
  ProductAbcReadModelSchema,
  type ProductAbcEvaluation,
  type ProductAbcReadModel,
} from '@kiditem/shared/product-abc';
import {
  deriveSourceReadiness,
  type SourceReadinessAttempt,
} from '@kiditem/shared/source-readiness';
import { productAbcDisplayStatus } from './product-abc-display-status';

/**
 * One source's readiness at the owned evidence cutoff, together with the
 * manifest of the complete generation behind it. Structural on purpose: the
 * domain states what it needs, not where Finance keeps it.
 */
export type ProductAbcSourceEvidence = Readonly<{
  ready: boolean;
  actualCutoff: string | null;
  latestAttemptState: 'RUNNING' | 'COMPLETE' | 'FAILED' | null;
  errorCode: string | null;
  sourceImportRunId: string | null;
  generation: string | null;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  capturedAt: string | null;
}>;

export type ProductAbcEvidenceView = Readonly<{
  /** The owner's cutoff this projection must meet. */
  requiredCutoff: string;
  /** Cutoff the evidence actually reached; `null` when it has none. */
  actualCutoff: string | null;
  /** Mapping generation the selected sources agree on; `null` when none does. */
  mappingGeneration: string | null;
  sellpia: ProductAbcSourceEvidence;
  advertising: ProductAbcSourceEvidence;
}>;

export type ProductAbcFormulaStateView = Readonly<{
  formulaRevision: number;
  publicationRevision: number;
  officialCutoffDate: string | null;
  publishedAt: string | null;
  /** The organization's current mapping generation, never null. */
  mappingGeneration: string;
}>;

export type ProductAbcReadModelInput = Readonly<{
  evaluation: ProductAbcEvaluation | null;
  mappingValid: boolean;
  saleStartDate: string | null;
  evidence: ProductAbcEvidenceView;
  formulaState: ProductAbcFormulaStateView;
}>;

/**
 * The one place a product's published ABC view is assembled.
 *
 * Every reader — Product Hub, the dashboard's counts, Sellpia inventory —
 * shows the same grade, freshness and display status for a product because
 * they all read this projection off one evidence snapshot, never their own.
 */
export function buildProductAbcReadModel(
  input: ProductAbcReadModelInput,
): ProductAbcReadModel {
  const { evaluation, evidence, formulaState } = input;
  const displayStatus = productAbcDisplayStatus(
    evaluation !== null,
    input.mappingValid,
    { sellpia: evidence.sellpia, advertising: evidence.advertising },
  );
  return ProductAbcReadModelSchema.parse({
    // The official grade follows the retained evaluation; a product with no
    // retained evaluation exposes no official grade.
    abcGrade: evaluation?.abcGrade ?? null,
    evaluation,
    displayStatus,
    formulaRevision: formulaState.formulaRevision,
    publicationRevision: formulaState.publicationRevision,
    officialCutoffDate: evaluation?.gradeBasisCutoffDate
      ?? formulaState.officialCutoffDate,
    publishedAt: formulaState.publishedAt,
    actualCutoffDate: evidence.actualCutoff,
    sources: {
      sellpia: sourceReadiness(evidence.sellpia, evidence.requiredCutoff),
      advertising: sourceReadiness(evidence.advertising, evidence.requiredCutoff),
      mapping: {
        valid: input.mappingValid,
        currentMappingGeneration: formulaState.mappingGeneration,
        evidenceMappingGeneration: evidence.mappingGeneration,
      },
    },
  });
}

function sourceReadiness(
  source: ProductAbcSourceEvidence,
  requiredCutoff: string,
) {
  const complete = source.sourceImportRunId !== null
    && source.generation !== null
    && source.coverageStartDate !== null
    && source.coverageEndDate !== null;
  const latestAttempt: SourceReadinessAttempt | null = source.latestAttemptState
    ? { state: source.latestAttemptState }
    : null;
  const latestComplete = complete ? { actualCutoff: source.actualCutoff } : null;
  return {
    ...deriveSourceReadiness({ latestAttempt, latestComplete, requiredCutoff }),
    latestAttempt,
    latestComplete,
  };
}
