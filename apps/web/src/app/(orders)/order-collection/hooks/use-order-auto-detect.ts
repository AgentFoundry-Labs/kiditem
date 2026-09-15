'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import {
  loadSeenOrderKeys,
} from '../lib/order-detect';
import {
  classifyOrderCollectionFailure,
  isAutoDetectableMall,
} from '../lib/order-collection-page-model';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';
import type { CollectionStartOutcome } from '@/hooks/use-collection-source-control';
import type { BrowserMallCollectionResult } from '../lib/browser-mall-collection';
import type { MallOrderCollectionStartInput } from '../lib/mall-order-collection-source';
import type { OrderActivityEvent } from '../components/OrderActivityFeed';

const DEFAULT_AUTO_INTERVAL_MIN = 30;
const AUTO_BUSINESS_START_HOUR = 9;
const AUTO_BUSINESS_END_HOUR = 18;
const AUTO_DETECT_KEY = 'kiditem-order-auto-detect';
const AUTO_INTERVAL_KEY = 'kiditem-order-auto-interval';

export const AUTO_INTERVAL_OPTIONS_MIN = [5, 10, 15, 30, 60] as const;

interface UseOrderAutoDetectOptions {
  mallAccounts: OrderCollectionMallAccount[];
  /**
   * Starts one mall through its shared collection control and names the
   * collection that start left running, so a tick can wait for it.
   */
  startMall: (
    account: OrderCollectionMallAccount,
    input?: MallOrderCollectionStartInput,
  ) => Promise<Readonly<{
    outcome: CollectionStartOutcome;
    collection: Promise<BrowserMallCollectionResult> | null;
  }>>;
  logActivity: (kind: OrderActivityEvent['kind'], mallName: string, message?: string) => void;
}

export function useOrderAutoDetect({
  mallAccounts,
  startMall,
  logActivity,
}: UseOrderAutoDetectOptions) {
  const [enabled, setEnabled] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [nextRunAt, setNextRunAt] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [intervalMin, setIntervalMin] = useState(DEFAULT_AUTO_INTERVAL_MIN);
  const busyRef = useRef(false);
  const runRef = useRef<() => Promise<void>>(async () => {});
  const intervalMs = intervalMin * 60 * 1000;

  const run = useCallback(async () => {
    if (busyRef.current || !isWithinBusinessHours(Date.now())) return;
    const targets = mallAccounts.filter(isAutoDetectableMall);
    if (targets.length === 0) return;

    busyRef.current = true;
    setRunning(true);
    try {
      for (const account of targets) {
        try {
          const started = await startMall(account, {
            selectionMode: 'automatic',
            // Freeze the exact trimmed-cell/row-separator criterion before
            // provider capture. The extension/server owner retains this
            // alongside the full original capture.
            seenRowKeys: [...loadSeenOrderKeys(account.key)],
          });
          // 이미 수집 중인 몰은 두 번째 시도를 열지 않았을 뿐 실패한 것이 아니다. 다음 tick 에
          // 다시 만나므로 실패로 닫지도, 활동 기록에 남기지도 않는다(KID-106 Q6).
          if (started.outcome.outcome !== 'started' || !started.collection) continue;
          const collected = await started.collection;
          if (collected.rowCount > 0) {
            toast.success(`${account.name} 새 주문 ${formatNumber(collected.rowCount)}건 감지`);
          }
        } catch (err) {
          // 시도의 종료 처리는 수집 절차가 이미 한다. 여기서는 왜 못 돌았는지만 남긴다.
          const message = err instanceof Error ? err.message : '자동 감지 실패';
          const kind: OrderActivityEvent['kind'] = classifyOrderCollectionFailure(err, message);
          logActivity(kind, account.name, kind === 'empty' ? undefined : message);
          console.warn('[order-auto-detect]', account.key, err);
        }
      }
      setLastRunAt(Date.now());
    } finally {
      busyRef.current = false;
      setRunning(false);
    }
  }, [logActivity, mallAccounts, startMall]);

  useEffect(() => {
    const savedInterval = Number(window.localStorage.getItem(AUTO_INTERVAL_KEY));
    const nextInterval = AUTO_INTERVAL_OPTIONS_MIN.includes(
      savedInterval as (typeof AUTO_INTERVAL_OPTIONS_MIN)[number],
    )
      ? savedInterval
      : DEFAULT_AUTO_INTERVAL_MIN;
    setIntervalMin(nextInterval);
    if (window.localStorage.getItem(AUTO_DETECT_KEY) === '1') {
      setEnabled(true);
      setNextRunAt(nextAutoRunAt(Date.now(), nextInterval * 60 * 1000));
    }
  }, []);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    if (!enabled || nextRunAt === null) return;
    const delay = Math.max(0, nextRunAt - Date.now());
    const timer = window.setTimeout(() => {
      void runRef.current().finally(() => {
        setNextRunAt(nextAutoRunAt(Date.now(), intervalMs));
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [enabled, intervalMs, nextRunAt]);

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    setNextRunAt(next ? nextAutoRunAt(Date.now(), intervalMs) : null);
    window.localStorage.setItem(AUTO_DETECT_KEY, next ? '1' : '0');
    if (next) void run();
  }, [enabled, intervalMs, run]);

  const changeInterval = useCallback(
    (minutes: number) => {
      if (!AUTO_INTERVAL_OPTIONS_MIN.includes(minutes as (typeof AUTO_INTERVAL_OPTIONS_MIN)[number])) {
        return;
      }
      setIntervalMin(minutes);
      window.localStorage.setItem(AUTO_INTERVAL_KEY, String(minutes));
      if (enabled) setNextRunAt(nextAutoRunAt(Date.now(), minutes * 60 * 1000));
    },
    [enabled],
  );

  return {
    enabled,
    intervalMin,
    lastRunAt,
    nextRunAt,
    running,
    toggle,
    changeInterval,
    run,
  };
}

function isWithinBusinessHours(timestamp: number): boolean {
  const hour = new Date(timestamp).getHours();
  return hour >= AUTO_BUSINESS_START_HOUR && hour < AUTO_BUSINESS_END_HOUR;
}

function nextAutoRunAt(fromMs: number, intervalMs: number): number {
  const candidate = fromMs + intervalMs;
  const value = new Date(candidate);
  if (value.getHours() < AUTO_BUSINESS_END_HOUR) return candidate;

  const next = new Date(candidate);
  next.setDate(next.getDate() + 1);
  next.setHours(AUTO_BUSINESS_START_HOUR, 0, 0, 0);
  return next.getTime();
}
