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
  unmatched: number;
  failed: number;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
}

interface CoupangSyncCurrentResponse {
  job: CoupangSyncStatus | null;
}

interface CoupangInventoryImageRow {
  inventoryId: string;
  legacyCode?: string | null;
  name: string;
  url: string;
}

interface ExtensionMessageResponse {
  success?: boolean;
  error?: string;
  pendingLogin?: boolean;
  rows?: CoupangInventoryImageRow[];
  total?: number;
}

type ChromeRuntime = {
  runtime?: {
    sendMessage?: (id: string, msg: unknown, cb: (resp: unknown) => void) => void;
    lastError?: { message?: string };
  };
};

const STORAGE_KEY = 'kiditem:coupang-image-sync:job-id';
const EXTENSION_ID_KEY = 'kiditem-ext-id';

function readStoredJobId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function writeStoredJobId(jobId: string | null) {
  if (typeof window === 'undefined') return;
  if (jobId) window.localStorage.setItem(STORAGE_KEY, jobId);
  else window.localStorage.removeItem(STORAGE_KEY);
}

function getChrome(): ChromeRuntime | undefined {
  return (window as unknown as { chrome?: ChromeRuntime }).chrome;
}

function sendToExtension(id: string, message: unknown): Promise<ExtensionMessageResponse> {
  return new Promise((resolve, reject) => {
    try {
      const chrome = getChrome();
      if (!chrome?.runtime?.sendMessage) {
        reject(new Error('Chrome 익스텐션 API 미지원'));
        return;
      }
      chrome.runtime.sendMessage(id, message, (response: unknown) => {
        if (chrome.runtime?.lastError) {
          reject(new Error(chrome.runtime.lastError.message ?? '익스텐션 통신 실패'));
          return;
        }
        resolve(response as ExtensionMessageResponse);
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function detectExtensionId(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const tryPing = async (id: string): Promise<boolean> => {
    try {
      const response = await sendToExtension(id, { action: 'ping' });
      return !!response?.success;
    } catch {
      return false;
    }
  };

  const stored = window.localStorage.getItem(EXTENSION_ID_KEY);
  if (stored && (await tryPing(stored))) return stored;

  const fromHandshake = await new Promise<string | null>((resolve) => {
    let done = false;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; extensionId?: string } | null;
      if (!data || data.type !== 'kiditem:ext-id' || !data.extensionId) return;
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      window.localStorage.setItem(EXTENSION_ID_KEY, data.extensionId);
      resolve(data.extensionId);
    };

    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'kiditem:request-ext-id' }, window.location.origin);
    window.setTimeout(() => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      resolve(null);
    }, 1200);
  });

  if (fromHandshake && (await tryPing(fromHandshake))) return fromHandshake;
  return null;
}

async function scrapeRowsWithExtension(): Promise<CoupangInventoryImageRow[] | null> {
  const extensionId = await detectExtensionId();
  if (!extensionId) return null;

  const response = await sendToExtension(extensionId, { action: 'scrapeCoupangImageRows' });
  if (!response?.success) {
    throw new Error(
      response?.error ??
        (response?.pendingLogin
          ? '쿠팡 Wing 로그인 필요 — 열린 Wing 이미지 동기화 창에서 로그인 후 다시 시도하세요.'
          : '쿠팡 익스텐션 이미지 수집 실패'),
    );
  }

  return Array.isArray(response.rows) ? response.rows : [];
}

export function useCoupangImageSync() {
  const [jobId, setJobId] = useState<string | null>(() => readStoredJobId());

  const startMutation = useMutation({
    mutationFn: async () => {
      const extensionRows = await scrapeRowsWithExtension();
      if (extensionRows) {
        return apiClient.post<{ jobId: string }>('/api/coupang-image-sync/from-rows', {
          rows: extensionRows,
        });
      }
      return apiClient.post<{ jobId: string }>('/api/coupang-image-sync', {});
    },
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
