import type { BaseEvent } from '@ag-ui/core';
import type { Observable } from 'rxjs';

export const LIVE_ATTEMPT_OUTPUT_CAPABILITY_PORT = Symbol(
  'LIVE_ATTEMPT_OUTPUT_CAPABILITY_PORT',
);

/** Ephemeral stream for a genuinely running local CLI Attempt only. */
export interface LiveAttemptOutputCapabilityPort {
  bind(input: { attemptId: string; threadId: string; runId: string }): void;
  /** Complete a retry coordinate that has not been bound to any durable Attempt. */
  closeUnboundOutput(input: { threadId: string; runId: string }): void;
  finish(input: { attemptId: string; outcome: 'completed' | 'failed'; summary?: string }): void;
  stream(input: { threadId: string; runId: string }): Observable<BaseEvent>;
  streamThread(threadId: string): Observable<BaseEvent>;
  current(threadId: string, runId?: string): string | null;
  attemptId(input: { threadId: string; runId: string }): string | null;
}
