import type { AgentSessionDeletionStatus } from '@kiditem/shared/agent-interaction';
import type { ScopedDeletionActor } from '../../../in/session-control/agent-session-deletion.port';

export const AGENT_SESSION_DELETION_QUERY = Symbol('AGENT_SESSION_DELETION_QUERY');

export interface AgentSessionDeletionQueryPort {
  findAuthorizedStatus(
    input: ScopedDeletionActor,
  ): Promise<AgentSessionDeletionStatus | null>;
}
