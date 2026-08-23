import type { BaseEvent } from "@ag-ui/core";
import type { AuthorizedLiveJoin } from "./agent-interaction-authorization.port";
import type { InteractionReplayStreamProjector } from "./agent-interaction-replay-projection.contract";

export const AGENT_INTERACTION_LIVE_EVENTS_PORT = Symbol("AGENT_INTERACTION_LIVE_EVENTS_PORT");
export interface AgentInteractionLiveEventsPort {
  open(input: { coordinate: AuthorizedLiveJoin; signal: AbortSignal; projector?: InteractionReplayStreamProjector }): Promise<AsyncIterable<BaseEvent>>;
}
