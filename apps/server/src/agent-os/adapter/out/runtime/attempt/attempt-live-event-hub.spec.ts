import { describe, expect, it } from 'vitest';
import { firstValueFrom, toArray } from 'rxjs';
import { AttemptLiveEventHub } from './attempt-live-event-hub';

describe('AttemptLiveEventHub', () => {
  it('projects only future bounded terminal output and never keeps a replay buffer', async () => {
    const hub = new AttemptLiveEventHub();
    hub.bind({ attemptId: 'attempt', threadId: 'thread', runId: 'run' });
    const received = firstValueFrom(hub.futureThread('thread').pipe(toArray()));
    hub.finish({ attemptId: 'attempt', outcome: 'completed', summary: 'durable final answer' });
    await expect(received).resolves.toMatchObject([
      { type: 'TEXT_MESSAGE_START' }, { type: 'TEXT_MESSAGE_CONTENT', delta: 'durable final answer' },
      { type: 'TEXT_MESSAGE_END' }, { type: 'RUN_FINISHED', threadId: 'thread', runId: 'run' },
    ]);
    // A reconnect after terminal completion has no old frames to replay.
    let next = false;
    hub.futureThread('thread').subscribe(() => { next = true; });
    expect(next).toBe(false);
  });
});
