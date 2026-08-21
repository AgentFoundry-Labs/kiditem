import type { AgentSessionDeletionStatus } from '@kiditem/shared/agent-interaction';
import type { AgentSessionName } from '@kiditem/shared/identifiers';

export const AGENT_SESSION_DELETION_PORT = Symbol('AGENT_SESSION_DELETION_PORT');

export interface ScopedDeletionActor {
  organizationId: string;
  actorUserId: string;
  session: AgentSessionName;
}

export interface AgentSessionDeletionPort {
  request(input: ScopedDeletionActor): Promise<AgentSessionDeletionStatus | null>;
  status(input: ScopedDeletionActor): Promise<AgentSessionDeletionStatus | null>;
  retry(input: ScopedDeletionActor): Promise<AgentSessionDeletionStatus | null>;
}
