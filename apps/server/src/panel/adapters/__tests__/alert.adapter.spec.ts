import { describe, it, expect } from 'vitest';
import { PanelAlertItem } from '@kiditem/shared';
import { alertPanelAdapter } from '../alert.adapter';
import type { Alert } from '@prisma/client';

const ALERT_ID = '11111111-1111-1111-1111-111111111111';
const COMPANY_ID = '22222222-2222-2222-2222-222222222222';
const PRODUCT_ID = '33333333-3333-3333-3333-333333333333';

const baseAlert: Alert = {
  id: ALERT_ID,
  companyId: COMPANY_ID,
  productId: PRODUCT_ID,
  type: 'rule_violation',
  severity: 'critical',
  title: '순이익률 -10%',
  message: '가격 재검토 필요',
  isRead: false,
  createdAt: new Date('2026-04-15T00:00:00Z'),
};

describe('alertPanelAdapter', () => {
  it('maps a valid alert to PanelAlertItem, passing schema validation', () => {
    const item = alertPanelAdapter.mapToItem(baseAlert);
    const result = PanelAlertItem.safeParse(item);
    expect(result.success).toBe(true);
  });

  it('sets kind to "alert"', () => {
    const item = alertPanelAdapter.mapToItem(baseAlert);
    expect(item.kind).toBe('alert');
  });

  it('maps all fields correctly', () => {
    const item = alertPanelAdapter.mapToItem(baseAlert);
    expect(item.id).toBe(ALERT_ID);
    expect(item.severity).toBe('critical');
    expect(item.type).toBe('rule_violation');
    expect(item.title).toBe('순이익률 -10%');
    expect(item.message).toBe('가격 재검토 필요');
    expect(item.productId).toBe(PRODUCT_ID);
    expect(item.isRead).toBe(false);
    expect(item.createdAt).toBe('2026-04-15T00:00:00.000Z');
  });

  it('actorUserId is always null regardless of input', () => {
    const item = alertPanelAdapter.mapToItem(baseAlert);
    expect(item.actorUserId).toBeNull();
  });

  it('handles null productId', () => {
    const item = alertPanelAdapter.mapToItem({ ...baseAlert, productId: null });
    expect(item.productId).toBeNull();
    const result = PanelAlertItem.safeParse(item);
    expect(result.success).toBe(true);
  });

  it('handles null message', () => {
    const item = alertPanelAdapter.mapToItem({ ...baseAlert, message: null });
    expect(item.message).toBeNull();
    const result = PanelAlertItem.safeParse(item);
    expect(result.success).toBe(true);
  });

  it.each(['critical', 'warning', 'info'] as const)(
    'accepts severity "%s"',
    (severity) => {
      const item = alertPanelAdapter.mapToItem({ ...baseAlert, severity });
      expect(item.severity).toBe(severity);
      expect(PanelAlertItem.safeParse(item).success).toBe(true);
    },
  );

  it('does not leak companyId to item output', () => {
    const item = alertPanelAdapter.mapToItem(baseAlert);
    expect((item as any).companyId).toBeUndefined();
  });
});
