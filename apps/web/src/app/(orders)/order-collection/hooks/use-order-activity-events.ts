'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dayKey, todayYmd } from '../lib/order-collection-page-model';
import type { OrderActivityEvent } from '../components/OrderActivityFeed';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

const ACTIVITY_EVENTS_KEY = 'kiditem-order-activity-events';
const ACTIVITY_EVENT_LIMIT = 30;

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
        current.filter((event) => !(event.kind === 'error' && event.mallName === mallName)),
      );
    },
    [updateEvents],
  );

  const failedMallAccounts = useMemo(() => {
    const latestByMall = new Map<string, OrderActivityEvent>();
    for (const event of [...events].sort((a, b) => b.at - a.at)) {
      if (dayKey(event.at) !== todayYmd()) continue;
      if (!latestByMall.has(event.mallName)) latestByMall.set(event.mallName, event);
    }
    const failedNames = new Set(
      [...latestByMall.values()]
        .filter((event) => event.kind === 'error')
        .map((event) => event.mallName),
    );
    return mallAccounts.filter((account) => failedNames.has(account.name));
  }, [events, mallAccounts]);

  return { events, logActivity, clearMallErrorActivity, failedMallAccounts };
}
