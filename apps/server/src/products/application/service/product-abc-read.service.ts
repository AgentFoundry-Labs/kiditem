import { Inject, Injectable } from '@nestjs/common';
import {
  MASTER_PRODUCT_PROFITABILITY_READ_PORT,
  type ProfitabilityEvidence,
  type ProfitabilityEvidenceSnapshot,
} from '../../../finance/application/port/in/master-product-profitability-read.port';
import {
  MASTER_PRODUCT_ABC_REPOSITORY_PORT,
  type ProductAbcRepositoryPort,
} from '../port/out/repository/master-product-abc.repository.port';
import { productAbcEvidenceCutoff } from '../../domain/product-abc-display-status';
import {
  buildProductAbcReadModel,
  type ProductAbcEvidenceView,
  type ProductAbcFormulaStateView,
  type ProductAbcSourceEvidence,
} from '../../domain/product-abc-read-model';
import type {
  ProductAbcReadPort,
  ProductAbcSnapshot,
  ProductAbcView,
} from '../port/in/product-abc-read.port';

/**
 * Products' published ABC read.
 *
 * Products asks the profitability owner for evidence at its own cutoff — the
 * latest closed KST day — and derives the display status once. Consumers read
 * the result; none of them chooses a cutoff, so none of them can ask an easier
 * question than Product Hub does (ADR 0002).
 */
@Injectable()
export class ProductAbcReadService implements ProductAbcReadPort {
  constructor(
    @Inject(MASTER_PRODUCT_ABC_REPOSITORY_PORT)
    private readonly repository: ProductAbcRepositoryPort,
    @Inject(MASTER_PRODUCT_PROFITABILITY_READ_PORT)
    private readonly evidence: ProfitabilityEvidence,
  ) {}

  async readAbc(input: {
    organizationId: string;
    masterProductIds: readonly string[];
  }): Promise<ProductAbcSnapshot> {
    const targetCutoff = productAbcEvidenceCutoff(new Date());
    const [published, snapshot] = await Promise.all([
      this.repository.readPublication(input.organizationId, input.masterProductIds),
      this.evidence.load({ organizationId: input.organizationId, targetCutoff }),
    ]);

    const evidence = evidenceView(snapshot);
    const publication = published.publication;
    const formulaStateView: ProductAbcFormulaStateView = {
      formulaRevision: publication?.formulaRevision ?? published.currentFormulaRevision,
      publicationRevision: publication?.publicationRevision ?? 0,
      officialCutoffDate: publication?.officialCutoffDate ?? null,
      publishedAt: publication?.publishedAt ?? null,
      mappingGeneration: published.currentMappingGeneration,
    };
    const evidenceByProduct = new Map(
      snapshot.products.map((product) => [product.masterProductId, product] as const),
    );
    const products = published.products.map((record) => ({
      masterProductId: record.masterProductId,
      contributionEligible: record.contributionEligible,
      abc: buildProductAbcReadModel({
        evaluation: record.evaluation,
        mappingValid: evidenceByProduct.get(record.masterProductId)?.mappingValid ?? false,
        saleStartDate: evidenceByProduct.get(record.masterProductId)?.saleStartDate ?? null,
        evidence,
        formulaState: {
          ...formulaStateView,
          formulaRevision: record.evaluation?.formulaRevision
            ?? formulaStateView.formulaRevision,
        },
      }),
    } satisfies ProductAbcView));

    return {
      targetCutoff,
      actualCutoff: snapshot.actualCutoff,
      capturedAt: latestCapturedAt(snapshot),
      publication,
      products,
    };
  }
}

function evidenceView(snapshot: ProfitabilityEvidenceSnapshot): ProductAbcEvidenceView {
  return {
    requiredCutoff: snapshot.targetCutoff,
    actualCutoff: snapshot.actualCutoff,
    mappingGeneration: snapshot.mappingGeneration,
    sellpia: sourceEvidence(snapshot, 'sellpia'),
    advertising: sourceEvidence(snapshot, 'advertising'),
  };
}

function sourceEvidence(
  snapshot: ProfitabilityEvidenceSnapshot,
  source: 'sellpia' | 'advertising',
): ProductAbcSourceEvidence {
  const readiness = snapshot.sources[source];
  return {
    actualCutoff: readiness.actualCutoff,
    latestAttemptState: readiness.latestAttempt?.state ?? null,
  };
}

/**
 * A snapshot is only as recently observed as its most recent source read, and
 * either source may publish none.
 */
function latestCapturedAt(snapshot: ProfitabilityEvidenceSnapshot): string | null {
  return [
    snapshot.sourceVector.sellpia.capturedAt,
    snapshot.sourceVector.advertising.capturedAt,
  ].reduce<string | null>(
    (latest, value) =>
      value !== null && (latest === null || value > latest) ? value : latest,
    null,
  );
}
