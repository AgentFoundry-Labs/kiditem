import { describe, expect, it } from 'vitest';
import {
  AlertItemSchema,
  AlertKindSchema,
  AlertStatusSchema,
  SourceFailureAlertInputSchema,
} from './alerts.js';

const ALERT_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_ID = '00000000-0000-0000-0000-000000000003';
const ATTEMPT_ID = '00000000-0000-0000-0000-000000000005';

describe('Alert ledger schemas', () => {
  it('parses a focused Rules signal and preserves its owner fields', () => {
    const parsed = AlertItemSchema.parse({
      id: ALERT_ID,
      organizationId: '00000000-0000-0000-0000-000000000004',
      dedupeKey: 'rules.evaluation:request:product:rule',
      attemptId: null,
      kind: 'signal',
      status: 'OPEN',
      type: 'rule_violation',
      severity: 'critical',
      title: '마진 규칙 위반',
      message: '확인이 필요합니다',
      targetType: 'master',
      targetId: TARGET_ID,
      sourceType: 'rules_evaluation',
      sourceId: 'request',
      actorUserId: null,
      href: '/product-hub',
      metadata: { ruleName: 'margin' },
      isRead: false,
      readAt: null,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:01.000Z',
    });

    expect(parsed.kind).toBe('signal');
    expect(parsed.status).toBe('OPEN');
    expect(parsed.sourceType).toBe('rules_evaluation');
  });

  it('rejects unknown canonical ledger values', () => {
    expect(() => AlertKindSchema.parse('task')).toThrow();
    expect(() => AlertStatusSchema.parse('queued')).toThrow();
  });

  it('validates source-failure command input without accepting operation fields', () => {
    const parsed = SourceFailureAlertInputSchema.parse({
      organizationId: '00000000-0000-0000-0000-000000000004',
      dedupeKey: 'sellpia:profitability:2026-08',
      sourceType: 'sellpia_product_profitability',
      attemptId: ATTEMPT_ID,
      severity: 'critical',
      title: '수집 실패',
      message: '다시 시도해 주세요.',
      href: '/analytics/sellpia-product-sales',
    });

    expect(parsed).not.toHaveProperty('operationKey');
    expect(parsed.severity).toBe('critical');
  });
});
