'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  COUPANG_CATALOG_COLLECTOR_VERSION,
  type CoupangCatalogBrowserStatus,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { useAuthSession } from '@/components/providers/AuthProvider';
import { useBrowserCollectionSession } from '@/hooks/useBrowserCollectionSession';
import {
  findBrowserCollectionSession,
  syncBrowserCollectionAlert,
  updateBrowserCollectionSessionCache,
} from '@/lib/browser-collection-session';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/browser-storage';
import { detectExtensionId } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import {
  getCoupangCatalogBrowserStatus,
  startCoupangCatalogBrowser,
} from '../lib/coupang-catalog-import';
import { channelListingsApi } from '../lib/channel-listings-api';

const STORAGE_KEY = 'kiditem:coupang-catalog-import:active-run';

type ActiveRun = {
  channelAccountId: string;
  runId: string;
};

export function useCoupangCatalogImport(
  channelAccountId: string | null,
  linkedRunId: string | null = null,
) {
  const queryClient = useQueryClient();
  const { session } = useAuthSession();
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(() => readActiveRun());
  const [extensionId, setExtensionId] = useState<string | null>(null);
  const collectionSession = useBrowserCollectionSession(
    activeRun?.runId ?? linkedRunId,
  );
  const completedRunRef = useRef<string | null>(null);
  const cancelledAlertSyncRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeRun || !channelAccountId || !linkedRunId) return;
    const linked = { channelAccountId, runId: linkedRunId };
    setActiveRun(linked);
    writeActiveRun(linked);
  }, [activeRun, channelAccountId, linkedRunId]);

  const serverStatusQuery = useQuery({
    queryKey: activeRun
      ? queryKeys.coupangCatalogImports.run(activeRun.channelAccountId, activeRun.runId)
      : queryKeys.coupangCatalogImports.run('', ''),
    queryFn: () => channelListingsApi.getCoupangCatalogCollection(
      activeRun!.channelAccountId,
      activeRun!.runId,
    ),
    enabled: !!activeRun,
    retry: false,
    refetchInterval: (query) => query.state.data?.status === 'running' ? 2_000 : false,
  });

  useEffect(() => {
    if (!activeRun || extensionId) return;
    let cancelled = false;
    detectExtensionId().then((detected) => {
      if (!cancelled) setExtensionId(detected);
    });
    return () => {
      cancelled = true;
    };
  }, [activeRun, extensionId]);

  const extensionStatusQuery = useQuery({
    queryKey: activeRun
      ? queryKeys.coupangCatalogImports.extension(activeRun.runId)
      : queryKeys.coupangCatalogImports.extension(''),
    queryFn: () => getCoupangCatalogBrowserStatus(extensionId!, activeRun!.runId),
    enabled: !!activeRun && !!extensionId && serverStatusQuery.data?.status === 'running',
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data as CoupangCatalogBrowserStatus | undefined;
      return !status || status.status === 'running' ? 2_000 : false;
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!channelAccountId) throw new Error('쿠팡 채널 계정을 선택해주세요.');
      let run =
        activeRun?.channelAccountId === channelAccountId &&
        serverStatusQuery.data?.status === 'running'
          ? serverStatusQuery.data
          : null;
      if (!run) {
        run = await channelListingsApi.startCoupangCatalogCollection(
          channelAccountId,
          {
            clientRunKey: makeUuid(),
            collectorVersion: COUPANG_CATALOG_COLLECTOR_VERSION,
          },
        );
      }
      const next = { channelAccountId, runId: run.id };
      setActiveRun(next);
      writeActiveRun(next);
      const detected = await startCoupangCatalogBrowser({
        channelAccountId,
        runId: run.id,
        accessToken: session?.access_token,
      });
      setExtensionId(detected);
      try {
        const [browserStatus, genericSession] = await Promise.all([
          getCoupangCatalogBrowserStatus(detected, run.id),
          findBrowserCollectionSession(run.id),
        ]);
        queryClient.setQueryData(
          queryKeys.coupangCatalogImports.extension(run.id),
          browserStatus,
        );
        if (genericSession) {
          updateBrowserCollectionSessionCache(queryClient, genericSession);
          await syncBrowserCollectionAlert(genericSession);
        }
      } catch (error) {
        console.warn('[coupang-catalog] post-start session sync failed', error);
      }
      return run;
    },
    onSuccess: (run) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.coupangCatalogImports.run(run.channelAccountId, run.id),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.coupangCatalogImports.extension(run.id),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.browserCollection.session(run.id),
      });
    },
  });

  useEffect(() => {
    const server = serverStatusQuery.data;
    if (!server || server.status !== 'completed') return;
    if (completedRunRef.current === server.id) return;
    completedRunRef.current = server.id;
    void queryClient.invalidateQueries({ queryKey: queryKeys.channelListings.all });
  }, [queryClient, serverStatusQuery.data]);

  useEffect(() => {
    const session = collectionSession.data;
    if (session?.status !== 'cancelled') return;
    const ordering = `${session.runId}:${session.attempt}:${session.updatedAt}`;
    if (cancelledAlertSyncRef.current === ordering) return;
    cancelledAlertSyncRef.current = ordering;
    void syncBrowserCollectionAlert(session).catch((error) => {
      if (cancelledAlertSyncRef.current === ordering) {
        cancelledAlertSyncRef.current = null;
      }
      console.warn('[coupang-catalog] cancellation alert sync failed', error);
    });
  }, [collectionSession.data]);

  const reset = () => {
    setActiveRun(null);
    setExtensionId(null);
    completedRunRef.current = null;
    cancelledAlertSyncRef.current = null;
    safeStorageRemove('local', STORAGE_KEY);
    startMutation.reset();
  };

  return {
    activeRun,
    serverStatus: serverStatusQuery.data ?? null,
    extensionStatus: extensionStatusQuery.data ?? null,
    collectionSession,
    isStarting: startMutation.isPending,
    startError: startMutation.error,
    start: startMutation.mutateAsync,
    reset,
  };
}

function makeUuid(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('이 브라우저는 안전한 수집 실행 ID 생성을 지원하지 않습니다.');
  }
  return crypto.randomUUID();
}

function readActiveRun(): ActiveRun | null {
  const raw = safeStorageGet('local', STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveRun>;
    if (typeof parsed.channelAccountId !== 'string' || typeof parsed.runId !== 'string') {
      return null;
    }
    return { channelAccountId: parsed.channelAccountId, runId: parsed.runId };
  } catch {
    return null;
  }
}

function writeActiveRun(run: ActiveRun) {
  safeStorageSet('local', STORAGE_KEY, JSON.stringify(run));
}
