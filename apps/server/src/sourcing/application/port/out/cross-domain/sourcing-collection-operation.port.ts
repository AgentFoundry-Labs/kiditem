import type { AgentCapabilityExecutionInput } from '../../../../../agent-os/application/port/out/capability/agent-capability-handler.port';

export const SOURCING_COLLECTION_OPERATION_PORT = Symbol(
  'SOURCING_COLLECTION_OPERATION_PORT',
);

export interface SourcingCollectionOperationPort {
  startOfficial(input: {
    execution: AgentCapabilityExecutionInput;
    sources: Array<'naver' | '1688' | 'shorts'>;
  }): Promise<{ operation: string; status: string }>;
}
