'use client';

import { useCallback, useRef, useState } from 'react';
import type {
  RocketOrderActivityEvent,
  RocketOrderActivityInput,
} from '@/lib/rocket-order-activity';

const MAX_EVENTS = 50;

export function useRocketOrderActivity() {
  const [events, setEvents] = useState<RocketOrderActivityEvent[]>([]);
  const sequence = useRef(0);
  const record = useCallback((input: RocketOrderActivityInput) => {
    const occurredAt = new Date().toISOString();
    sequence.current += 1;
    const event: RocketOrderActivityEvent = {
      ...input,
      id: `${occurredAt}:${sequence.current}`,
      occurredAt,
    };
    setEvents((current) => [event, ...current].slice(0, MAX_EVENTS));
  }, []);
  return { events, record };
}
