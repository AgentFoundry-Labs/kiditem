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
});
