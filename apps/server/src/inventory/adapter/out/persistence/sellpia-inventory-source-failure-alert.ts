import type { SourceFailureAlertInput } from '@kiditem/shared/alerts';

export const SELLPIA_INVENTORY_ALERT_DEDUPE_KEY = 'source:sellpia-inventory';

export function sellpiaInventorySourceFailureAlert(input: {
  organizationId: string;
  attemptId: string;
  errorCode: string;
  errorMessage: string;
}): SourceFailureAlertInput {
  return {
    organizationId: input.organizationId,
    dedupeKey: SELLPIA_INVENTORY_ALERT_DEDUPE_KEY,
    sourceType: 'sellpia_inventory',
    attemptId: input.attemptId,
    code: input.errorCode,
    title: '셀피아 재고 수집 실패',
    message: input.errorMessage,
    href: '/stock-ops',
  };
}
