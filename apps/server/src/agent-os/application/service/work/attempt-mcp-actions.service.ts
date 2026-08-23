import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import type {
  AttemptMcpActionsPort,
} from '../../port/in/mcp/attempt-mcp-actions.port';
import type { AttemptRuntimeControlPort } from '../../port/out/runtime/attempt-runtime-control.port';
import type { AgentWorkRepositoryPort } from '../../port/out/work/agent-work-repository.port';
import { canonicalize, hash } from './agent-capability-invocation.service';
import { AgentCapabilityInvocationService } from './agent-capability-invocation.service';
import { AgentTaskDelegationService } from './agent-task-delegation.service';

/**
 * Application orchestration for the Attempt-local MCP proxy. The incoming
 * socket adapter sees only its input port; persistence and live controls are
 * substituted through narrow outgoing ports here.
 */
export class AttemptMcpActionsService implements AttemptMcpActionsPort {
  constructor(
    private readonly invocations: Pick<AgentCapabilityInvocationService, 'authorize'>,
    private readonly delegation: Pick<AgentTaskDelegationService, 'delegate'>,
    private readonly work: Pick<
      AgentWorkRepositoryPort,
      'loadAttemptMcpDelegationContext' | 'loadAttemptMcpChild'
    >,
    private readonly controls: AttemptRuntimeControlPort,
  ) {}

  async invoke(
    input: Parameters<AttemptMcpActionsPort['invoke']>[0],
  ): Promise<unknown> {
    const ownerIdempotencyKey = hash({
      attemptId: input.binding.attemptId,
      capabilityKey: input.capabilityKey,
      input: canonicalize(input.input),
    });
    return this.invocations.authorize({
      organizationId: input.binding.organizationId,
      sessionId: input.binding.sessionId,
      taskId: input.binding.taskId,
      attemptId: input.binding.attemptId,
      agentVersionId: input.binding.agentVersionId,
      initiatingUserId: input.binding.userId,
      capabilityKey: input.capabilityKey,
      authorizationKind: 'agent_default_scope',
      authorizationExpiresAt: new Date(Date.now() + 30 * 60 * 1_000),
      ownerIdempotencyKey,
      input: input.input,
    });
  }

  async delegate(
    input: Parameters<AttemptMcpActionsPort['delegate']>[0],
  ): Promise<unknown> {
    const context = await this.work.loadAttemptMcpDelegationContext({
      organizationId: input.binding.organizationId,
      sessionId: input.binding.sessionId,
      taskId: input.binding.taskId,
      attemptId: input.binding.attemptId,
      requestedByUserId: input.binding.userId,
      targetAgentKey: input.targetAgentKey,
    });
    if (!context) throw new Error('attempt_mcp_delegation_target_unavailable');
    return this.delegation.delegate({
      organizationId: input.binding.organizationId,
      sessionId: input.binding.sessionId,
      parentTaskId: input.binding.taskId,
      delegatingAttemptId: input.binding.attemptId,
      requestedByUserId: input.binding.userId,
      targetAgentVersionId: context.targetAgentVersionId,
      objective: input.objective,
      completionCriteria: input.objective,
      inputResourceRefs: [],
      idempotencyKey: `attempt:${input.binding.attemptId}:delegate:${input.targetAgentKey}:${input.objective}`,
      input: context.input,
      applicationVersion: context.applicationVersion,
      authorizingGitSha: context.authorizingGitSha,
      cliVersion: context.cliVersion,
      ...(context.reportedModel ? { reportedModel: context.reportedModel } : {}),
    });
  }

  async child(
    input: Parameters<AttemptMcpActionsPort['child']>[0],
  ): Promise<unknown> {
    const child = await this.work.loadAttemptMcpChild({
      organizationId: input.binding.organizationId,
      sessionId: input.binding.sessionId,
      parentTaskId: input.binding.taskId,
      childTaskId: input.childTaskId,
      requestedByUserId: input.binding.userId,
    });
    if (!child) throw new Error('attempt_mcp_child_not_found');
    if (!child.attemptId) throw new Error('attempt_mcp_child_not_started');
    if (input.action === 'message') {
      assertMessageable(child);
      await this.controls.send({
        attemptId: child.attemptId,
        message: input.message ?? '',
      });
      return { childTaskId: child.childTaskId, status: child.taskStatus };
    }
    if (input.action === 'interrupt') {
      await this.controls.interrupt({ attemptId: child.attemptId });
      return { childTaskId: child.childTaskId, status: child.taskStatus };
    }
    return {
      childTaskId: child.childTaskId,
      attemptId: child.attemptId,
      status: child.taskStatus,
      attemptStatus: child.attemptStatus,
    };
  }
}

function assertMessageable(input: {
  taskStatus: string;
  live: boolean;
}): void {
  if (input.taskStatus !== 'open') {
    throw new AgentOsRuntimeError(
      input.taskStatus === 'cancelled' ? 'task_cancelled' : 'task_not_open',
      input.taskStatus,
    );
  }
  if (!input.live) {
    throw new AgentOsRuntimeError('attempt_not_live', 'attempt_not_live');
  }
}
