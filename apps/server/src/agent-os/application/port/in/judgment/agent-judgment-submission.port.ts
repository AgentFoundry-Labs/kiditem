import type { CanonicalResourceRef } from '@kiditem/shared/agent-interaction';
import type {
  AgentDefinitionName,
  AgentExecutionName,
  AgentSessionName,
  AgentSessionTaskName,
  IdempotencyKey,
  OperationRunName,
  OrganizationName,
  UserName,
} from '@kiditem/shared/identifiers';

export const AGENT_JUDGMENT_SUBMISSION_PORT = Symbol('AGENT_JUDGMENT_SUBMISSION_PORT');

export interface AgentJudgmentSubmissionPort {
  submit(input: {
    organization: OrganizationName;
    actor: UserName;
    agentDefinition: AgentDefinitionName;
    objective: string;
    resourceRefs: readonly CanonicalResourceRef[];
    idempotencyKey: IdempotencyKey;
  }): Promise<{
    session: AgentSessionName;
    task: AgentSessionTaskName;
    execution: AgentExecutionName;
    operation: OperationRunName;
  }>;
}
