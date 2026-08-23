import { Inject, Injectable } from "@nestjs/common";
import type { BaseEvent } from "@ag-ui/core";
import type { AgentInteractionLiveEventsPort } from "../../port/in/interaction/agent-interaction-live-events.port";
import type { AuthorizedLiveJoin } from "../../port/in/interaction/agent-interaction-authorization.port";
import {
  AGENT_CONVERSATION_LIVE_PUBLISHER,
  type AgentConversationLivePointer,
  type AgentConversationLivePublisherPort,
} from "../../port/out/event/agent-conversation-live-publisher.port";
import {
  AGENT_CONVERSATION_QUERY_REPOSITORY,
  type AgentConversationQueryRepositoryPort,
} from "../../port/out/repository/interaction/agent-conversation-query.repository.port";
import { InteractionReplayStreamProjector } from "../../port/in/interaction/agent-interaction-replay-projection.contract";

const CATCH_UP_LIMIT = 500;
const CATCH_UP_INTERVAL_MS = 1_000;

@Injectable()
export class AgentInteractionLiveEventsService implements AgentInteractionLiveEventsPort {
  constructor(
    @Inject(AGENT_CONVERSATION_QUERY_REPOSITORY)
    private readonly repository: AgentConversationQueryRepositoryPort,
    @Inject(AGENT_CONVERSATION_LIVE_PUBLISHER)
    private readonly publisher: AgentConversationLivePublisherPort,
  ) {}

  async open(input: {
    coordinate: AuthorizedLiveJoin;
    signal: AbortSignal;
    projector?: InteractionReplayStreamProjector;
  }): Promise<AsyncIterable<BaseEvent>> {
    return this.liveEvents(input.coordinate, input.signal, input.projector ?? new InteractionReplayStreamProjector(input.coordinate.copilotThreadId));
  }

  private async *liveEvents(
    authorization: AuthorizedLiveJoin,
    signal: AbortSignal,
    projector: InteractionReplayStreamProjector,
  ): AsyncIterable<BaseEvent> {
    let afterSequence = authorization.afterSequence;
    let replaying = true;
    // A publisher wake may reveal more than one DB page. Treat the complete
    // catch-up batch as replay so a request on page N cannot interrupt before
    // its decision or terminal envelope on page N + 1 is observed.
    let drainingPublisherWake = false;
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
        projector.prime(page.events);
        for (const event of page.events) {
          yield* projector.project(event, {
            deferInterrupt: replaying || drainingPublisherWake || page.hasMore,
          });
          if (projector.isClosed) return;
        }
        if (page.lastSequence < afterSequence || (page.hasMore && page.lastSequence <= afterSequence)) {
          throw new Error("INTERACTION_REPLAY_CURSOR_NONPROGRESS");
        }
        afterSequence = page.lastSequence;
        if (page.hasMore) continue;
        if (replaying || drainingPublisherWake) {
          yield* projector.finishReplay();
          if (projector.shouldCloseAfterReplay) return;
          replaying = false;
          drainingPublisherWake = false;
        } else if (projector.shouldCloseAfterReplay) {
          return;
        }
        // The subscription is established before the first catch-up read. A
        // publisher notification that arrives during that read is evidence of
        // a possible next page, not disposable wake-up noise.
        if (queue.length > 0) {
          queue.splice(0, queue.length);
          drainingPublisherWake = true;
          continue;
        }
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
