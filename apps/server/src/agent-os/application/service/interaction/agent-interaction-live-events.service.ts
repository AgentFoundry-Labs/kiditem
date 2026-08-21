import { Inject, Injectable } from "@nestjs/common";
import type { BaseEvent } from "@ag-ui/core";
import {
  AGENT_INTERACTION_AUTHORIZATION_PORT,
  type AgentInteractionAuthorizationPort,
} from "../../port/in/interaction/agent-interaction-authorization.port";
import type { AgentInteractionLiveEventsPort } from "../../port/in/interaction/agent-interaction-live-events.port";
import {
  AGENT_CONVERSATION_LIVE_PUBLISHER,
  type AgentConversationLivePointer,
  type AgentConversationLivePublisherPort,
} from "../../port/out/event/agent-conversation-live-publisher.port";
import {
  AGENT_CONVERSATION_QUERY_REPOSITORY,
  type AgentConversationQueryRepositoryPort,
} from "../../port/out/repository/interaction/agent-conversation-query.repository.port";
import { projectReplayEvent } from "./interaction-replay-projector";

const CATCH_UP_LIMIT = 500;
const CATCH_UP_INTERVAL_MS = 1_000;

@Injectable()
export class AgentInteractionLiveEventsService implements AgentInteractionLiveEventsPort {
  constructor(
    @Inject(AGENT_INTERACTION_AUTHORIZATION_PORT)
    private readonly authorization: AgentInteractionAuthorizationPort,
    @Inject(AGENT_CONVERSATION_QUERY_REPOSITORY)
    private readonly repository: AgentConversationQueryRepositoryPort,
    @Inject(AGENT_CONVERSATION_LIVE_PUBLISHER)
    private readonly publisher: AgentConversationLivePublisherPort,
  ) {}

  async open(input: {
    agentDefinitionKey: string;
    copilotThreadId: string;
    afterSequence: bigint;
    liveJoinToken: string;
    signal: AbortSignal;
  }): Promise<AsyncIterable<BaseEvent>> {
    const authorization = await this.authorization.authorizeLiveJoin({
      agentDefinitionKey: input.agentDefinitionKey,
      copilotThreadId: input.copilotThreadId,
      afterSequence: input.afterSequence,
      liveJoinToken: input.liveJoinToken,
    });
    return this.liveEvents(authorization, input.signal);
  }

  private async *liveEvents(
    authorization: Awaited<
      ReturnType<AgentInteractionAuthorizationPort["authorizeLiveJoin"]>
    >,
    signal: AbortSignal,
  ): AsyncIterable<BaseEvent> {
    let afterSequence = authorization.afterSequence;
    const queue: AgentConversationLivePointer[] = [];
    let wake: (() => void) | null = null;
    const unsubscribe = this.publisher.subscribe(authorization, (pointer) => {
      queue.push(pointer);
      wake?.();
    });
    const stop = () => wake?.();
    signal.addEventListener("abort", stop, { once: true });
    try {
      while (!signal.aborted) {
        const page = await this.repository.readConversationEvents({
          organizationId: authorization.organizationId,
          userId: authorization.userId,
          sessionId: authorization.sessionId,
          afterSequence,
          limit: CATCH_UP_LIMIT,
        });
        for (const event of page.events) {
          yield projectReplayEvent(event, authorization.copilotThreadId);
          if (event.eventType === "run_terminal") return;
        }
        afterSequence = page.lastSequence;
        if (page.hasMore) continue;
        queue.splice(0, queue.length);
        await new Promise<void>((resolve) => {
          wake = resolve;
          const timer = setTimeout(resolve, CATCH_UP_INTERVAL_MS);
          timer.unref?.();
        });
        wake = null;
      }
    } finally {
      signal.removeEventListener("abort", stop);
      unsubscribe();
    }
  }
}
