import type { BaseEvent, RunAgentInput } from '@ag-ui/core';

export const AGENT_AGUI_RUNNER_PORT = Symbol('AGENT_AGUI_RUNNER_PORT');

export interface AuthorizedAguiRunInput {
  agentDefinitionKey: string;
  input: RunAgentInput;
}

export interface StopAuthorizedAguiRunInput {
  agentDefinitionKey: string;
  organizationId?: never;
  sessionId: string;
  executionId: string;
  copilotThreadId: string;
  aguiRunId: string;
  attemptId: string;
  startIntentId: string;
}

export interface AgentAguiRunnerPort {
  run(input: AuthorizedAguiRunInput): AsyncIterable<BaseEvent>;
  stop(input: StopAuthorizedAguiRunInput): Promise<boolean>;
}
