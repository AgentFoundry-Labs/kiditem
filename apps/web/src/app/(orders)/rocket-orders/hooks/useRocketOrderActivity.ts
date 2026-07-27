'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RocketOrderActivityEvent,
  RocketOrderActivityInput,
} from '@/lib/rocket-order-activity';

const MAX_EVENTS = 50;
const STORAGE_KEY = 'kiditem:rocket-order-activity:v1';
const VALID_STATUSES = new Set(['started', 'succeeded', 'failed']);

function readStoredEvents(): RocketOrderActivityEvent[] {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is RocketOrderActivityEvent => {
      if (typeof value !== 'object' || value === null) return false;
      const event = value as Partial<RocketOrderActivityEvent>;
      return typeof event.id === 'string'
        && typeof event.status === 'string'
        && VALID_STATUSES.has(event.status)
        && typeof event.message === 'string'
        && typeof event.occurredAt === 'string';
    }).slice(0, MAX_EVENTS);
  } catch {
    return [];
  }
}

function writeStoredEvents(events: RocketOrderActivityEvent[]): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Activity history is best-effort and must never block the workflow.
  }
}

export function useRocketOrderActivity() {
  const [events, setEvents] = useState<RocketOrderActivityEvent[]>([]);
  const sequence = useRef(0);
  useEffect(() => {
    const stored = readStoredEvents();
    sequence.current = stored.length;
    setEvents(stored);
  }, []);
  const record = useCallback((input: RocketOrderActivityInput) => {
    const occurredAt = new Date().toISOString();
    sequence.current += 1;
    const event: RocketOrderActivityEvent = {
      ...input,
      id: `${occurredAt}:${sequence.current}`,
      occurredAt,
    };
    const next = [event, ...readStoredEvents()].slice(0, MAX_EVENTS);
    writeStoredEvents(next);
    setEvents(next);
  }, []);
  return { events, record };
}
