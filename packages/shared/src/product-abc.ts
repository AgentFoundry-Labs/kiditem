import type {
  ProductAbcContributionMetricBasis,
  ProductAbcContributionMetricStatus,
  ProductAbcDisplayStatus,
  ProductAbcMappingFacts,
  ProductAbcMappingStatus,
} from './schemas/product-abc.js';

export * from './schemas/product-abc.js';

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
