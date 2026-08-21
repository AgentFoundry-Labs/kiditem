import type { BaseEvent } from '@ag-ui/core';

export const AGENT_INTERACTION_LIVE_EVENTS_PORT = Symbol(
  'AGENT_INTERACTION_LIVE_EVENTS_PORT',
);

export interface AgentInteractionLiveEventsPort {
  open(input: {
    agentDefinitionKey: string;
    copilotThreadId: string;
    afterSequence: bigint;
    liveJoinToken: string;
    signal: AbortSignal;
  }): Promise<AsyncIterable<BaseEvent>>;
}
