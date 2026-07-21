'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RocketOrderActivityEvent,
  RocketOrderActivityInput,
} from '@/lib/rocket-order-activity';

const MAX_EVENTS = 50;
// 작업 알림은 오퍼레이터 편의용 로컬 기록이다((orders)/AGENTS.md: browser storage 허용).
// 새로고침해도 유지되도록 localStorage 에 보관한다.
const STORAGE_KEY = 'kiditem:rocket-order-activity';

function loadStored(): RocketOrderActivityEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as RocketOrderActivityEvent[]).slice(0, MAX_EVENTS)
      : [];
  } catch {
    return [];
  }
}

export function useRocketOrderActivity() {
  const [events, setEvents] = useState<RocketOrderActivityEvent[]>([]);
  const sequence = useRef(0);

  // SSR/hydration 안전을 위해 초기값은 빈 배열, 마운트 후 localStorage 에서 복원한다.
  useEffect(() => {
    const stored = loadStored();
    if (stored.length > 0) {
      setEvents(stored);
      sequence.current = stored.length;
    }
  }, []);

  const record = useCallback((input: RocketOrderActivityInput) => {
    const occurredAt = new Date().toISOString();
    sequence.current += 1;
    const event: RocketOrderActivityEvent = {
      ...input,
      id: `${occurredAt}:${sequence.current}`,
      occurredAt,
    };
    setEvents((current) => {
      const next = [event, ...current].slice(0, MAX_EVENTS);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* localStorage 불가(사생활 모드 등) — 유지 없이 진행 */
      }
      return next;
    });
  }, []);

  return { events, record };
}
