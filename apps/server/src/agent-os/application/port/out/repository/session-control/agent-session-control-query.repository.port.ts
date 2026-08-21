import type { AgentSessionLifecycleRecoveryRecord, DelegationContextRecord, SessionTaskExecutionRecord } from './agent-session-control.persistence.types';
export const AGENT_SESSION_CONTROL_QUERY_REPOSITORY = Symbol('AGENT_SESSION_CONTROL_QUERY_REPOSITORY');
export interface AgentSessionControlQueryRepositoryPort {
  isExecutionCapabilityAllowed(input: { organizationId: string; sessionId: string; sessionTaskId: string; executionId: string; capabilityKey: string }): Promise<boolean>;
  loadDelegationContext(input: { organizationId: string; sessionId: string; parentTaskId: string; parentExecutionId: string; targetAgentDefinitionKey: string }): Promise<DelegationContextRecord | null>;
  findTask(input: { organizationId: string; sessionId: string; taskId: string }): Promise<{ id: string; status: string } | null>;
  findSession(input: { organizationId: string; sessionId: string }): Promise<{ id: string; lifecycle: string } | null>;
  loadTaskExecution(input: { organizationId: string; actorId: string; sessionId: string; taskId: string }): Promise<SessionTaskExecutionRecord | null>;
  loadCancelableTask(input: { organizationId: string; actorId: string; sessionId: string; taskId: string; expectedStatus: 'queued' | 'running' | 'waiting_dependency' | 'waiting_approval' | 'paused' }): Promise<Pick<SessionTaskExecutionRecord, 'organizationId' | 'sessionId' | 'taskId' | 'operationRunId'> | null>;
  listLifecycleRecoveryCandidates(input: { organizationId?: string; limit: number }): Promise<AgentSessionLifecycleRecoveryRecord[]>;
}
