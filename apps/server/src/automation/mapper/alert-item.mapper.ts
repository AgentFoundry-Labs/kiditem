import type { Alert, Prisma } from '@prisma/client';
import type { AlertItem } from '@kiditem/shared/alerts';

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Boundary mapper from a Prisma `Alert` row to the shared `AlertItem`
 * shape used by HTTP responses (`GET /api/alerts`, the operation-alert
 * lifecycle endpoints) and consumed by the frontend panel store. The
 * `alertPanelMapper` (under `mapper/panel-event/`) is a separate mapping
 * for the SSE projection — it produces `PanelAlertItem`, which omits
 * `organizationId` and renames `kind`. Keep these two mappers in sync
 * field-for-field when extending the Alert schema.
 */
export function mapAlertRowToItem(alert: Alert): AlertItem {
  return {
    id: alert.id,
    organizationId: alert.organizationId,
    kind: alert.kind as AlertItem['kind'],
    status: alert.status as AlertItem['status'],
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message ?? null,
    targetType: alert.targetType ?? null,
    targetId: alert.targetId ?? null,
    operationKey: alert.operationKey ?? null,
    sourceType: alert.sourceType ?? null,
    sourceId: alert.sourceId ?? null,
    actorUserId: alert.actorUserId ?? null,
    actionTaskId: alert.actionTaskId ?? null,
    href: alert.href ?? null,
    progress: alert.progress ?? null,
    metadata: jsonObject(alert.metadata),
    isRead: alert.isRead,
    readAt: alert.readAt ? alert.readAt.toISOString() : null,
    startedAt: alert.startedAt ? alert.startedAt.toISOString() : null,
    finishedAt: alert.finishedAt ? alert.finishedAt.toISOString() : null,
    createdAt: alert.createdAt.toISOString(),
    updatedAt: alert.updatedAt.toISOString(),
  } satisfies AlertItem;
}
