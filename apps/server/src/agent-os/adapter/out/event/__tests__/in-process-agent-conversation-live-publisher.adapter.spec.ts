import { describe, expect, it } from 'vitest';
import { InProcessAgentConversationLivePublisher } from '../in-process-agent-conversation-live-publisher.adapter';

describe('InProcessAgentConversationLivePublisher', () => {
  it('publishes only content-free durable pointers to matching subscribers', async () => {
    const publisher = new InProcessAgentConversationLivePublisher();
    const received: unknown[] = [];
    const unsubscribe = publisher.subscribe(
      { organizationId: 'org-1', sessionId: 'session-1' },
      (pointer) => received.push(pointer),
    );

    await publisher.publish({ organizationId: 'org-1', sessionId: 'session-1', eventId: 'event-1', sequence: 2n });
    await publisher.publish({ organizationId: 'org-2', sessionId: 'session-1', eventId: 'event-2', sequence: 3n });
    unsubscribe();

    expect(received).toEqual([{ organizationId: 'org-1', sessionId: 'session-1', eventId: 'event-1', sequence: 2n }]);
    expect(Object.keys(received[0] as object)).not.toContain('content');
  });
});
