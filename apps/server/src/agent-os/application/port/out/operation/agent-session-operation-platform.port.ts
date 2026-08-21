import type {
  OperationEngineType,
  OperationResourceClass,
  OperationTriggerSource,
} from '@kiditem/shared/operations';

export const AGENT_SESSION_OPERATION_PLATFORM_PORT = Symbol(
  'AGENT_SESSION_OPERATION_PLATFORM_PORT',
);

export interface AgentSessionOperationDefinitionSnapshot {
  key: string;
  version: number;
  title: string;
  ownerDomain: string;
  engineType: OperationEngineType;
  resourceClass: OperationResourceClass;
  executionTimeoutMs: number;
  maxAttempts: number;
  successPersistence: 'retained' | 'ephemeral_on_success';
}

export interface AgentSessionOperationPlatformPort {
  resolveAccepting(input: {
    operationKey: string;
    triggerSource: OperationTriggerSource;
    input: Record<string, unknown>;
  }): {
    definition: AgentSessionOperationDefinitionSnapshot;
    parsedInput: Record<string, unknown>;
    signal: AbortSignal;
  };
}
