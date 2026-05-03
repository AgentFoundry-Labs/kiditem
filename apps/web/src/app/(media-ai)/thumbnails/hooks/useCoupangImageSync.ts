'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface CoupangSyncStatus {
  jobId: string;
  status: 'running' | 'done' | 'failed';
  phase: 'starting' | 'scraping' | 'downloading' | 'finished';
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
}

interface CoupangSyncCurrentResponse {
  job: CoupangSyncStatus | null;
}

const STORAGE_KEY = 'kiditem:coupang-image-sync:job-id';

function readStoredJobId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function writeStoredJobId(jobId: string | null) {
  if (typeof window === 'undefined') return;
  if (jobId) window.localStorage.setItem(STORAGE_KEY, jobId);
  else window.localStorage.removeItem(STORAGE_KEY);
}

export function useCoupangImageSync() {
  const [jobId, setJobId] = useState<string | null>(() => readStoredJobId());

  const startMutation = useMutation({
    mutationFn: () => apiClient.post<{ jobId: string }>('/api/coupang-image-sync', {}),
    onSuccess: (data) => {
      if (data?.jobId) {
        writeStoredJobId(data.jobId);
        setJobId(data.jobId);
      }
    },
  });

  const currentQuery = useQuery({
    queryKey: queryKeys.coupangImageSync.current(),
    queryFn: () => apiClient.get<CoupangSyncCurrentResponse>('/api/coupang-image-sync'),
    enabled: !jobId,
    refetchInterval: (query) => {
      const data = query.state.data as CoupangSyncCurrentResponse | undefined;
      return data?.job?.status === 'running' ? 1000 : false;
    },
  });

  const statusQuery = useQuery({
    queryKey: queryKeys.coupangImageSync.job(jobId ?? ''),
    queryFn: () => apiClient.get<CoupangSyncStatus>(`/api/coupang-image-sync/${jobId}`),
    enabled: !!jobId,
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data as CoupangSyncStatus | undefined;
      if (!data) return 1000;
      return data.status === 'running' ? 1000 : false;
    },
  });

  useEffect(() => {
    const current = currentQuery.data?.job;
    if (!jobId && current?.status === 'running' && current.jobId) {
      writeStoredJobId(current.jobId);
      setJobId(current.jobId);
    }
  }, [currentQuery.data, jobId]);

  useEffect(() => {
    if (statusQuery.error && jobId) {
      writeStoredJobId(null);
      setJobId(null);
    }
  }, [jobId, statusQuery.error]);

  const reset = useCallback(() => {
    writeStoredJobId(null);
    setJobId(null);
    startMutation.reset();
  }, [startMutation]);

  const status = statusQuery.data ?? currentQuery.data?.job ?? null;
  const isRunning = startMutation.isPending || status?.status === 'running';
  const isFinished = !!status && status.status !== 'running';

  return {
    start: () => startMutation.mutate(),
    startError: startMutation.error,
    jobId,
    status,
    isRunning,
    isFinished,
    reset,
  };
}
