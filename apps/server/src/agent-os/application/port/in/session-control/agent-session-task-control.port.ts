import type { AgentSessionName, AgentSessionTaskName } from '@kiditem/shared/identifiers';

export const AGENT_SESSION_TASK_CONTROL_PORT = Symbol('AGENT_SESSION_TASK_CONTROL_PORT');
export interface AgentSessionTaskControlPort {
  inspect(input: { organizationId: string; actorId: string; session: AgentSessionName; task: AgentSessionTaskName }): Promise<unknown>;
  retry(input: { organizationId: string; actorId: string; session: AgentSessionName; task: AgentSessionTaskName; idempotencyKey: string; expectedStatus: 'failed' | 'paused' | 'waiting_dependency' }): Promise<unknown>;
  resume(input: { organizationId: string; actorId: string; session: AgentSessionName; task: AgentSessionTaskName; idempotencyKey: string; expectedStatus: 'failed' | 'paused' | 'waiting_dependency' }): Promise<unknown>;
  cancel(input: { organizationId: string; actorId: string; session: AgentSessionName; task: AgentSessionTaskName; idempotencyKey: string; expectedStatus: 'queued' | 'running' | 'waiting_dependency' | 'waiting_approval' | 'paused'; reason: string | null }): Promise<{ status: string }>;
}
