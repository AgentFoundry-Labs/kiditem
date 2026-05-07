import { describe, expect, it } from 'vitest';
import {
  AlertItemSchema,
  AlertKindSchema,
  AlertStatusSchema,
} from './alerts.js';

const ALERT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const TARGET_ID = '00000000-0000-0000-0000-000000000003';

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
});
