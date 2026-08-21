import type { AgentSessionDeletionStatus } from '@kiditem/shared/agent-interaction';
import type { ScopedDeletionActor } from '../../../in/session-control/agent-session-deletion.port';
import type { AgentSessionOperationDefinitionSnapshot } from '../../operation/agent-session-operation-platform.port';

export const AGENT_SESSION_DELETION_COMMAND_TRANSACTION = Symbol(
  'AGENT_SESSION_DELETION_COMMAND_TRANSACTION',
);

export interface AgentSessionDeletionCommandTransactionPort {
  begin(input: ScopedDeletionActor & {
    signal: AbortSignal;
    definition: AgentSessionOperationDefinitionSnapshot;
    parsedInput: Record<string, unknown>;
  }): Promise<AgentSessionDeletionStatus | null>;

  retry(input: ScopedDeletionActor & {
    signal: AbortSignal;
    definition: AgentSessionOperationDefinitionSnapshot;
  }): Promise<AgentSessionDeletionStatus | null>;
}
