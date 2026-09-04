'use client';

import { useQuery } from '@tanstack/react-query';
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

export function dismissAlert(id: string): Promise<{ ok: true }> {
  return apiClient.post<{ ok: true }>(
    `/api/alerts/${encodeURIComponent(id)}/dismiss`,
  );
}
