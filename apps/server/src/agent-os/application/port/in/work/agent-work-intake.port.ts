import type {
  AdmitAttemptResult,
  AdmitRootAttemptResult,
} from '../../out/work/agent-work-persistence.types';

export const AGENT_WORK_INTAKE_PORT = Symbol('AGENT_WORK_INTAKE_PORT');

export type AgentWorkIntakePrincipal = Readonly<{
  organizationId: string;
  userId: string;
}>;

export type AgentWorkIntakeOutput = Readonly<{
  threadId: string;
  runId: string;
}>;

/** Application-level admission errors that an incoming Adapter renders for its transport. */
export class AgentWorkIntakeError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'AgentWorkIntakeError';
  }
}

/**
 * Deep Agent Work intake Module seam. It owns version/config resolution,
 * durable admission, immutable successor selection, and launch finalization.
 */
export interface AgentWorkIntakePort {
  startRoot(input: {
    principal: AgentWorkIntakePrincipal;
    objective: string;
    completionCriteria?: string;
    input?: unknown;
    sessionId?: string;
  }): Promise<AdmitRootAttemptResult>;

  continue(input: {
    principal: AgentWorkIntakePrincipal;
    sessionId: string;
    taskId: string;
    predecessorAttemptId: string;
    prompt: string;
    reopen?: boolean;
  }): Promise<AdmitAttemptResult>;

  startThread(input: {
    principal: AgentWorkIntakePrincipal;
    sessionId: string;
    agentDefinitionKey: string;
    prompt: string;
    output: AgentWorkIntakeOutput;
  }): Promise<Pick<AdmitAttemptResult, 'attemptId' | 'sessionId' | 'taskId'>>;
}
