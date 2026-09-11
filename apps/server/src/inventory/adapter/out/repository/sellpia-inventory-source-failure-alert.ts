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
    severity: 'error',
    title: '셀피아 재고 수집 실패',
    message: input.errorMessage.slice(0, 300),
    href: '/stock-ops',
  };
}
