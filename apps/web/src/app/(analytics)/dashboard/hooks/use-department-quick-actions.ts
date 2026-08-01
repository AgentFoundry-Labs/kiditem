'use client';

import { useCallback } from 'react';
import { operationsApi } from '@/lib/operations-api';

export type DepartmentQuickAction =
  | 'collectTrend'
  | 'refreshInventory'
  | 'syncSellpia';

export const ACTION_OPERATION_KEY: Record<DepartmentQuickAction, string> = {
  collectTrend: 'sourcing.collect_daily_trends',
  refreshInventory: 'inventory.refresh_sellpia_snapshot',
  syncSellpia: 'inventory.refresh_sellpia_snapshot',
};

function createIdempotencyKey(action: DepartmentQuickAction): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `dashboard:${action}:${suffix}`;
}

/**
 * Dashboard actions deliberately only create an OperationRun. Domain execution,
 * extension access, retry, and durable artifacts stay behind the server-owned
 * operation handler instead of being imported from another route group.
 */
export function useDepartmentQuickActions() {
  const start = useCallback((action: DepartmentQuickAction) =>
    operationsApi.start(ACTION_OPERATION_KEY[action], {
      sourceSurface: 'dashboard',
      input: {},
      idempotencyKey: createIdempotencyKey(action),
    }), []);

  return { start };
}
