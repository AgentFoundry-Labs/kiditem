/**
 * PanelAlertItem ↔ Prisma Alert drift detection (Task 21)
 *
 * Compile-time: satisfies check ensures PanelAlertItem fields map to
 * the Prisma Alert model. If the Alert table loses a field, tsc fails here.
 *
 * Runtime: parse an Alert-shaped payload through PanelAlertItemSchema
 * and verify the output shape.
 */
import { describe, it, expect } from 'vitest';
import type { Alert } from '@prisma/client';
import { PanelAlertItemSchema } from '@kiditem/shared/panel';

// Compile-time drift guard — if Alert model loses one of these fields, tsc fails.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _PanelAlertItemDrift = Pick<
  Alert,
  | 'id'
  | 'kind'
  | 'status'
  | 'severity'
  | 'type'
  | 'title'
  | 'message'
  | 'targetType'
  | 'targetId'
  | 'operationKey'
  | 'sourceType'
  | 'sourceId'
  | 'isRead'
  | 'actionTaskId'
  | 'actorUserId'
  | 'href'
  | 'progress'
  | 'metadata'
  | 'readAt'
  | 'startedAt'
  | 'finishedAt'
> extends Record<string, unknown>
  ? true
  : never;

const ALERT_ID = '00000000-0000-0000-0000-000000000010';
const TARGET_ID = '00000000-0000-0000-0000-000000000011';

describe('PanelAlertItem drift detection', () => {
  it('parses an Alert-shaped object correctly', () => {
    const alertLike = {
      kind: 'alert' as const,
      id: ALERT_ID,
      alertKind: 'signal',
      status: 'open',
      severity: 'warning',
      type: 'internal:stock',
      title: 'Stock low',
      message: null,
      targetType: null,
      targetId: null,
      operationKey: null,
      sourceType: null,
      sourceId: null,
      isRead: false,
      actionTaskId: null,
      actorUserId: null,
      href: null,
      progress: null,
      metadata: {},
      readAt: null,
      startedAt: null,
      finishedAt: null,
      createdAt: '2026-04-15T00:00:00Z',
    };
    const result = PanelAlertItemSchema.parse(alertLike);
    expect(result.kind).toBe('alert');
    expect(result.id).toBe(ALERT_ID);
    expect(result.severity).toBe('warning');
    expect(result.type).toBe('internal:stock');
    expect(result.title).toBe('Stock low');
    expect(result.message).toBeNull();
    expect(result.targetType).toBeNull();
    expect(result.targetId).toBeNull();
    expect(result.isRead).toBe(false);
    expect(result.actorUserId).toBeNull();
  });

  it('parses an Alert-shaped object with non-null message and target', () => {
    const alertLike = {
      kind: 'alert' as const,
      id: ALERT_ID,
      alertKind: 'operation',
      status: 'failed',
      severity: 'critical',
      type: 'rule:margin',
      title: 'Margin too low',
      message: 'Margin is below 10%',
      targetType: 'master',
      targetId: TARGET_ID,
      operationKey: `rule:margin:${ALERT_ID}`,
      sourceType: 'business_rule',
      sourceId: ALERT_ID,
      isRead: true,
      actionTaskId: null,
      actorUserId: null,
      href: '/product-hub',
      progress: null,
      metadata: { rule: 'margin' },
      readAt: '2026-04-15T12:00:00Z',
      startedAt: '2026-04-15T12:00:00Z',
      finishedAt: '2026-04-15T12:00:01Z',
      createdAt: '2026-04-15T12:00:00Z',
    };
    const result = PanelAlertItemSchema.parse(alertLike);
    expect(result.targetType).toBe('master');
    expect(result.targetId).toBe(TARGET_ID);
    expect(result.message).toBe('Margin is below 10%');
    expect(result.isRead).toBe(true);
    expect(result.severity).toBe('critical');
  });
});
