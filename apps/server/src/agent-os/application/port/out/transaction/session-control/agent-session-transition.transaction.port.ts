import type { SessionArtifactRecord, SessionTaskExecutionRecord } from '../../repository/session-control/agent-session-control.persistence.types';
export const AGENT_SESSION_TRANSITION_TRANSACTION = Symbol('AGENT_SESSION_TRANSITION_TRANSACTION');
export interface AgentSessionTransitionTransactionPort {
  appendArtifact(input: { organizationId: string; sessionId: string; taskId: string; executionId: string; artifactType: string; storageReference: string; sha256: string; metadata: Record<string, unknown>; idempotencyKey: string }): Promise<SessionArtifactRecord>;
  transitionTask(input: { organizationId: string; sessionId: string; taskId: string; expectedState: string; state: string }): Promise<{ id: string; status: string }>;
  transitionSession(input: { organizationId: string; sessionId: string; expectedState: string; state: string }): Promise<{ id: string; lifecycle: string }>;
  createRetryExecution(input: { organizationId: string; actorId: string; sessionId: string; taskId: string; expectedStatus: 'failed' | 'paused' | 'waiting_dependency'; idempotencyKey: string }): Promise<SessionTaskExecutionRecord>;
}
