import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import type {
  AttemptMcpActionsPort,
} from '../../port/in/mcp/attempt-mcp-actions.port';
import type { AttemptRuntimeControlPort } from '../../port/out/runtime/attempt-runtime-control.port';
import type { AgentWorkRepositoryPort } from '../../port/out/work/agent-work-repository.port';
import { canonicalize, hash } from './agent-capability-invocation.service';
import { AgentCapabilityInvocationService } from './agent-capability-invocation.service';
import { AgentTaskDelegationService } from './agent-task-delegation.service';
import { AgentDelegatedAttemptStarterService } from './agent-delegated-attempt-starter.service';
import { AgentCapabilityRegistry } from '../agent-capability-registry.service';
import { MUTATION_EFFECTS } from '../../../domain/capability/capability-definition';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Application orchestration for the Attempt-local MCP proxy. The incoming
 * socket adapter sees only its input port; persistence and live controls are
 * substituted through narrow outgoing ports here.
 */
export class AttemptMcpActionsService implements AttemptMcpActionsPort {
  constructor(
    private readonly invocations: Pick<AgentCapabilityInvocationService, 'invoke'>,
    private readonly delegation: Pick<AgentTaskDelegationService, 'delegate'>,
    private readonly work: Pick<
      AgentWorkRepositoryPort,
      'loadAttemptMcpDelegationContext' | 'loadAttemptMcpChild'
    >,
    private readonly controls: AttemptRuntimeControlPort,
    private readonly starter?: Pick<AgentDelegatedAttemptStarterService, 'start'>,
    private readonly capabilities?: Pick<AgentCapabilityRegistry, 'resolveDefinition' | 'listDefinitions'>,
  ) {}

  async catalog(input: Parameters<AttemptMcpActionsPort['catalog']>[0]) {
    const query = input.query?.trim().toLowerCase() ?? '';
    const definitions = this.capabilities?.listDefinitions() ?? [];
    return definitions.filter((definition) => definition.key.toLowerCase().includes(query))
      .map((definition) => ({
        key: definition.key, ownerDomain: definition.ownerDomain,
        description: definition.description,
        inputSchema: zodToJsonSchema(definition.inputSchema as never),
        effects: definition.effects, approvalRisk: definition.approvalRisk,
        idempotency: definition.idempotency,
      }));
  }

  async invoke(
    input: Parameters<AttemptMcpActionsPort['invoke']>[0],
  ): Promise<unknown> {
    const definition = this.capabilities?.resolveDefinition(input.capabilityKey);
    if (!definition) throw new AgentOsRuntimeError('capability_not_found', 'capability_not_found');
    const mutation = definition.effects.some((effect) => MUTATION_EFFECTS.has(effect));
    const defaultScope = input.binding.capabilityKeys.includes(input.capabilityKey);
    if (!defaultScope && mutation) {
      throw new AgentOsRuntimeError('capability_delegation_required', 'capability_delegation_required');
    }
    const ownerIdempotencyKey = hash({
      attemptId: input.binding.attemptId,
      capabilityKey: input.capabilityKey,
      input: canonicalize(input.input),
    });
    return this.invocations.invoke({
      organizationId: input.binding.organizationId,
      sessionId: input.binding.sessionId,
      taskId: input.binding.taskId,
      attemptId: input.binding.attemptId,
      agentVersionId: input.binding.agentVersionId,
      initiatingUserId: input.binding.userId,
      capabilityKey: input.capabilityKey,
      authorizationKind: defaultScope ? 'agent_default_scope' : 'cross_domain_read_grant',
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
    const delegated = await this.delegation.delegate({
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
    if (!delegated.replayed) {
      if (!this.starter) throw new Error('delegated_attempt_starter_unavailable');
      await this.starter.start({
        attemptId: delegated.firstAttemptId,
        sessionId: input.binding.sessionId,
        taskId: delegated.childTaskId,
        agentVersionId: context.targetAgentVersionId,
        organizationId: input.binding.organizationId,
        userId: input.binding.userId,
        agentKey: context.targetAgentKey,
        runtime: context.targetRuntimeType,
        capabilityKeys: context.targetCapabilityKeys,
        prompt: input.objective,
      });
    }
    return delegated;
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
    if (input.action === 'wait') {
      const settled = await this.waitForChild(input, child);
      if (!settled) throw new Error('attempt_mcp_child_not_found');
      return childProjection(settled);
    }
    if (input.action === 'result') return childResult(child);
    return childProjection(child);
  }

  private async waitForChild(
    input: Parameters<AttemptMcpActionsPort['child']>[0],
    current: NonNullable<Awaited<ReturnType<AgentWorkRepositoryPort['loadAttemptMcpChild']>>>,
  ): Promise<Awaited<ReturnType<AgentWorkRepositoryPort['loadAttemptMcpChild']>>> {
    if (!current.live) return current;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return this.work.loadAttemptMcpChild({
      organizationId: input.binding.organizationId, sessionId: input.binding.sessionId,
      parentTaskId: input.binding.taskId, childTaskId: input.childTaskId,
      requestedByUserId: input.binding.userId,
    });
  }
}

type ChildSnapshot = NonNullable<Awaited<ReturnType<AgentWorkRepositoryPort['loadAttemptMcpChild']>>>;
function childProjection(child: ChildSnapshot) {
  return { childTaskId: child.childTaskId, attemptId: child.attemptId, status: child.taskStatus, attemptStatus: child.attemptStatus, terminal: !child.live };
}
function childResult(child: ChildSnapshot) {
  if (child.live) return { ...childProjection(child), result: null };
  const result = child.result && typeof child.result === 'object' ? child.result as Record<string, unknown> : null;
  return {
    ...childProjection(child),
    result: result && {
      summary: typeof result.summary === 'string' ? result.summary.slice(0, 1_000) : null,
      resourceRefs: Array.isArray(result.resourceRefs) ? result.resourceRefs.slice(0, 50) : [],
      operationRefs: Array.isArray(result.operationRefs) ? result.operationRefs.slice(0, 50) : [],
      needsInput: result.needsInput && typeof result.needsInput === 'object' ? result.needsInput : null,
      error: result.error && typeof result.error === 'object' ? result.error : child.error,
    },
  };
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
