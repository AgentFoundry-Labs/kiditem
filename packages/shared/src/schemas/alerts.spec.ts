import { describe, expect, it } from 'vitest';
import {
  AlertItemSchema,
  AlertStatusSchema,
  SourceFailureAlertInputSchema,
} from './alerts.js';

const ALERT_ID = '00000000-0000-0000-0000-000000000001';
const ATTEMPT_ID = '00000000-0000-0000-0000-000000000005';

describe('Alert ledger schemas', () => {
  it('parses a source failure and drops what no reader uses', () => {
    const parsed = AlertItemSchema.parse({
      id: ALERT_ID,
      // Still on the row. They simply do not travel to a reader — nothing
      // downstream reads any of them. Read state travels as `isRead`, which the
      // server derives from `readAt`.
      organizationId: '00000000-0000-0000-0000-000000000004',
      dedupeKey: 'sellpia:profitability:2026-08',
      attemptId: ATTEMPT_ID,
      kind: 'signal',
      status: 'OPEN',
      type: 'source_failure',
      severity: 'error',
      title: 'Sellpia 수익성 수집 실패',
      message: '공급가를 확인할 수 없습니다.',
      targetType: null,
      targetId: null,
      sourceType: 'sellpia_product_profitability',
      sourceId: null,
      actorUserId: null,
      href: '/analytics/sellpia-product-sales',
      metadata: {},
      isRead: false,
      readAt: null,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:01.000Z',
    });

    expect(parsed.status).toBe('OPEN');
    expect(parsed.sourceType).toBe('sellpia_product_profitability');
    // The alert follows its attempt, and that does travel.
    expect(parsed.attemptId).toBe(ATTEMPT_ID);
    for (const dropped of ['kind', 'organizationId', 'dedupeKey', 'sourceId', 'actorUserId', 'metadata', 'readAt']) {
      expect(parsed).not.toHaveProperty(dropped);
    }
  });

  it('rejects unknown canonical ledger values', () => {
    expect(() => AlertStatusSchema.parse('queued')).toThrow();
  });

  it('validates source-failure command input without accepting operation fields', () => {
    const parsed = SourceFailureAlertInputSchema.parse({
      organizationId: '00000000-0000-0000-0000-000000000004',
      dedupeKey: 'sellpia:profitability:2026-08',
      sourceType: 'sellpia_product_profitability',
      attemptId: ATTEMPT_ID,
      code: 'SELLPIA_PROFITABILITY_UNAVAILABLE',
      title: '수집 실패',
      message: '다시 시도해 주세요.',
      href: '/analytics/sellpia-product-sales',
    });

    expect(parsed).not.toHaveProperty('operationKey');
    // Severity left the command: it was 'error' at every production site. The
    // terminal code took its place, and it decides whether a row is written.
    expect(parsed).not.toHaveProperty('severity');
    expect(parsed.code).toBe('SELLPIA_PROFITABILITY_UNAVAILABLE');
  });
});
