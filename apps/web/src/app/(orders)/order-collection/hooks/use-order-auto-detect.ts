'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import { saveIcecreamDeliveryIndex } from '../lib/icecream-delivery-index';
import {
  collectIcecreamMallRowsFromExtension,
} from '../lib/order-collection-extension';
import {
  convertIcecreamMallOrderRows,
} from '../lib/order-collection-api';
import {
  addSeenOrderKeys,
  diffNewOrderRows,
  distinctOrderNumbers,
  loadSeenOrderKeys,
} from '../lib/order-detect';
import {
  ICECREAM_MALL_KEY,
  isAuthRequiredMessage,
  isAutoDetectableMall,
  isLoginRequiredMessage,
  isNoNewOrdersMessage,
  todayYmd,
  type ConversionHistoryItem,
} from '../lib/order-collection-page-model';
import type { OrderActivityEvent } from '../components/OrderActivityFeed';
import {
  orderMallAccountApi,
  type OrderCollectionMallAccount,
} from '../lib/order-mall-account-api';
import type { BrowserMallCollectionResult } from '../lib/browser-mall-collection';

const DEFAULT_AUTO_INTERVAL_MIN = 30;
const AUTO_BUSINESS_START_HOUR = 9;
const AUTO_BUSINESS_END_HOUR = 18;
const AUTO_DETECT_KEY = 'kiditem-order-auto-detect';
const AUTO_INTERVAL_KEY = 'kiditem-order-auto-interval';

export const AUTO_INTERVAL_OPTIONS_MIN = [5, 10, 15, 30, 60] as const;

interface UseOrderAutoDetectOptions {
  mallAccounts: OrderCollectionMallAccount[];
  addGeneratedFile: (item: ConversionHistoryItem) => void;
  collectAccount: (
    account: OrderCollectionMallAccount,
  ) => Promise<BrowserMallCollectionResult>;
  markCollecting: (mallKey: string, collecting: boolean) => void;
  logActivity: (kind: OrderActivityEvent['kind'], mallName: string, message?: string) => void;
}

export function useOrderAutoDetect({
  mallAccounts,
  addGeneratedFile,
  collectAccount,
  markCollecting,
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
        markCollecting(account.key, true);
        try {
          if (account.key === ICECREAM_MALL_KEY) {
            const credentials = await loadMallCredentials(account);
            const collected = await collectIcecreamMallRowsFromExtension(todayYmd(), credentials);
            saveIcecreamDeliveryIndex(collected.headers, collected.rows);
            const diff = diffNewOrderRows(
              collected.headers,
              collected.rows,
              loadSeenOrderKeys(account.key),
            );
            if (diff.newRows.length === 0) {
              logActivity('empty', account.name);
              continue;
            }

            const result = await convertIcecreamMallOrderRows(
              {
                headers: collected.headers,
                rows: diff.newRows,
                fileName: `${account.name}_${collected.date ?? todayYmd()}_자동감지`,
              },
              { download: false },
            );
            const convertedAt = Date.now();
            addGeneratedFile({
              ...result,
              id: `${convertedAt}-${account.key}-auto`,
              sourceName: `${account.name} 자동감지 신규 ${formatNumber(diff.newOrderCount)}건`,
              convertedAt,
              collectionDate: collected.date ?? todayYmd(),
              collectionMode: 'browser',
              collectedRows: diff.newRows.length,
              mallKey: account.key,
              mallName: account.name,
              orderNumbers: distinctOrderNumbers(collected.headers, diff.newRows),
            });
            addSeenOrderKeys(account.key, diff.newRowKeys);
            toast.success(`${account.name} 새 주문 ${formatNumber(diff.newOrderCount)}건 감지`);
          } else {
            const collected = await collectAccount(account);
            if (collected.rowCount === 0) logActivity('empty', account.name);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : '자동 감지 실패';
          const kind = isNoNewOrdersMessage(message)
            ? 'empty'
            : isAuthRequiredMessage(message)
              ? 'auth'
              : isLoginRequiredMessage(message)
                ? 'login'
                : 'error';
          logActivity(kind, account.name, kind === 'empty' ? undefined : message);
          console.warn('[order-auto-detect]', account.key, err);
        } finally {
          markCollecting(account.key, false);
        }
      }
      setLastRunAt(Date.now());
    } finally {
      busyRef.current = false;
      setRunning(false);
    }
  }, [addGeneratedFile, collectAccount, logActivity, mallAccounts, markCollecting]);

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

async function loadMallCredentials(account: OrderCollectionMallAccount) {
  if (!account.loginId || !account.hasPassword) {
    throw new Error(`${account.name} 계정 ID와 비밀번호를 먼저 저장해주세요.`);
  }
  const result = await orderMallAccountApi.password(account.key);
  if (!result.password) throw new Error(`${account.name} 저장된 비밀번호를 불러오지 못했습니다.`);
  return { loginId: account.loginId, password: result.password };
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
