import type { Logger } from '@nestjs/common';
import type {
  AgentRunnerExecuteRequestResult,
  AgentRunnerPort,
} from '../../../agent-os/application/port/in/agent-runner.port';

const DEFAULT_INLINE_EXECUTION_ATTEMPTS = 3;

interface DrainEnqueuedAgentRequestInput {
  agentRunner: AgentRunnerPort;
  organizationId: string;
  requestId: string;
  workerId: string;
  maxAttempts?: number;
}

interface KickEnqueuedAgentRequestInput extends DrainEnqueuedAgentRequestInput {
  logger: Pick<Logger, 'warn'>;
  label: string;
}

export async function drainEnqueuedAgentRequest(
  input: DrainEnqueuedAgentRequestInput,
): Promise<AgentRunnerExecuteRequestResult | null> {
  if (!input.agentRunner.executeRequest) return null;

  const maxAttempts = input.maxAttempts ?? DEFAULT_INLINE_EXECUTION_ATTEMPTS;
  let lastResult: AgentRunnerExecuteRequestResult | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    lastResult = await input.agentRunner.executeRequest({
      organizationId: input.organizationId,
      requestId: input.requestId,
      workerId: input.workerId,
    });
    if (!lastResult.executed) return lastResult;
    if (!lastResult.errorCode) return lastResult;
  }
  return lastResult;
}

export function kickEnqueuedAgentRequest(input: KickEnqueuedAgentRequestInput): void {
  void drainEnqueuedAgentRequest(input).catch((error) => {
    input.logger.warn(
      `Failed to kick ${input.label} request ${input.requestId}: ${error}`,
    );
  });
}
