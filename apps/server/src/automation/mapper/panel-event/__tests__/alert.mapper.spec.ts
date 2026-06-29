import { describe, it, expect } from 'vitest';
import { PanelAlertItemSchema } from '@kiditem/shared/panel';
import { alertPanelMapper } from '../alert.mapper';
import type { Alert } from '@prisma/client';

const ALERT_ID = '11111111-1111-1111-1111-111111111111';
const ORGANIZATION_ID = '22222222-2222-2222-2222-222222222222';
const TARGET_ID = '33333333-3333-3333-3333-333333333333';

const ACTION_TASK_ID = '44444444-4444-4444-4444-444444444444';
const USER_ID = '55555555-5555-5555-5555-555555555555';

const baseAlert: Alert = {
  id: ALERT_ID,
  organizationId: ORGANIZATION_ID,
  targetType: 'master',
  targetId: TARGET_ID,
  kind: 'signal',
  status: 'open',
  type: 'rule_violation',
  severity: 'critical',
  title: '순이익률 -10%',
  message: '가격 재검토 필요',
  operationKey: null,
  sourceType: null,
  sourceId: null,
  actorUserId: null,
  href: null,
  progress: null,
  metadata: {},
  isRead: false,
  readAt: null,
  actionTaskId: null,
  startedAt: null,
  finishedAt: null,
  createdAt: new Date('2026-04-15T00:00:00Z'),
  updatedAt: new Date('2026-04-15T00:00:00Z'),
};

describe('alertPanelMapper', () => {
  it('maps a valid alert to PanelAlertItem, passing schema validation', () => {
    const item = alertPanelMapper.mapToItem(baseAlert);
    const result = PanelAlertItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it('sets kind to "alert"', () => {
    const item = alertPanelMapper.mapToItem(baseAlert);
    expect(item.kind).toBe('alert');
  });

  it('maps all fields correctly', () => {
    const item = alertPanelMapper.mapToItem(baseAlert);
    expect(item.id).toBe(ALERT_ID);
    expect(item.alertKind).toBe('signal');
    expect(item.status).toBe('open');
    expect(item.severity).toBe('critical');
    expect(item.type).toBe('rule_violation');
    expect(item.title).toBe('순이익률 -10%');
    expect(item.message).toBe('가격 재검토 필요');
    expect(item.targetType).toBe('master');
    expect(item.targetId).toBe(TARGET_ID);
    expect(item.isRead).toBe(false);
    expect(item.readAt).toBeNull();
    expect(item.startedAt).toBeNull();
    expect(item.finishedAt).toBeNull();
    expect(item.createdAt).toBe('2026-04-15T00:00:00.000Z');
  });

  it('maps actorUserId when the alert is tied to a user-triggered operation', () => {
    const item = alertPanelMapper.mapToItem({ ...baseAlert, kind: 'operation', status: 'running', actorUserId: USER_ID });
    expect(item.alertKind).toBe('operation');
    expect(item.status).toBe('running');
    expect(item.actorUserId).toBe(USER_ID);
  });

  it('handles null targetType and targetId', () => {
    const item = alertPanelMapper.mapToItem({
      ...baseAlert,
      targetType: null,
      targetId: null,
    });
    expect(item.targetType).toBeNull();
    expect(item.targetId).toBeNull();
    const result = PanelAlertItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it('passes through non-null targetType and targetId', () => {
    const item = alertPanelMapper.mapToItem({
      ...baseAlert,
      targetType: 'product',
      targetId: TARGET_ID,
    });
    expect(item.targetType).toBe('product');
    expect(item.targetId).toBe(TARGET_ID);
    expect(PanelAlertItemSchema.safeParse(item).success).toBe(true);
  });

  it('handles null message', () => {
    const item = alertPanelMapper.mapToItem({ ...baseAlert, message: null });
    expect(item.message).toBeNull();
    const result = PanelAlertItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it.each(['critical', 'warning', 'info'] as const)(
    'accepts severity "%s"',
    (severity) => {
      const item = alertPanelMapper.mapToItem({ ...baseAlert, severity });
      expect(item.severity).toBe(severity);
      expect(PanelAlertItemSchema.safeParse(item).success).toBe(true);
    },
  );

  it('does not leak organizationId to item output', () => {
    const item = alertPanelMapper.mapToItem(baseAlert);
    expect((item as any).organizationId).toBeUndefined();
  });

  it('actionTaskId null pass-through', () => {
    const item = alertPanelMapper.mapToItem({ ...baseAlert, actionTaskId: null });
    expect(item.actionTaskId).toBeNull();
    expect(PanelAlertItemSchema.safeParse(item).success).toBe(true);
  });

  it('actionTaskId uuid pass-through', () => {
    const item = alertPanelMapper.mapToItem({ ...baseAlert, actionTaskId: ACTION_TASK_ID });
    expect(item.actionTaskId).toBe(ACTION_TASK_ID);
    expect(PanelAlertItemSchema.safeParse(item).success).toBe(true);
  });

  it('maps operation ledger fields', () => {
    const item = alertPanelMapper.mapToItem({
      ...baseAlert,
      kind: 'operation',
      status: 'failed',
      operationKey: `ai.detail_page:${ALERT_ID}`,
      sourceType: 'content_generation',
      sourceId: ALERT_ID,
      actorUserId: USER_ID,
      href: `/product-hub/${TARGET_ID}`,
      progress: 0.75,
      metadata: { step: 'render' },
      startedAt: new Date('2026-04-15T00:00:01Z'),
      finishedAt: new Date('2026-04-15T00:00:02Z'),
    });

    expect(item.alertKind).toBe('operation');
    expect(item.status).toBe('failed');
    expect(item.operationKey).toBe(`ai.detail_page:${ALERT_ID}`);
    expect(item.sourceType).toBe('content_generation');
    expect(item.sourceId).toBe(ALERT_ID);
    expect(item.href).toBe(`/product-hub/${TARGET_ID}`);
    expect(item.progress).toBe(0.75);
    expect(item.metadata).toEqual({ step: 'render' });
    expect(item.startedAt).toBe('2026-04-15T00:00:01.000Z');
    expect(item.finishedAt).toBe('2026-04-15T00:00:02.000Z');
  });
});
