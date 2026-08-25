import { describe, expect, it } from 'vitest';
import { EventType } from '@ag-ui/core';
import { firstValueFrom, toArray } from 'rxjs';
import { AttemptFutureOutputChannel } from './attempt-future-output-channel';

describe('AttemptFutureOutputChannel', () => {
  it('binds the exact thread/run to an Attempt for a later HTTP stop request', () => {
    const channel = new AttemptFutureOutputChannel();

    channel.bind({ attemptId: 'attempt-1', threadId: 'thread-1', runId: 'run-1' });

    expect(channel.attemptId({ threadId: 'thread-1', runId: 'run-1' })).toBe('attempt-1');
    expect(channel.attemptId({ threadId: 'thread-1', runId: 'other-run' })).toBeNull();
  });

  it('emits one bounded RUN_ERROR terminal on failure and never replays it', async () => {
    const channel = new AttemptFutureOutputChannel();
    channel.bind({ attemptId: 'attempt-1', threadId: 'thread-1', runId: 'run-1' });
    const received = firstValueFrom(channel.future({ threadId: 'thread-1', runId: 'run-1' }).pipe(toArray()));

    channel.finish({ attemptId: 'attempt-1', outcome: 'failed', summary: 'bounded failure' });

    const events = await received;
    expect(events.map((event) => event.type)).toEqual([EventType.RUN_ERROR]);
    expect(events[0]).toMatchObject({ message: 'bounded failure', code: 'attempt_failed' });
    await expect(firstValueFrom(channel.future({ threadId: 'thread-1', runId: 'run-1' }))).rejects.toThrow();
  });

  it('does not cancel a bound Attempt when a subscriber disconnects', () => {
    const channel = new AttemptFutureOutputChannel();
    channel.bind({ attemptId: 'attempt-1', threadId: 'thread-1', runId: 'run-1' });
    const subscription = channel.future({ threadId: 'thread-1', runId: 'run-1' }).subscribe();

    subscription.unsubscribe();

    expect(channel.attemptId({ threadId: 'thread-1', runId: 'run-1' })).toBe('attempt-1');
  });

  it('emits bounded future-only live output before its terminal run event', async () => {
    const channel = new AttemptFutureOutputChannel();
    channel.bind({ attemptId: 'attempt-1', threadId: 'thread-1', runId: 'run-1' });
    const received = firstValueFrom(channel.future({ threadId: 'thread-1', runId: 'run-1' }).pipe(toArray()));

    channel.publish({ attemptId: 'attempt-1', output: 'live delta' });
    channel.finish({ attemptId: 'attempt-1', outcome: 'completed' });

    const events = await received;
    expect(events.map((event) => event.type)).toEqual([
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(events[1]).toMatchObject({ delta: 'live delta' });
  });

  it('atomically moves one live Attempt to a replacement Copilot run, closes the old run, and never duplicates its output', () => {
    const channel = new AttemptFutureOutputChannel();
    const oldEvents: unknown[] = [];
    const nextEvents: unknown[] = [];
    let oldCompleted = false;
    let nextCompleted = false;

    channel.bind({ attemptId: 'attempt-1', threadId: 'thread-1', runId: 'run-1' });
    channel.future({ threadId: 'thread-1', runId: 'run-1' }).subscribe({
      next: (event) => oldEvents.push(event),
      complete: () => { oldCompleted = true; },
    });
    channel.publish({ attemptId: 'attempt-1', output: 'first response' });

    channel.bind({ attemptId: 'attempt-1', threadId: 'thread-1', runId: 'run-2' });
    channel.future({ threadId: 'thread-1', runId: 'run-2' }).subscribe({
      next: (event) => nextEvents.push(event),
      complete: () => { nextCompleted = true; },
    });
    channel.publish({ attemptId: 'attempt-1', output: 'second response' });
    channel.finish({ attemptId: 'attempt-1', outcome: 'completed' });

    expect(oldCompleted).toBe(true);
    expect(oldEvents.map((event) => (event as { type: unknown }).type)).toEqual([
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(nextEvents.map((event) => (event as { type: unknown }).type)).toEqual([
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(oldEvents[1]).toMatchObject({ delta: 'first response' });
    expect(nextEvents[1]).toMatchObject({ delta: 'second response' });
    expect(nextCompleted).toBe(true);
    expect(channel.attemptId({ threadId: 'thread-1', runId: 'run-1' })).toBeNull();
    expect(channel.attemptId({ threadId: 'thread-1', runId: 'run-2' })).toBeNull();
  });

  it('rejects and closes a late coordinate after the Attempt terminalizes so an intake rebind cannot hang SSE', () => {
    const channel = new AttemptFutureOutputChannel();
    const lateEvents: unknown[] = [];
    let lateCompleted = false;

    channel.future({ threadId: 'thread-1', runId: 'late-run' }).subscribe({
      next: (event) => lateEvents.push(event),
      complete: () => { lateCompleted = true; },
    });
    channel.finish({ attemptId: 'attempt-1', outcome: 'completed' });

    expect(channel.bind({ attemptId: 'attempt-1', threadId: 'thread-1', runId: 'late-run' })).toBe(false);

    expect(lateEvents).toEqual([]);
    expect(lateCompleted).toBe(true);
    expect(channel.current('thread-1')).toBeNull();
    expect(channel.attemptId({ threadId: 'thread-1', runId: 'late-run' })).toBeNull();
    expect((channel as unknown as { streams: Map<string, unknown> }).streams.has('thread-1\u0000late-run')).toBe(false);
  });
});
