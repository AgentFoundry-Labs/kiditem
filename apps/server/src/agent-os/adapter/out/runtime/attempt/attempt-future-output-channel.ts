import { Observable, Subject } from 'rxjs';
import { EventType, type BaseEvent } from '@ag-ui/core';

type Coordinate = { threadId: string; runId: string };

/** Ephemeral future-only output channel; it owns neither durable state nor history. */
export class AttemptFutureOutputChannel {
  private readonly coordinates = new Map<string, Coordinate>();
  private readonly streams = new Map<string, Subject<BaseEvent>>();
  private readonly currentRunByThread = new Map<string, string>();
  bind(input: { attemptId: string; threadId: string; runId: string }): void { this.coordinates.set(input.attemptId, { threadId: input.threadId, runId: input.runId }); this.currentRunByThread.set(input.threadId, input.runId); this.stream(input.threadId, input.runId); }
  future(input: Coordinate): Observable<BaseEvent> { return this.stream(input.threadId, input.runId).asObservable(); }
  futureThread(threadId: string): Observable<BaseEvent> { const runId = this.currentRunByThread.get(threadId); return runId ? this.future({ threadId, runId }) : new Subject<BaseEvent>().asObservable(); }
  current(threadId: string, runId?: string): string | null { const current = this.currentRunByThread.get(threadId) ?? null; return current && (!runId || current === runId) ? current : null; }
  finish(input: { attemptId: string; outcome: 'completed' | 'failed'; summary?: string }): void {
    const coordinate = this.coordinates.get(input.attemptId); if (!coordinate) return;
    const stream = this.stream(coordinate.threadId, coordinate.runId);
    if (input.outcome === 'completed' && input.summary?.trim()) { const messageId = `attempt-${input.attemptId}`; stream.next({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as BaseEvent); stream.next({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: input.summary.slice(0, 8_192) } as BaseEvent); stream.next({ type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent); }
    stream.next({ type: EventType.RUN_FINISHED, threadId: coordinate.threadId, runId: coordinate.runId } as BaseEvent); stream.complete(); this.coordinates.delete(input.attemptId); if (this.currentRunByThread.get(coordinate.threadId) === coordinate.runId) this.currentRunByThread.delete(coordinate.threadId); this.streams.delete(key(coordinate));
  }
  private stream(threadId: string, runId: string): Subject<BaseEvent> { const id = key({ threadId, runId }); let stream = this.streams.get(id); if (!stream) { stream = new Subject<BaseEvent>(); this.streams.set(id, stream); } return stream; }
}
function key(input: Coordinate): string { return `${input.threadId}\u0000${input.runId}`; }
