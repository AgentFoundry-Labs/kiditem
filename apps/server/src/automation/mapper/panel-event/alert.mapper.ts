import { PanelAlertItem } from '@kiditem/shared/panel';
import { Prisma } from '@prisma/client';
import type { Alert } from '@prisma/client';

/**
 * Alert 테이블 레코드를 PanelAlertItem으로 변환.
 */
function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export const alertPanelMapper = {
  mapToItem(alert: Alert): PanelAlertItem {
    return PanelAlertItem.parse({
      kind: 'alert',
      id: alert.id,
      alertKind: alert.kind,
      status: alert.status,
      severity: alert.severity,
      type: alert.type,
      title: alert.title,
      message: alert.message ?? null,
      targetType: alert.targetType ?? null,
      targetId: alert.targetId ?? null,
      operationKey: alert.operationKey ?? null,
      sourceType: alert.sourceType ?? null,
      sourceId: alert.sourceId ?? null,
      isRead: alert.isRead,
      actionTaskId: alert.actionTaskId ?? null,
      actorUserId: alert.actorUserId ?? null,
      href: alert.href ?? null,
      progress: alert.progress ?? null,
      metadata: jsonObject(alert.metadata),
      readAt: alert.readAt ? alert.readAt.toISOString() : null,
      startedAt: alert.startedAt ? alert.startedAt.toISOString() : null,
      finishedAt: alert.finishedAt ? alert.finishedAt.toISOString() : null,
      createdAt: alert.createdAt.toISOString(),
    });
  },
};
