import type { BaseEvent } from '@ag-ui/core';

export const AGENT_AGUI_PRODUCER_PORT = Symbol('AGENT_AGUI_PRODUCER_PORT');
export interface AgentAguiProducerPort {
  attach(producerKey: string, sourceFactory: () => AsyncIterable<BaseEvent>): AsyncIterable<BaseEvent>;
}
