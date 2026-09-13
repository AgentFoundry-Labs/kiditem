import {
  ProductAbcReadModelSchema,
  type ProductAbcEvaluation,
  type ProductAbcReadModel,
} from '@kiditem/shared/product-abc';
import {
  deriveSourceReadiness,
  type SourceReadinessAttempt,
} from '@kiditem/shared/source-readiness';

/**
 * One source's owner readiness facts at the owned evidence cutoff. Structural
 * on purpose: the domain states what it needs, not where Finance keeps it.
 * Readiness itself is derived from `actualCutoff` against the required cutoff.
 */
export type ProductAbcSourceEvidence = Readonly<{
  /** Cutoff the owner's latest complete generation reached; `null` when none. */
  actualCutoff: string | null;
  latestAttemptState: 'RUNNING' | 'COMPLETE' | 'FAILED' | null;
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
 * shows the same grade, freshness and display word for a product because
 * they all read this projection off one evidence snapshot, never their own.
 * The word itself is not published: consumers derive it from these facts with
 * `productAbcDisplayStatus`.
 */
export function buildProductAbcReadModel(
  input: ProductAbcReadModelInput,
): ProductAbcReadModel {
  const { evaluation, evidence, formulaState } = input;
  return ProductAbcReadModelSchema.parse({
    // The official grade follows the retained evaluation; a product with no
    // retained evaluation exposes no official grade.
    abcGrade: evaluation?.abcGrade ?? null,
    evaluation,
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

/**
 * The owner's readiness for one source. The latest complete generation is the
 * one the owner reported a cutoff for, whether or not a compatible pair
 * selected it, so the published `ready` is the owner's and a complete source
 * never reads as missing because the other source has nothing to pair with.
 */
function sourceReadiness(
  source: ProductAbcSourceEvidence,
  requiredCutoff: string,
) {
  const latestAttempt: SourceReadinessAttempt | null = source.latestAttemptState
    ? { state: source.latestAttemptState }
    : null;
  const latestComplete = source.actualCutoff !== null
    ? { actualCutoff: source.actualCutoff }
    : null;
  return {
    ...deriveSourceReadiness({ latestAttempt, latestComplete, requiredCutoff }),
    latestAttempt,
    latestComplete,
  };
}
