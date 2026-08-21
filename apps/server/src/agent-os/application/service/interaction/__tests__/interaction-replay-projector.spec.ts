import { describe, expect, it } from 'vitest';
import { EventType } from '@ag-ui/core';
import {
  formatAgentConversationEventName,
  formatAgentExecutionName,
  formatAgentSessionName,
} from '@kiditem/shared/identifiers';
import {
  InteractionReplayProjector,
  projectReplayEvent,
} from '../interaction-replay-projector';

const createdAt = new Date('2026-08-14T00:00:00.000Z');
const organizationId = 'organization-1';
const sessionId = 'session-1';

describe('InteractionReplayProjector', () => {
  it('maps a strict persisted page into canonical branded replay resources', () => {
    const replay = new InteractionReplayProjector().project(
      organizationId,
      { id: sessionId },
      {
        events: [{
          id: 'event-1',
          organizationId,
          sessionId,
          executionId: 'execution-1',
          aguiRunId: 'run-1',
          externalEventId: 'message-1',
          sequence: 1n,
          eventType: 'user_message',
          schemaVersion: 1,
          payload: { phase: 'complete', messageId: 'message-1', content: 'hello' },
          createdAt,
        }],
        lastSequence: 1n,
        hasMore: false,
      },
      null,
    );

    expect(replay).toEqual({
      session: formatAgentSessionName(organizationId, sessionId),
      events: [{
        name: formatAgentConversationEventName(organizationId, sessionId, '1'),
        session: formatAgentSessionName(organizationId, sessionId),
        execution: formatAgentExecutionName(organizationId, sessionId, 'execution-1'),
        aguiRunId: 'run-1',
        sequence: '1',
        eventType: 'user_message',
        schemaVersion: 1,
        payload: { phase: 'complete', messageId: 'message-1', content: 'hello' },
        createdAt: createdAt.toISOString(),
      }],
      nextCursor: null,
      lastSequence: '1',
    });
  });

  it('uses the persisted terminal AG-UI run id and rejects malformed canonical payloads', () => {
    expect(projectReplayEvent({
      id: 'terminal-1', organizationId, sessionId, executionId: 'execution-1',
      aguiRunId: 'agui-run-exact', externalEventId: 'terminal-message', sequence: 2n,
      eventType: 'run_terminal', schemaVersion: 1,
      payload: { status: 'completed', errorCode: null }, createdAt,
    }, 'thread-1')).toEqual({
      type: EventType.RUN_FINISHED,
      threadId: 'thread-1',
      runId: 'agui-run-exact',
    });

    expect(() => projectReplayEvent({
      id: 'malformed-1', organizationId, sessionId, executionId: 'execution-1',
      aguiRunId: null, externalEventId: 'message-2', sequence: 3n,
      eventType: 'assistant_message', schemaVersion: 1,
      payload: { phase: 'delta', messageId: 'message-2' }, createdAt,
    }, 'thread-1')).toThrow();
  });
});
