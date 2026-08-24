import type { BaseEvent } from '@ag-ui/core';
import type { Observable } from 'rxjs';

export const LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT = Symbol(
  'LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT',
);

export interface LiveAttemptFutureOutputCapabilityPort {
  bind(input: { attemptId: string; threadId: string; runId: string }): void;
  finish(input: { attemptId: string; outcome: 'completed' | 'failed'; summary?: string }): void;
  future(input: { threadId: string; runId: string }): Observable<BaseEvent>;
  futureThread(threadId: string): Observable<BaseEvent>;
  current(threadId: string, runId?: string): string | null;
  attemptId(input: { threadId: string; runId: string }): string | null;
}
