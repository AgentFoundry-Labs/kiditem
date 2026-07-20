'use client';

import {
  BrowserCollectionRunIdSchema,
  BrowserCollectionSessionViewSchema,
} from '@kiditem/shared/browser-collection-session';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useBrowserCollectionSession } from '@/hooks/useBrowserCollectionSession';
import {
  recordMissingBrowserCollection,
  sendBrowserCollectionControl,
  syncBrowserCollectionAlert,
  updateBrowserCollectionSessionCache,
} from '@/lib/browser-collection-session';
import {
  detectOrderCollectionSessionExtension,
  finalizeOrderCollectionSession,
  type OrderCollectionExtensionRun,
} from '../lib/order-collection-extension';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

const UNMAPPED_RESTART_MESSAGE =
  '이 작업은 주문 수집 계정과 연결되지 않아 이 화면에서 자동 재실행할 수 없습니다. 원래 실행 화면에서 다시 시작해주세요.';

export function useOrderCollectionSessionControls(
  mallAccounts: OrderCollectionMallAccount[],
) {
  const queryClient = useQueryClient();
  const [runId, setRunId] = useState(readCollectionRunId);
  const [cancellingKeys, setCancellingKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const activeRunsRef = useRef(new Map<
    string,
    { run: OrderCollectionExtensionRun; abortController: AbortController }
  >());
  const sessionQuery = useBrowserCollectionSession(runId);
  const session = sessionQuery.data?.producer === 'orders.mall'
    ? sessionQuery.data
    : null;
  const restartAccount = useMemo(() => {
    if (!session) return null;
    const mallKey = typeof session.inputIdentity.mallKey === 'string'
      ? session.inputIdentity.mallKey
      : null;
    return mallAccounts.find((account) => account.key === mallKey) ?? null;
  }, [mallAccounts, session]);

  const prepareRun = useCallback(async (
    account: OrderCollectionMallAccount,
    existingRunId?: string,
  ): Promise<OrderCollectionExtensionRun | null> => {
    const nextRunId = existingRunId ?? globalThis.crypto.randomUUID();
    setRunId(nextRunId);
    const extensionId = await detectOrderCollectionSessionExtension();
    if (extensionId) {
      const abortController = new AbortController();
      const sessionDate = session && existingRunId === session.runId &&
        (typeof session.inputIdentity.date === 'string' || session.inputIdentity.date === null)
        ? session.inputIdentity.date
        : undefined;
      const run: OrderCollectionExtensionRun = {
        runId: nextRunId,
        extensionId,
        signal: abortController.signal,
        ...(sessionDate !== undefined ? { date: sessionDate } : {}),
      };
      activeRunsRef.current.set(account.key, { run, abortController });
      return run;
    }

    const missing = await recordMissingBrowserCollection(
      'orders.mall',
      { mallKey: account.key },
      nextRunId,
    );
    setRunId(missing.runId);
    return null;
  }, [session]);

  const syncSession = useCallback(async (value: unknown) => {
    const parsed = BrowserCollectionSessionViewSchema.safeParse(value);
    if (!parsed.success) return null;
    updateBrowserCollectionSessionCache(queryClient, parsed.data);
    await syncBrowserCollectionAlert(parsed.data).catch((error) => {
      console.warn('[order-collection] failed to sync personal alert', error);
    });
    return parsed.data;
  }, [queryClient]);

  const cancelRun = useCallback(async (account: OrderCollectionMallAccount) => {
    const active = activeRunsRef.current.get(account.key);
    if (!active) return false;
    setCancellingKeys((current) => new Set(current).add(account.key));
    active.abortController.abort();
    try {
      await syncSession(
        await sendBrowserCollectionControl(active.run.runId, 'cancelCollectionSession'),
      );
      return true;
    } catch (error) {
      setCancellingKeys((current) => {
        const next = new Set(current);
        next.delete(account.key);
        return next;
      });
      throw error;
    }
  }, [syncSession]);

  const finalizeRun = useCallback(async (
    run: OrderCollectionExtensionRun,
    status: 'succeeded' | 'failed',
    message: string,
  ) => syncSession(await finalizeOrderCollectionSession(run, status, message)), [syncSession]);

  const releaseRun = useCallback((mallKey: string, expectedRunId?: string) => {
    const current = activeRunsRef.current.get(mallKey);
    if (!expectedRunId || current?.run.runId === expectedRunId) {
      activeRunsRef.current.delete(mallKey);
      setCancellingKeys((keys) => {
        const next = new Set(keys);
        next.delete(mallKey);
        return next;
      });
    }
  }, []);

  return {
    cancelRun,
    cancellingKeys,
    finalizeRun,
    prepareRun,
    releaseRun,
    restartAccount,
    session,
    webRestartUnavailableMessage: session && !restartAccount
      ? UNMAPPED_RESTART_MESSAGE
      : undefined,
  };
}

function readCollectionRunId(): string | null {
  if (typeof window === 'undefined') return null;
  const parsed = BrowserCollectionRunIdSchema.safeParse(
    new URLSearchParams(window.location.search).get('collectionRun'),
  );
  return parsed.success ? parsed.data : null;
}
