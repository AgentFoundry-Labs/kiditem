import { EventType, type BaseEvent } from '@ag-ui/core';
import { z } from 'zod';
import {
  AgentConversationEventContentSchema,
  AgentConversationReplaySchema,
  type AgentConversationReplay,
} from '@kiditem/shared/agent-interaction';
import {
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  NonNegativeDecimalSequenceSchema,
  OpaqueReplayCursorSchema,
  OrganizationIdSchema,
  PositiveDecimalSequenceSchema,
  formatAgentConversationEventName,
  formatAgentExecutionName,
  formatAgentSessionName,
} from '@kiditem/shared/identifiers';
import type {
  AgentConversationEventRecord,
  AgentSessionRecord,
  ConversationEventPage,
} from '../../port/out/repository/agent-interaction-repository.port';
import { InteractionTokenCodec } from './interaction-token-codec';

/** Maps durable interaction records to the two externally visible replay shapes. */
export class InteractionReplayProjector {
  project(
    organizationId: z.infer<typeof OrganizationIdSchema>,
    session: Pick<AgentSessionRecord, 'id'>,
    page: ConversationEventPage,
    nextCursor: string | null,
  ): AgentConversationReplay {
    const sessionId = AgentSessionIdSchema.parse(session.id);
    return parseShared(AgentConversationReplaySchema, {
      session: formatAgentSessionName(organizationId, sessionId),
      events: page.events.map((event) => this.envelope(organizationId, sessionId, event)),
      nextCursor: nextCursor === null ? null : OpaqueReplayCursorSchema.parse(nextCursor),
      lastSequence: NonNegativeDecimalSequenceSchema.parse(page.lastSequence.toString()),
    });
  }

  private envelope(
    organizationId: z.infer<typeof OrganizationIdSchema>,
    sessionId: z.infer<typeof AgentSessionIdSchema>,
    event: AgentConversationEventRecord,
  ) {
    return {
      name: formatAgentConversationEventName(
        organizationId,
        sessionId,
        PositiveDecimalSequenceSchema.parse(event.sequence.toString()),
      ),
      session: formatAgentSessionName(organizationId, sessionId),
      execution: event.executionId === null
        ? null
        : formatAgentExecutionName(
          organizationId,
          sessionId,
          AgentExecutionIdSchema.parse(event.executionId),
        ),
      aguiRunId: event.aguiRunId,
      sequence: PositiveDecimalSequenceSchema.parse(event.sequence.toString()),
      eventType: event.eventType,
      schemaVersion: event.schemaVersion,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    };
  }
}

export function projectReplayEvent(
  event: AgentConversationEventRecord,
  threadId: string,
): BaseEvent {
  switch (event.eventType) {
    case 'user_message':
    case 'assistant_message': {
      const content = canonicalContent(event);
      if (content.eventType !== 'user_message' && content.eventType !== 'assistant_message') {
        throw new Error('Invalid canonical message event.');
      }
      const phase = 'phase' in content.payload ? content.payload.phase : 'complete';
      if (phase === 'start') {
        return {
          type: EventType.TEXT_MESSAGE_START,
          messageId: content.payload.messageId,
          role: event.eventType === 'user_message' ? 'user' : 'assistant',
        };
      }
      if (phase === 'delta') {
        if (!('content' in content.payload)) throw new Error('Invalid canonical message delta.');
        return {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: content.payload.messageId,
          delta: content.payload.content,
        };
      }
      if (phase === 'end') {
        return { type: EventType.TEXT_MESSAGE_END, messageId: content.payload.messageId };
      }
      if (!('content' in content.payload)) throw new Error('Invalid canonical complete message.');
      return {
        type: EventType.TEXT_MESSAGE_CHUNK,
        messageId: content.payload.messageId,
        role: event.eventType === 'user_message' ? 'user' : 'assistant',
        delta: content.payload.content,
      };
    }
    case 'run_terminal': {
      const content = canonicalContent(event);
      if (content.eventType !== 'run_terminal' || !event.aguiRunId) {
        throw new Error('Canonical terminal event has no AG-UI run correlation.');
      }
      return content.payload.status === 'completed'
        ? { type: EventType.RUN_FINISHED, threadId, runId: event.aguiRunId }
        : {
          type: EventType.RUN_ERROR,
          code: content.payload.errorCode ?? 'INTERACTION_RUNTIME_FAILED',
          message: 'The Agent OS runtime failed.',
          threadId,
          runId: event.aguiRunId,
        } as BaseEvent;
    }
    default:
      return {
        type: EventType.STATE_SNAPSHOT,
        snapshot: {
          eventId: event.id,
          sequence: event.sequence.toString(),
          eventType: event.eventType,
          payload: event.payload,
        },
      };
  }
}

function canonicalContent(event: AgentConversationEventRecord) {
  return AgentConversationEventContentSchema.parse({
    eventType: event.eventType,
    schemaVersion: event.schemaVersion,
    payload: event.payload,
  });
}

function parseShared<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
): z.infer<T> {
  return InteractionTokenCodec.response(schema, value);
}
