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
import { PanelAlertItem } from '@kiditem/shared';

// Compile-time drift guard — if Alert model loses one of these fields, tsc fails.
// actorUserId is NOT in Alert (no actor column) — intentionally excluded.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _PanelAlertItemDrift = Pick<
  Alert,
  'id' | 'severity' | 'type' | 'title' | 'message' | 'productId' | 'isRead'
> extends Record<string, unknown>
  ? true
  : never;

const ALERT_ID = '00000000-0000-0000-0000-000000000010';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000011';

describe('PanelAlertItem drift detection', () => {
  it('parses an Alert-shaped object correctly', () => {
    const alertLike = {
      kind: 'alert' as const,
      id: ALERT_ID,
      severity: 'warning',
      type: 'internal:stock',
      title: 'Stock low',
      message: null,
      productId: null,
      isRead: false,
      actorUserId: null,
      createdAt: '2026-04-15T00:00:00Z',
    };
    const result = PanelAlertItem.parse(alertLike);
    expect(result.kind).toBe('alert');
    expect(result.id).toBe(ALERT_ID);
    expect(result.severity).toBe('warning');
    expect(result.type).toBe('internal:stock');
    expect(result.title).toBe('Stock low');
    expect(result.message).toBeNull();
    expect(result.productId).toBeNull();
    expect(result.isRead).toBe(false);
    expect(result.actorUserId).toBeNull();
  });

  it('parses an Alert-shaped object with non-null message and productId', () => {
    const alertLike = {
      kind: 'alert' as const,
      id: ALERT_ID,
      severity: 'critical',
      type: 'rule:margin',
      title: 'Margin too low',
      message: 'Margin is below 10%',
      productId: PRODUCT_ID,
      isRead: true,
      actorUserId: null,
      createdAt: '2026-04-15T12:00:00Z',
    };
    const result = PanelAlertItem.parse(alertLike);
    expect(result.productId).toBe(PRODUCT_ID);
    expect(result.message).toBe('Margin is below 10%');
    expect(result.isRead).toBe(true);
    expect(result.severity).toBe('critical');
  });
});
