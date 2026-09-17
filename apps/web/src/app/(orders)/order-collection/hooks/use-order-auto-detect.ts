'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { isMallAutoLoginBlocked } from '@/lib/mall-login-block';
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
    // 로그인·인증이 막힌 몰은 자동으로 더 건드리지 않는다. 들어가 봐야 로그인 화면만 열고
    // 실패하면서 몰 탭만 하나 남기고, 그 탭이 바퀴마다 쌓여 멀쩡한 몰까지 끌어내린다.
    // 다시 도는 건 사장님이 직접 로그인하신 뒤다 — 그때 확인이 차단을 풀어 준다.
    const targets = mallAccounts.filter(
      (account) => isAutoDetectableMall(account) && !isMallAutoLoginBlocked(account.key),
    );
    if (targets.length === 0) return;

    busyRef.current = true;
    setRunning(true);
    try {
      for (const account of targets) {
        let started: Awaited<ReturnType<typeof startMall>>;
        try {
          started = await startMall(account, {
            selectionMode: 'automatic',
            // Freeze the exact trimmed-cell/row-separator criterion before
            // provider capture. The extension/server owner retains this
            // alongside the full original capture.
            seenRowKeys: [...loadSeenOrderKeys(account.key)],
          });
        } catch (err) {
          // 시작 자체가 안 됐으면 수집 절차가 돌지 않았으므로 아무도 남기지 않았다.
          const message = err instanceof Error ? err.message : '자동 감지 실패';
          const kind: OrderActivityEvent['kind'] = classifyOrderCollectionFailure(err, message);
          logActivity(kind, account.name, kind === 'empty' ? undefined : message);
          console.warn('[order-auto-detect]', account.key, err);
          continue;
        }
        // 이미 수집 중인 몰은 두 번째 시도를 열지 않았을 뿐 실패한 것이 아니다. 다음 tick 에
        // 다시 만나므로 실패로 닫지도, 활동 기록에 남기지도 않는다(KID-106 Q6).
        if (started.outcome.outcome !== 'started' || !started.collection) continue;
        try {
          const collected = await started.collection;
          if (collected.rowCount > 0) {
            toast.success(`${account.name} 새 주문 ${formatNumber(collected.rowCount)}건 감지`);
          }
        } catch (err) {
          // 시도의 종료도 활동 기록도 수집 절차가 이미 했다. 여기서 또 남기면 한 번 실패한
          // 몰이 활동 기록에 두 줄로 선다(KID-199).
          console.warn('[order-auto-detect]', account.key, err);
        }
      }
      setLastRunAt(Date.now());
    } finally {
      busyRef.current = false;
      setRunning(false);
    }
  }, [logActivity, mallAccounts, startMall]);

  // 간격만 기억한다. 켜짐은 기억하지 않는다 — 새로고침 · 탭 복원 · 서버 재시작 뒤에 자동
  // 감지가 저 혼자 다시 돌면 사장님이 보지 않는 사이에 몰을 연다. 시작은 언제나 사람이
  // 누른다(KID-106 Q1, KID-187). 자동 운전 고리도 같은 규칙이다.
  useEffect(() => {
    const savedInterval = Number(window.localStorage.getItem(AUTO_INTERVAL_KEY));
    setIntervalMin(AUTO_INTERVAL_OPTIONS_MIN.includes(
      savedInterval as (typeof AUTO_INTERVAL_OPTIONS_MIN)[number],
    )
      ? savedInterval
      : DEFAULT_AUTO_INTERVAL_MIN);
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
