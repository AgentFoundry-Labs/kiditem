import { Observable, Subject } from 'rxjs';
import { EventType, type BaseEvent } from '@ag-ui/core';

type Coordinate = { threadId: string; runId: string };

/** Ephemeral live Attempt output; it owns neither durable state nor history. */
export class LiveAttemptOutputChannel {
  private readonly coordinates = new Map<string, Coordinate>();
  private readonly attemptsByCoordinate = new Map<string, string>();
  private readonly streams = new Map<string, Subject<BaseEvent>>();
  private readonly streamSubscribers = new Map<string, number>();
  private readonly currentRunByThread = new Map<string, string>();
  private readonly activeMessageIds = new Map<string, string>();
  private readonly closed = new Set<string>();
  private readonly terminalAttempts = new Set<string>();
  private messageSequence = 0;
  bind(input: { attemptId: string; threadId: string; runId: string }): boolean {
    const coordinate = { threadId: input.threadId, runId: input.runId };
    const id = key(coordinate);
    const mappedAttempt = this.attemptsByCoordinate.get(id);
    if (mappedAttempt && mappedAttempt !== input.attemptId) {
      throw new Error('attempt_output_coordinate_conflict');
    }
    if (this.terminalAttempts.has(input.attemptId)) {
      this.closeLateCoordinate(id);
      return false;
    }
    const previous = this.coordinates.get(input.attemptId);
    if (previous && key(previous) !== id) this.finishRun({ attemptId: input.attemptId, coordinate: previous });
    this.closed.delete(id);
    this.coordinates.set(input.attemptId, coordinate);
    this.attemptsByCoordinate.set(id, input.attemptId);
    this.currentRunByThread.set(input.threadId, input.runId);
    this.subject(input.threadId, input.runId);
    return true;
  }
  closeUnboundOutput(input: Coordinate): void {
    const id = key(input);
    if (this.attemptsByCoordinate.has(id)) return;
    this.closeLateCoordinate(id);
  }
  stream(input: Coordinate): Observable<BaseEvent> {
    const coordinate = { threadId: input.threadId, runId: input.runId };
    const id = key(coordinate);
    return new Observable<BaseEvent>((subscriber) => {
      const stream = this.subject(coordinate.threadId, coordinate.runId);
      this.streamSubscribers.set(id, (this.streamSubscribers.get(id) ?? 0) + 1);
      const subscription = stream.subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        this.releaseUnboundOutput(id);
      };
    });
  }
  streamThread(threadId: string): Observable<BaseEvent> { const runId = this.currentRunByThread.get(threadId); return runId ? this.stream({ threadId, runId }) : new Subject<BaseEvent>().asObservable(); }
  current(threadId: string, runId?: string): string | null { const current = this.currentRunByThread.get(threadId) ?? null; return current && (!runId || current === runId) ? current : null; }
  attemptId(input: Coordinate): string | null { return this.attemptsByCoordinate.get(key(input)) ?? null; }
  publish(input: { attemptId: string; output: string }): void {
    const coordinate = this.coordinates.get(input.attemptId);
    const delta = input.output.slice(0, 8_192);
    if (!coordinate || !delta) return;
    const stream = this.subject(coordinate.threadId, coordinate.runId);
    const messageId = this.activeMessageIds.get(input.attemptId) ?? `attempt-${input.attemptId}-${++this.messageSequence}`;
    if (!this.activeMessageIds.has(input.attemptId)) {
      this.activeMessageIds.set(input.attemptId, messageId);
      stream.next({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as BaseEvent);
    }
    stream.next({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta } as BaseEvent);
  }
  finish(input: { attemptId: string; outcome: 'completed' | 'failed'; summary?: string }): void {
    this.rememberTerminal(input.attemptId);
    const coordinate = this.coordinates.get(input.attemptId); if (!coordinate) return;
    const stream = this.subject(coordinate.threadId, coordinate.runId);
    const activeMessageId = this.activeMessageIds.get(input.attemptId);
    if (activeMessageId) stream.next({ type: EventType.TEXT_MESSAGE_END, messageId: activeMessageId } as BaseEvent);
    else if (input.outcome === 'completed' && input.summary?.trim()) { const messageId = `attempt-${input.attemptId}-${++this.messageSequence}`; stream.next({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as BaseEvent); stream.next({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: input.summary.slice(0, 8_192) } as BaseEvent); stream.next({ type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent); }
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

  /** Complete a replaced Copilot run without terminalizing its durable Attempt. */
  private finishRun(input: { attemptId: string; coordinate: Coordinate }): void {
    const id = key(input.coordinate);
    const stream = this.subject(input.coordinate.threadId, input.coordinate.runId);
    const activeMessageId = this.activeMessageIds.get(input.attemptId);
    if (activeMessageId) {
      stream.next({ type: EventType.TEXT_MESSAGE_END, messageId: activeMessageId } as BaseEvent);
      this.activeMessageIds.delete(input.attemptId);
    }
    stream.next({
      type: EventType.RUN_FINISHED,
      threadId: input.coordinate.threadId,
      runId: input.coordinate.runId,
      outcome: { type: 'success' },
    } as BaseEvent);
    stream.complete();
    this.attemptsByCoordinate.delete(id);
    if (this.currentRunByThread.get(input.coordinate.threadId) === input.coordinate.runId) {
      this.currentRunByThread.delete(input.coordinate.threadId);
    }
    this.streams.delete(id);
    this.rememberClosed(id);
  }
  private subject(threadId: string, runId: string): Subject<BaseEvent> {
    const id = key({ threadId, runId });
    if (this.closed.has(id)) { const closed = new Subject<BaseEvent>(); closed.complete(); return closed; }
    let stream = this.streams.get(id); if (!stream) { stream = new Subject<BaseEvent>(); this.streams.set(id, stream); } return stream;
  }
  /** A terminal Attempt may never be rebound to a later Copilot coordinate. */
  private closeLateCoordinate(id: string): void {
    const stream = this.streams.get(id);
    stream?.complete();
    this.streams.delete(id);
    this.streamSubscribers.delete(id);
    this.rememberClosed(id);
  }
  /** A rejected pre-admission Copilot run owns no Attempt and no output stream. */
  private releaseUnboundOutput(id: string): void {
    const remaining = (this.streamSubscribers.get(id) ?? 1) - 1;
    if (remaining > 0) {
      this.streamSubscribers.set(id, remaining);
      return;
    }
    this.streamSubscribers.delete(id);
    if (this.attemptsByCoordinate.has(id)) return;
    const stream = this.streams.get(id);
    if (!stream) return;
    stream.complete();
    this.streams.delete(id);
  }
  private rememberClosed(id: string): void {
    this.closed.add(id);
    if (this.closed.size > 256) this.closed.delete(this.closed.values().next().value as string);
  }
  private rememberTerminal(attemptId: string): void {
    this.terminalAttempts.add(attemptId);
    if (this.terminalAttempts.size > 256) {
      this.terminalAttempts.delete(this.terminalAttempts.values().next().value as string);
    }
  }
}
function key(input: Coordinate): string { return `${input.threadId}\u0000${input.runId}`; }
