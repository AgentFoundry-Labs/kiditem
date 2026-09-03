import { describe, expect, it } from 'vitest';
import {
  AlertItemSchema,
  AlertKindSchema,
  AlertOperationLifecycleStatusSchema,
  AlertStatusSchema,
  SourceFailureAlertInputSchema,
  SourceFailureAlertItemSchema,
  UpdateOperationAlertRequestSchema,
} from './alerts.js';

const ALERT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const TARGET_ID = '00000000-0000-0000-0000-000000000003';
const ATTEMPT_ID = '00000000-0000-0000-0000-000000000005';

describe('Alert ledger schemas', () => {
  it('parses operation ledger fields and preserves them in the output', () => {
    const parsed = AlertItemSchema.parse({
      id: ALERT_ID,
      organizationId: '00000000-0000-0000-0000-000000000004',
      kind: 'operation',
      status: 'running',
      type: 'ai.detail_page.generate',
      severity: 'info',
      title: '상세페이지 생성 중',
      message: null,
      targetType: 'master',
      targetId: TARGET_ID,
      operationKey: `ai.detail_page:${ALERT_ID}`,
      sourceType: 'content_generation',
      sourceId: ALERT_ID,
      actorUserId: USER_ID,
      actionTaskId: null,
      href: `/generate/${ALERT_ID}`,
      progress: 0.4,
      metadata: { templateId: 'bold-vertical' },
      isRead: false,
      readAt: null,
      startedAt: '2026-05-07T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:01.000Z',
    });

    expect(parsed.kind).toBe('operation');
    expect(parsed.status).toBe('running');
    expect(parsed.operationKey).toBe(`ai.detail_page:${ALERT_ID}`);
    expect(parsed.actorUserId).toBe(USER_ID);
    expect(parsed.metadata).toEqual({ templateId: 'bold-vertical' });
  });

  it('keeps the signal defaults explicit for non-operation alerts', () => {
    const parsed = AlertItemSchema.parse({
      id: ALERT_ID,
      organizationId: '00000000-0000-0000-0000-000000000004',
      kind: 'signal',
      status: 'open',
      type: 'rule_violation',
      severity: 'critical',
      title: '마진 규칙 위반',
      message: '확인이 필요합니다',
      targetType: 'master',
      targetId: TARGET_ID,
      operationKey: null,
      sourceType: null,
      sourceId: null,
      actorUserId: null,
      actionTaskId: null,
      href: null,
      progress: null,
      metadata: {},
      isRead: false,
      readAt: null,
      startedAt: null,
      finishedAt: null,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    });

    expect(parsed.kind).toBe('signal');
    expect(parsed.status).toBe('open');
    expect(parsed.operationKey).toBeNull();
  });

  it('rejects unknown canonical ledger values', () => {
    expect(() => AlertKindSchema.parse('task')).toThrow();
    expect(() => AlertStatusSchema.parse('queued')).toThrow();
  });

  it('accepts pending as an operation lifecycle status', () => {
    expect(AlertOperationLifecycleStatusSchema.parse('pending')).toBe(
      'pending',
    );
  });

  it('does not accept a client-supplied lifecycle href override', () => {
    const parsed = UpdateOperationAlertRequestSchema.parse({
      status: 'succeeded',
      href: '/settings',
    });

    expect(parsed).not.toHaveProperty('href');
  });

  it('parses the focused source-failure alert projection', () => {
    const parsed = SourceFailureAlertItemSchema.parse({
      id: ALERT_ID,
      organizationId: '00000000-0000-0000-0000-000000000004',
      dedupeKey: 'sellpia:profitability:2026-08',
      sourceType: 'sellpia_product_profitability',
      attemptId: ATTEMPT_ID,
      status: 'OPEN',
      severity: 'error',
      title: 'Sellpia 수익성 수집 실패',
      message: '공급가를 확인할 수 없습니다.',
      href: '/analytics/sellpia-product-sales',
      isRead: false,
      readAt: null,
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    });

    expect(parsed.status).toBe('OPEN');
    expect(parsed.attemptId).toBe(ATTEMPT_ID);
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
