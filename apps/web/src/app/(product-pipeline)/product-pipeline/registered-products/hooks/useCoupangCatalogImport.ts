'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  COUPANG_CATALOG_COLLECTOR_VERSION,
  type CoupangCatalogBrowserStatus,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { useAuthSession } from '@/components/providers/AuthProvider';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/browser-storage';
import { detectExtensionId } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import {
  cancelCoupangCatalogBrowser,
  getCoupangCatalogBrowserStatus,
  startCoupangCatalogBrowser,
} from '../lib/coupang-catalog-import';
import { shouldInvalidatePublishedListings } from '../lib/coupang-catalog-progress';
import { channelListingsApi } from '../lib/channel-listings-api';

const STORAGE_KEY = 'kiditem:coupang-catalog-import:active-run';

type ActiveRun = {
  channelAccountId: string;
  runId: string;
};

export function useCoupangCatalogImport(channelAccountId: string | null) {
  const queryClient = useQueryClient();
  const { session } = useAuthSession();
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(() => readActiveRun());
  const [extensionId, setExtensionId] = useState<string | null>(null);
  const completedRunRef = useRef<string | null>(null);
  const publishedProgressRef = useRef<{
    runId: string;
    publishedProducts: number;
  } | null>(null);

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
      return run;
    },
    onSuccess: (run) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.coupangCatalogImports.run(run.channelAccountId, run.id),
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!activeRun) return;
      const detected = extensionId ?? await detectExtensionId();
      if (!detected) throw new Error('KIDITEM 쿠팡 확장프로그램을 찾을 수 없습니다.');
      setExtensionId(detected);
      await cancelCoupangCatalogBrowser(detected, activeRun.runId);
    },
  });

  useEffect(() => {
    const server = serverStatusQuery.data;
    if (!server) return;
    const previous = publishedProgressRef.current;
    if (
      previous?.runId === server.id &&
      shouldInvalidatePublishedListings(
        previous.publishedProducts,
        server.progress.publishedProducts,
      )
    ) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.channelListings.all });
    }
    publishedProgressRef.current = {
      runId: server.id,
      publishedProducts: server.progress.publishedProducts,
    };
  }, [queryClient, serverStatusQuery.data]);

  useEffect(() => {
    const server = serverStatusQuery.data;
    if (!server || server.status !== 'completed') return;
    if (completedRunRef.current === server.id) return;
    completedRunRef.current = server.id;
    void queryClient.invalidateQueries({ queryKey: queryKeys.channelListings.all });
  }, [queryClient, serverStatusQuery.data]);

  const reset = () => {
    setActiveRun(null);
    setExtensionId(null);
    completedRunRef.current = null;
    publishedProgressRef.current = null;
    safeStorageRemove('local', STORAGE_KEY);
    startMutation.reset();
    cancelMutation.reset();
  };

  return {
    activeRun,
    serverStatus: serverStatusQuery.data ?? null,
    extensionStatus: extensionStatusQuery.data ?? null,
    isStarting: startMutation.isPending,
    isCancelling: cancelMutation.isPending,
    startError: startMutation.error,
    cancelError: cancelMutation.error,
    start: startMutation.mutateAsync,
    cancel: cancelMutation.mutateAsync,
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
