'use client';

// Frontend client for `Alert.kind='operation'` lifecycle.
//
// Use these helpers from any browser-driven, long-running flow (extension
// scrapes, multi-step uploads, anything where the user might leave the page
// before it finishes). Operation alerts surface in the panel as
// running/succeeded/failed/cancelled and ride the same SSE projection as
// server-emitted operation alerts.
//
// Tenancy: organizationId / actorUserId are bound on the server from the
// auth session. Never include them in the request body.
//
// Idempotency: `(operationKey)` per-organization is unique on the server.
// Re-calling `startOperationAlert` with the same operationKey reuses the
// existing row (running) instead of creating a duplicate, so `useEffect`
// cleanup races and rapid double-clicks are safe.

import type {
  AlertItem,
  AlertOperationLifecycleStatus,
  AlertSeverity,
  StartOperationAlertRequest,
  UpdateOperationAlertRequest,
} from '@kiditem/shared/alerts';
import { apiClient } from './api-client';

export type OperationAlertHandle = {
  operationKey: string;
};

export interface StartOperationAlertInput {
  operationKey: string;
  type: string;
  title: string;
  message?: string;
  sourceType: string;
  sourceId?: string | null;
  href: string;
  severity?: AlertSeverity;
  progress?: number | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateOperationAlertInput {
  status: AlertOperationLifecycleStatus;
  message?: string | null;
  progress?: number | null;
  severity?: AlertSeverity;
  metadata?: Record<string, unknown>;
}

export async function startOperationAlert(
  input: StartOperationAlertInput,
): Promise<AlertItem | null> {
  const body: StartOperationAlertRequest = {
    operationKey: input.operationKey,
    type: input.type,
    title: input.title,
    message: input.message ?? undefined,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? undefined,
    href: input.href,
    severity: input.severity,
    progress: input.progress ?? undefined,
    metadata: input.metadata,
  };
  try {
    return await apiClient.post<AlertItem>('/api/operation-alerts/start', body);
  } catch (err) {
    // Alert is observability — never block the underlying business flow.
    console.warn('[operation-alerts] start failed', err);
    return null;
  }
}

export async function updateOperationAlert(
  operationKey: string,
  input: UpdateOperationAlertInput,
): Promise<AlertItem | null> {
  const body: UpdateOperationAlertRequest = {
    status: input.status,
    message: input.message ?? undefined,
    progress: input.progress ?? undefined,
    severity: input.severity,
    metadata: input.metadata,
  };
  try {
    return await apiClient.patch<AlertItem>(
      `/api/operation-alerts/${encodeURIComponent(operationKey)}`,
      body,
    );
  } catch (err) {
    // 404 = no matching alert (caller never started one, or it was already
    // closed by another tab). Log + swallow so the calling hook can finish
    // its own state machine.
    console.warn(`[operation-alerts] update ${input.status} failed`, err);
    return null;
  }
}

export const succeedOperationAlert = (
  operationKey: string,
  patch: Omit<UpdateOperationAlertInput, 'status'> = {},
) => updateOperationAlert(operationKey, { ...patch, status: 'succeeded' });

export const failOperationAlert = (
  operationKey: string,
  patch: Omit<UpdateOperationAlertInput, 'status'> = {},
) => updateOperationAlert(operationKey, { ...patch, status: 'failed' });

export const cancelOperationAlert = (
  operationKey: string,
  patch: Omit<UpdateOperationAlertInput, 'status'> = {},
) => updateOperationAlert(operationKey, { ...patch, status: 'cancelled' });

export const progressOperationAlert = (
  operationKey: string,
  patch: Omit<UpdateOperationAlertInput, 'status'> = {},
) => updateOperationAlert(operationKey, { ...patch, status: 'running' });

export const requireAttentionOperationAlert = (
  operationKey: string,
  patch: Omit<UpdateOperationAlertInput, 'status'> = {},
) =>
  updateOperationAlert(operationKey, {
    ...patch,
    status: 'pending',
    severity: patch.severity ?? 'warning',
  });
