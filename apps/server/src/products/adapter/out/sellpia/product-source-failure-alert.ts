import type { SourceFailureAlertInput } from '@kiditem/shared/alerts';

export const PRODUCT_SOURCE_ALERT_DEDUPE_KEY = 'source:sellpia-products';

export function productSourceFailureAlert(input: {
  organizationId: string;
  attemptId: string;
  errorCode: string;
  errorMessage: string;
}): SourceFailureAlertInput {
  return {
    organizationId: input.organizationId,
    dedupeKey: PRODUCT_SOURCE_ALERT_DEDUPE_KEY,
    sourceType: 'sellpia_inventory',
    attemptId: input.attemptId,
    code: input.errorCode,
    title: '셀피아 상품 수집 실패',
    message: input.errorMessage,
    href: '/product-hub',
  };
}
