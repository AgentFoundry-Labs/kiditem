import type {
  ProductAbcContributionMetricBasis,
  ProductAbcContributionMetricStatus,
  ProductAbcDisplayStatus,
  ProductAbcEvaluation,
  ProductAbcMappingFacts,
  ProductAbcMappingStatus,
} from './schemas/product-abc.js';

export * from './schemas/product-abc.js';

/**
 * The facts of a published ABC read model that decide its display word. A
 * `ProductAbcReadModel` satisfies this shape, so consumers pass it directly.
 */
export type ProductAbcDisplayStatusFacts = Readonly<{
  evaluation: ProductAbcEvaluation | null;
  sources: Readonly<{
    mapping: Readonly<{ valid: boolean }>;
    sellpia: Readonly<{ ready: boolean }>;
    advertising: Readonly<{ ready: boolean }>;
  }>;
}>;

/**
 * Derives the one ABC display word from mapping, source readiness and the
 * retained evaluation. Server counts, filters and every screen call this; no
 * producer publishes the word.
 */
export function productAbcDisplayStatus(
  facts: ProductAbcDisplayStatusFacts,
): ProductAbcDisplayStatus {
  if (!facts.sources.mapping.valid) return 'SOURCE_UNMAPPED';
  if (!facts.sources.sellpia.ready) return 'SELLPIA_SOURCE_STALE';
  if (!facts.sources.advertising.ready) return 'AD_SOURCE_STALE';
  // A product the evaluation has not graded is one still gathering evidence,
  // whether because it is young or because its months are short. Both wait.
  return facts.evaluation !== null ? 'READY' : 'INSUFFICIENT_EVIDENCE';
}

export const PRODUCT_ABC_DISPLAY_STATUS_LABELS = {
  READY: '계산 완료',
  INSUFFICIENT_EVIDENCE: '관찰 중',
  SOURCE_UNMAPPED: '상품 매핑 필요',
  SELLPIA_SOURCE_STALE: 'Sellpia 원천 갱신 필요',
  AD_SOURCE_STALE: '광고비 원천 갱신 필요',
} as const satisfies Record<ProductAbcDisplayStatus, string>;

export const PRODUCT_ABC_MAPPING_STATUS_LABELS = {
  READY: '매핑 최신',
  UNMAPPED: '상품 매핑 필요',
  STALE: '매핑 갱신 필요',
} as const satisfies Record<ProductAbcMappingStatus, string>;

export const PRODUCT_ABC_CONTRIBUTION_STATUS_LABELS = {
  READY: '비중 계산 완료',
  NO_DENOMINATOR: '비중 미산출',
  SOURCE_INCOMPLETE: '원천 미수집',
} as const satisfies Record<ProductAbcContributionMetricStatus, string>;

/** Derives mapping freshness from the current and evidence generations. */
export function productAbcMappingStatus(
  facts: ProductAbcMappingFacts,
): ProductAbcMappingStatus {
  if (!facts.valid) return 'UNMAPPED';
  return facts.evidenceMappingGeneration === facts.currentMappingGeneration
    ? 'READY'
    : 'STALE';
}

/** Derives a contribution word from source and denominator facts. */
export function productAbcContributionMetricStatus(
  facts: ProductAbcContributionMetricBasis,
): ProductAbcContributionMetricStatus {
  if (!facts.sourceComplete || facts.excludedProductCount > 0) {
    return 'SOURCE_INCOMPLETE';
  }
  return facts.denominator === null ? 'NO_DENOMINATOR' : 'READY';
}
