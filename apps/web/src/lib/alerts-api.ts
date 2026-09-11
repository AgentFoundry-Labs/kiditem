'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-keys';

export const ALERT_POLL_INTERVAL_MS = 10_000;

export interface AlertRecord {
  id: string;
  title: string;
  message: string | null;
  status: string;
  severity: string;
  isRead: boolean;
  href: string | null;
  createdAt: string;
  updatedAt: string;
}

export function fetchAlerts(): Promise<AlertRecord[]> {
  return apiClient.get<AlertRecord[]>('/api/alerts');
}

export function useAlertsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.alerts.all,
    queryFn: fetchAlerts,
    enabled,
    refetchInterval: ALERT_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

/**
 * "Needs attention": unread and still open. Written three times, independently,
 * in Sidebar, AlertsPopover, and the dashboard panel — which is how two badges
 * came to show different numbers for the same state.
 */
export function needsAttention(alert: { isRead: boolean; status: string }): boolean {
  return !alert.isRead && alert.status === 'OPEN';
}

export function unreadOpenAlertCount(
  alerts: readonly { isRead: boolean; status: string }[],
): number {
  return alerts.filter(needsAttention).length;
}

export function dismissAlert(id: string): Promise<{ ok: true }> {
  return apiClient.post<{ ok: true }>(
    `/api/alerts/${encodeURIComponent(id)}/dismiss`,
  );
}

/**
 * Dismiss one alert and reconcile every surface showing it.
 *
 * The two surfaces owned this separately and disagreed: the popover invalidated
 * the alert list alone, so dismissing there left the dashboard's copy on screen,
 * while the dashboard invalidated its whole query family to update one row. The
 * dashboard still receives its alerts inside the inventory payload, so both keys
 * have to go — that is one fact, and it lives here.
 */
export function useDismissAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: dismissAlert,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      ]);
    },
  });
}
