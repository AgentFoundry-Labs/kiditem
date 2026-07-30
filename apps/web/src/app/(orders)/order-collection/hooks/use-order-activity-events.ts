'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dayKey, todayYmd } from '../lib/order-collection-page-model';
import type { OrderActivityEvent } from '../components/OrderActivityFeed';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

const ACTIVITY_EVENTS_KEY = 'kiditem-order-activity-events';
const ACTIVITY_EVENT_LIMIT = 30;

/** 조치가 필요한(재시도 대상) 이벤트 종류: 오류·로그인 필요·인증 필요. */
const ATTENTION_KINDS = new Set<OrderActivityEvent['kind']>(['error', 'login', 'auth']);

/**
 * 카드 상태등을 빨간불 + 빨간 배경으로 바꿀 사유.
 * 로그인 실패·인증 필요(사용자 개입이 필요한 경우)에만 빨강으로 표시한다.
 * 일반 수집 오류(주문 없음, 페이지 파싱 실패 등)는 빨강으로 표시하지 않는다.
 */
export type FailedMallReason = 'login' | 'auth';

export function useOrderActivityEvents(mallAccounts: OrderCollectionMallAccount[]) {
  const [events, setEvents] = useState<OrderActivityEvent[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ACTIVITY_EVENTS_KEY);
      const parsed = raw ? (JSON.parse(raw) as OrderActivityEvent[]) : [];
      if (Array.isArray(parsed)) setEvents(parsed);
    } catch {
      setEvents([]);
    }
  }, []);

  const updateEvents = useCallback(
    (updater: (current: OrderActivityEvent[]) => OrderActivityEvent[]) => {
      setEvents((current) => {
        const next = updater(current).slice(0, ACTIVITY_EVENT_LIMIT);
        try {
          window.localStorage.setItem(ACTIVITY_EVENTS_KEY, JSON.stringify(next));
        } catch {
          // Activity history is operator convenience only.
        }
        return next;
      });
    },
    [],
  );

  const logActivity = useCallback(
    (kind: OrderActivityEvent['kind'], mallName: string, message = '') => {
      const event: OrderActivityEvent = {
        id: `${Date.now()}-${kind}-${Math.random().toString(36).slice(2, 8)}`,
        kind,
        mallName,
        message,
        at: Date.now(),
      };
      updateEvents((current) => [event, ...current]);
    },
    [updateEvents],
  );

  const clearMallErrorActivity = useCallback(
    (mallName: string) => {
      updateEvents((current) =>
        current.filter(
          (event) => !(ATTENTION_KINDS.has(event.kind) && event.mallName === mallName),
        ),
      );
    },
    [updateEvents],
  );

  const { failedMallAccounts, failedMallReasonByKey } = useMemo(() => {
    const latestByMall = new Map<string, OrderActivityEvent>();
    for (const event of [...events].sort((a, b) => b.at - a.at)) {
      if (dayKey(event.at) !== todayYmd()) continue;
      if (!latestByMall.has(event.mallName)) latestByMall.set(event.mallName, event);
    }
    const accounts: OrderCollectionMallAccount[] = [];
    const reasonByKey = new Map<string, FailedMallReason>();
    for (const account of mallAccounts) {
      const latest = latestByMall.get(account.name);
      if (!latest || !ATTENTION_KINDS.has(latest.kind)) continue;
      // 실패 몰 재수집 대상: 오류·로그인·인증 모두 포함.
      accounts.push(account);
      // 빨간불/빨간 배경은 로그인·인증(사용자 개입 필요)만. 일반 오류는 초록불/흰 배경 유지.
      if (latest.kind === 'login' || latest.kind === 'auth') {
        reasonByKey.set(account.key, latest.kind);
      }
    }
    return { failedMallAccounts: accounts, failedMallReasonByKey: reasonByKey };
  }, [events, mallAccounts]);

  return {
    events,
    logActivity,
    clearMallErrorActivity,
    failedMallAccounts,
    failedMallReasonByKey,
  };
}
