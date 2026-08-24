import { Observable, Subject } from 'rxjs';
import { EventType, type BaseEvent } from '@ag-ui/core';

type Coordinate = { threadId: string; runId: string };

/** Ephemeral future-only output channel; it owns neither durable state nor history. */
export class AttemptFutureOutputChannel {
  private readonly coordinates = new Map<string, Coordinate>();
  private readonly attemptsByCoordinate = new Map<string, string>();
  private readonly streams = new Map<string, Subject<BaseEvent>>();
  private readonly currentRunByThread = new Map<string, string>();
  private readonly activeMessageIds = new Map<string, string>();
  private readonly closed = new Set<string>();
  bind(input: { attemptId: string; threadId: string; runId: string }): void {
    const coordinate = { threadId: input.threadId, runId: input.runId };
    const id = key(coordinate);
    this.closed.delete(id);
    this.coordinates.set(input.attemptId, coordinate);
    this.attemptsByCoordinate.set(id, input.attemptId);
    this.currentRunByThread.set(input.threadId, input.runId);
    this.stream(input.threadId, input.runId);
  }
  future(input: Coordinate): Observable<BaseEvent> { return this.stream(input.threadId, input.runId).asObservable(); }
  futureThread(threadId: string): Observable<BaseEvent> { const runId = this.currentRunByThread.get(threadId); return runId ? this.future({ threadId, runId }) : new Subject<BaseEvent>().asObservable(); }
  current(threadId: string, runId?: string): string | null { const current = this.currentRunByThread.get(threadId) ?? null; return current && (!runId || current === runId) ? current : null; }
  attemptId(input: Coordinate): string | null { return this.attemptsByCoordinate.get(key(input)) ?? null; }
  publish(input: { attemptId: string; output: string }): void {
    const coordinate = this.coordinates.get(input.attemptId);
    const delta = input.output.slice(0, 8_192);
    if (!coordinate || !delta) return;
    const stream = this.stream(coordinate.threadId, coordinate.runId);
    const messageId = this.activeMessageIds.get(input.attemptId) ?? `attempt-${input.attemptId}`;
    if (!this.activeMessageIds.has(input.attemptId)) {
      this.activeMessageIds.set(input.attemptId, messageId);
      stream.next({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as BaseEvent);
    }
    stream.next({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta } as BaseEvent);
  }
  finish(input: { attemptId: string; outcome: 'completed' | 'failed'; summary?: string }): void {
    const coordinate = this.coordinates.get(input.attemptId); if (!coordinate) return;
    const stream = this.stream(coordinate.threadId, coordinate.runId);
    const activeMessageId = this.activeMessageIds.get(input.attemptId);
    if (activeMessageId) stream.next({ type: EventType.TEXT_MESSAGE_END, messageId: activeMessageId } as BaseEvent);
    else if (input.outcome === 'completed' && input.summary?.trim()) { const messageId = `attempt-${input.attemptId}`; stream.next({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as BaseEvent); stream.next({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: input.summary.slice(0, 8_192) } as BaseEvent); stream.next({ type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent); }
    if (input.outcome === 'failed') stream.next({ type: EventType.RUN_ERROR, message: input.summary?.trim().slice(0, 1_000) || 'Attempt failed.', code: 'attempt_failed' } as BaseEvent);
    else stream.next({ type: EventType.RUN_FINISHED, threadId: coordinate.threadId, runId: coordinate.runId, outcome: { type: 'success' } } as BaseEvent);
    stream.complete();
    this.coordinates.delete(input.attemptId);
    this.activeMessageIds.delete(input.attemptId);
    this.attemptsByCoordinate.delete(key(coordinate));
    if (this.currentRunByThread.get(coordinate.threadId) === coordinate.runId) this.currentRunByThread.delete(coordinate.threadId);
    this.streams.delete(key(coordinate));
    this.rememberClosed(key(coordinate));
  }
  private stream(threadId: string, runId: string): Subject<BaseEvent> {
    const id = key({ threadId, runId });
    if (this.closed.has(id)) { const closed = new Subject<BaseEvent>(); closed.complete(); return closed; }
    let stream = this.streams.get(id); if (!stream) { stream = new Subject<BaseEvent>(); this.streams.set(id, stream); } return stream;
  }
  private rememberClosed(id: string): void {
    this.closed.add(id);
    if (this.closed.size > 256) this.closed.delete(this.closed.values().next().value as string);
  }
}
function key(input: Coordinate): string { return `${input.threadId}\u0000${input.runId}`; }
