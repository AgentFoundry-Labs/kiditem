import type { SessionTaskExecutionRecord } from '../../repository/session-control/agent-session-control.persistence.types';
export const AGENT_SESSION_TRANSITION_TRANSACTION = Symbol('AGENT_SESSION_TRANSITION_TRANSACTION');
export interface AgentSessionTransitionTransactionPort {
  transitionTask(input: { organizationId: string; sessionId: string; taskId: string; expectedState: string; state: string }): Promise<{ id: string; status: string }>;
  transitionSession(input: { organizationId: string; sessionId: string; expectedState: string; state: string }): Promise<{ id: string; lifecycle: string }>;
  createRetryExecution(input: { organizationId: string; actorId: string; sessionId: string; taskId: string; expectedStatus: 'failed' | 'paused' | 'waiting_dependency'; idempotencyKey: string }): Promise<SessionTaskExecutionRecord>;
}
