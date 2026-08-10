import { AgentOsRuntimeError } from '../../domain/agent-os.errors';
import type { AgentOsRepositoryPort } from '../port/out/repository/agent-os-repository.port';

interface AgentOsMcpExecutionIdentity {
  organizationId: string;
  requestId: string;
  runId: string;
  agentInstanceId: string;
}

export async function assertAgentOsMcpExecutionActive(
  repository: AgentOsRepositoryPort | undefined,
  context: AgentOsMcpExecutionIdentity,
): Promise<void> {
  if (!repository) {
    throw new AgentOsRuntimeError(
      'process_interrupted',
      'The Agent OS execution is no longer active.',
    );
  }
  const [request, run] = await Promise.all([
    repository.findRunRequestById({
      organizationId: context.organizationId,
      requestId: context.requestId,
    }),
    repository.findRunById({
      organizationId: context.organizationId,
      runId: context.runId,
    }),
  ]);
  if (
    !request ||
    !run ||
    request.id !== context.requestId ||
    request.organizationId !== context.organizationId ||
    request.agentInstanceId !== context.agentInstanceId ||
    run.id !== context.runId ||
    run.organizationId !== context.organizationId ||
    run.requestId !== context.requestId ||
    run.agentInstanceId !== context.agentInstanceId
  ) {
    throw new AgentOsRuntimeError(
      'process_interrupted',
      'The Agent OS execution is no longer active.',
    );
  }
  if (request.status === 'cancelled' || run.status === 'cancelled') {
    throw new AgentOsRuntimeError(
      'user_cancelled',
      'The Agent OS run was cancelled.',
    );
  }
  if (request.status !== 'claimed' || run.status !== 'running') {
    throw new AgentOsRuntimeError(
      'process_interrupted',
      'The Agent OS execution is no longer active.',
    );
  }
}
