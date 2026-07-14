'use client';

import { BrowserCollectionRunIdSchema } from '@kiditem/shared/browser-collection-session';
import { useCallback, useMemo, useState } from 'react';
import { useBrowserCollectionSession } from '@/hooks/useBrowserCollectionSession';
import { recordMissingBrowserCollection } from '@/lib/browser-collection-session';
import {
  detectOrderCollectionSessionExtension,
  type OrderCollectionExtensionRun,
} from '../lib/order-collection-extension';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

const UNMAPPED_RESTART_MESSAGE =
  '이 작업은 주문 수집 계정과 연결되지 않아 이 화면에서 자동 재실행할 수 없습니다. 원래 실행 화면에서 다시 시작해주세요.';

export function useOrderCollectionSessionControls(
  mallAccounts: OrderCollectionMallAccount[],
) {
  const [runId, setRunId] = useState(readCollectionRunId);
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
      const sessionDate = session && existingRunId === session.runId &&
        (typeof session.inputIdentity.date === 'string' || session.inputIdentity.date === null)
        ? session.inputIdentity.date
        : undefined;
      return {
        runId: nextRunId,
        extensionId,
        ...(sessionDate !== undefined ? { date: sessionDate } : {}),
      };
    }

    const missing = await recordMissingBrowserCollection(
      'orders.mall',
      { mallKey: account.key },
      nextRunId,
    );
    setRunId(missing.runId);
    return null;
  }, [session]);

  return {
    prepareRun,
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
