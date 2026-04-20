import { PanelAlertItem } from '@kiditem/shared';
import type { Alert } from '@prisma/client';

/**
 * Alert 테이블 레코드를 PanelAlertItem으로 변환.
 *
 * actorUserId: Alert에 actor 컬럼 없음 → 항상 null (PR2b 한정, 추후 ADR).
 */
export const alertPanelAdapter = {
  mapToItem(alert: Alert): PanelAlertItem {
    return PanelAlertItem.parse({
      kind: 'alert',
      id: alert.id,
      severity: alert.severity,
      type: alert.type,
      title: alert.title,
      message: alert.message ?? null,
      targetType: alert.targetType ?? null,
      targetId: alert.targetId ?? null,
      isRead: alert.isRead,
      actionTaskId: alert.actionTaskId ?? null,
      actorUserId: null,
      createdAt: alert.createdAt.toISOString(),
    });
  },
};
