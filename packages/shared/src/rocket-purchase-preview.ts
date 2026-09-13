import type { RocketPurchasePreviewReason } from './schemas/rocket-purchase-preview.js';

export * from './schemas/rocket-purchase-preview.js';

/**
 * Operator words for a preview row's reason. Rocket review and the Supply
 * workspace render the same reason with the same word.
 */
export const ROCKET_PURCHASE_PREVIEW_REASON_LABELS = {
  mapping_required: '상품 연결 필요',
  configuration_required: '재고 구성 필요',
  review_required: '레시피 검토 필요',
  inventory_unavailable: 'Sellpia 재고 미수집',
  insufficient_capacity: 'Sellpia 재고 부족',
  collection_incomplete: '수집 검증 필요',
  vendor_mismatch: '공급사 검증 필요',
} as const satisfies Record<RocketPurchasePreviewReason, string>;
