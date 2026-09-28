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
 * One source's owner readiness facts. Structural on purpose: the domain states
 * what it needs, not where Finance keeps it. Readiness itself is derived from
 * `actualCutoff` against the source's own required cutoff.
 */
export type ProductAbcSourceEvidence = Readonly<{
  /**
   * The cutoff the owner requires of this source: the evidence cutoff for
   * Sellpia, and for advertising the last day Coupang has reported by then.
   */
  requiredCutoff: string;
  /** Cutoff the owner's latest complete generation reached; `null` when none. */
  actualCutoff: string | null;
  latestAttemptState: 'RUNNING' | 'COMPLETE' | 'FAILED' | null;
}>;

export type ProductAbcEvidenceView = Readonly<{
  /** Cutoff the evidence actually reached; `null` when it has none. */
  actualCutoff: string | null;
  /** Mapping generation of the selected Sellpia generation; `null` when none. */
  mappingGeneration: string | null;
  sellpia: ProductAbcSourceEvidence;
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
      sellpia: sourceReadiness(evidence.sellpia),
      mapping: {
        valid: input.mappingValid,
        currentMappingGeneration: formulaState.mappingGeneration,
        evidenceMappingGeneration: evidence.mappingGeneration,
      },
    },
  });
}

/**
 * The owner's readiness for the Sellpia source. The latest complete generation
 * is the one the owner reported a cutoff for, whether or not it was selected,
 * so the published `ready` is the owner's.
 */
function sourceReadiness(source: ProductAbcSourceEvidence) {
  const latestAttempt: SourceReadinessAttempt | null = source.latestAttemptState
    ? { state: source.latestAttemptState }
    : null;
  const latestComplete = source.actualCutoff !== null
    ? { actualCutoff: source.actualCutoff }
    : null;
  return {
    ...deriveSourceReadiness({
      latestAttempt,
      latestComplete,
      requiredCutoff: source.requiredCutoff,
    }),
    latestAttempt,
    latestComplete,
  };
}
