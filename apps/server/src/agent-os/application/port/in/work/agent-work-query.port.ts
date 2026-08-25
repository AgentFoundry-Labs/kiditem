import type { RootAttemptReplayReceipt } from '../../out/work/agent-work-persistence.types';

export const AGENT_WORK_QUERY_PORT = Symbol('AGENT_WORK_QUERY_PORT');

export interface AgentWorkQueryPort {
  view(input: { organizationId: string; userId: string; sessionId: string }): Promise<unknown>;
  activeVersion(agentDefinitionKey: string): Promise<{
    id: string;
    agentDefinitionKey: string;
    runtimeType: string;
    capabilityKeys: unknown;
    instructionProfileRef: string;
  } | null>;
  taskVersion(input: { organizationId: string; userId: string; sessionId: string; taskId: string }): Promise<{
    id: string;
    agentDefinitionKey: string;
    runtimeType: string;
    capabilityKeys: unknown;
    instructionProfileRef: string;
  } | null>;
  liveAttempt(input: { organizationId: string; userId: string; sessionId: string; taskId: string; attemptId?: string }): Promise<{ id: string } | null>;
  threadContinuation(input: { organizationId: string; userId: string; sessionId: string }): Promise<{
    taskId: string;
    predecessorAttemptId: string;
    terminal: boolean;
    /** Immutable Task snapshot pin; an incoming Agent key may not cross it. */
    agentDefinitionKey: string;
    /** First Attempt durable receipt for an exact root submission retry. */
    rootAdmission: RootAttemptReplayReceipt | null;
  } | null>;
  /** A bounded, transcript-free durable context for an explicitly continued immutable Attempt. */
  continuationContext(input: { organizationId: string; userId: string; sessionId: string; taskId: string; prompt: string }): Promise<{ prompt: string; input: { prompt: string; resourceRefs: unknown[]; operationRefs: unknown[] } }>;
}
