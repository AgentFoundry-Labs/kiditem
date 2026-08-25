import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import type {
  AttemptMcpActionsPort,
} from '../../port/in/mcp/attempt-mcp-actions.port';
import type { AttemptRuntimeControlPort } from '../../port/out/runtime/attempt-runtime-control.port';
import type { AgentWorkRepositoryPort } from '../../port/out/work/agent-work-repository.port';
import { deriveOwnerIdempotencyKey } from '../../../../common/owner-idempotency-key';
import { AgentCapabilityInvocationService } from './agent-capability-invocation.service';
import { AgentTaskDelegationService } from './agent-task-delegation.service';
import { AgentDelegatedAttemptStarterService } from './agent-delegated-attempt-starter.service';
import { AgentCapabilityRegistry } from '../agent-capability-registry.service';
import { MUTATION_EFFECTS } from '../../../domain/capability/capability-definition';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AgentResultEnvelopeSchema } from '@kiditem/shared/agent-interaction';

/**
 * Application orchestration for Attempt-local MCP actions. The direct HTTP
 * adapter sees only this input port; persistence and live controls are
 * substituted through narrow outgoing ports here.
 */
export class AttemptMcpActionsService implements AttemptMcpActionsPort {
  private readonly delegationActions = new Map<string, Promise<unknown>>();

  constructor(
    private readonly invocations: Pick<AgentCapabilityInvocationService, 'invoke' | 'authorize'>,
    private readonly delegation: Pick<AgentTaskDelegationService, 'delegate'>,
    private readonly work: Pick<
      AgentWorkRepositoryPort,
      | 'assertAttemptMcpBinding'
      | 'loadAttemptMcpDelegationContext'
      | 'loadAttemptMcpDelegationReplay'
      | 'loadAttemptMcpChild'
      | 'loadAttemptMcpInvocation'
    >,
    private readonly controls: AttemptRuntimeControlPort,
    private readonly starter?: Pick<AgentDelegatedAttemptStarterService, 'start' | 'failBeforeStart'>,
    private readonly capabilities?: Pick<AgentCapabilityRegistry, 'resolveDefinition' | 'listDefinitions'>,
  ) {}

  async catalog(input: Parameters<AttemptMcpActionsPort['catalog']>[0]) {
    await this.assertBinding(input.binding);
    const query = input.query?.trim().toLowerCase() ?? '';
    const definitions = this.capabilities?.listDefinitions() ?? [];
    return definitions.filter((definition) => definition.key.toLowerCase().includes(query))
      .map((definition) => ({
        key: definition.key, ownerDomain: definition.ownerDomain,
        description: definition.description,
        // Catalog discovery travels through the same bounded MCP result
        // envelope as business work. Preserve every JSON Schema validation
        // keyword in a bounded document string; only descriptive annotations
        // such as descriptions/examples are clamped.
        inputSchema: encodedCatalogInputSchema(zodToJsonSchema(definition.inputSchema as never)),
        effects: definition.effects, approvalRisk: definition.approvalRisk,
        idempotency: definition.idempotency,
      }));
  }

  async invoke(
    input: Parameters<AttemptMcpActionsPort['invoke']>[0],
  ): Promise<unknown> {
    await this.assertBinding(input.binding);
    const definition = this.capabilities?.resolveDefinition(input.capabilityKey);
    if (!definition) throw new AgentOsRuntimeError('capability_not_found', 'capability_not_found');
    const parsedInput = definition.inputSchema.parse(input.input);
    const mutation = definition.effects.some((effect) => MUTATION_EFFECTS.has(effect));
    const defaultScope = input.binding.capabilityKeys.includes(input.capabilityKey);
    if (!defaultScope && mutation) {
      throw new AgentOsRuntimeError('capability_delegation_required', 'capability_delegation_required');
    }
    const ownerIdempotencyKey = deriveOwnerIdempotencyKey({
      attemptId: input.binding.attemptId,
      capabilityKey: input.capabilityKey,
      input: parsedInput,
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
      input: parsedInput,
    });
  }

  async delegate(
    input: Parameters<AttemptMcpActionsPort['delegate']>[0],
  ): Promise<unknown> {
    await this.assertBinding(input.binding);
    const explicit = explicitMutationGrant(input, this.capabilities);
    const idempotencyKey = delegationIdempotencyKey(input, explicit);
    return this.coalesceDelegation(
      delegationActionKey(input, idempotencyKey),
      () => this.delegateOnce(input, explicit, idempotencyKey),
    );
  }

  private async delegateOnce(
    input: Parameters<AttemptMcpActionsPort['delegate']>[0],
    explicit: ReturnType<typeof explicitMutationGrant>,
    idempotencyKey: string,
  ): Promise<unknown> {
    const replay = await this.work.loadAttemptMcpDelegationReplay({
      organizationId: input.binding.organizationId,
      sessionId: input.binding.sessionId,
      taskId: input.binding.taskId,
      attemptId: input.binding.attemptId,
      requestedByUserId: input.binding.userId,
      idempotencyKey,
    });
    if (replay) return {
      childTaskId: replay.childTaskId,
      firstAttemptId: replay.firstAttemptId,
      attemptId: replay.attemptId,
      replayed: true,
      launchRequired: false,
      taskTerminal: replay.taskTerminal,
    };
    const context = await this.work.loadAttemptMcpDelegationContext({
      organizationId: input.binding.organizationId,
      sessionId: input.binding.sessionId,
      taskId: input.binding.taskId,
      attemptId: input.binding.attemptId,
      requestedByUserId: input.binding.userId,
      targetAgentKey: input.targetAgentKey,
      capabilityKey: explicit?.capabilityKey,
      ownerDomain: explicit?.ownerDomain,
    });
    if (!context) throw new Error('attempt_mcp_delegation_target_unavailable');
    const childInput = delegatedChildInput(
      input,
      explicit,
      context.rootTaskId,
      context.input,
    );
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
      // The content-addressed server key identifies an exact MCP retry; the
      // lower admission hash independently fences durable key collisions.
      idempotencyKey,
      input: childInput,
      applicationVersion: context.applicationVersion,
      authorizingGitSha: context.authorizingGitSha,
      cliVersion: context.cliVersion,
      reportedModel: targetModel(context),
    });
    const childAttemptId = delegated.attemptId;
    let authorization: Awaited<ReturnType<AgentCapabilityInvocationService['authorize']>> | undefined;
    if (explicit && delegated.launchRequired && !delegated.replayed && !delegated.taskTerminal) {
      try {
        authorization = await this.invocations.authorize({
          organizationId: input.binding.organizationId,
          sessionId: input.binding.sessionId,
          taskId: delegated.childTaskId,
          attemptId: childAttemptId,
          agentVersionId: context.targetAgentVersionId,
          initiatingUserId: input.binding.userId,
          capabilityKey: explicit.capabilityKey,
          authorizationKind: 'explicit_execution_grant',
          authorizationExpiresAt: new Date(Date.now() + 30 * 60 * 1_000),
          ownerIdempotencyKey: deriveOwnerIdempotencyKey({
            attemptId: childAttemptId,
            capabilityKey: explicit.capabilityKey,
            input: explicit.input,
          }),
          input: explicit.input,
        });
      } catch (error) {
        if (delegated.launchRequired) await this.starter?.failBeforeStart({
          attemptId: childAttemptId,
          code: 'explicit_execution_grant_failed',
          message: 'Explicit execution grant admission failed.',
        });
        throw error;
      }
    }
    if (delegated.launchRequired && !delegated.replayed) {
      if (!this.starter) throw new Error('delegated_attempt_starter_unavailable');
      await this.starter.start({
        attemptId: childAttemptId,
        sessionId: input.binding.sessionId,
        taskId: delegated.childTaskId,
        agentVersionId: context.targetAgentVersionId,
        organizationId: input.binding.organizationId,
        userId: input.binding.userId,
        agentKey: context.targetAgentKey,
        runtime: context.targetRuntimeType,
        capabilityKeys: context.targetCapabilityKeys,
        prompt: input.objective,
        model: targetModel(context),
        instructionProfileRef: context.targetInstructionProfileRef,
      });
    }
    return authorization ? {
      ...delegated,
      invocationId: authorization.invocationId,
      invocationStatus: authorization.invocationStatus,
      approvalId: authorization.approvalId,
    } : delegated;
  }

  private coalesceDelegation(
    key: string,
    delegate: () => Promise<unknown>,
  ): Promise<unknown> {
    const existing = this.delegationActions.get(key);
    if (existing) return existing;
    if (this.delegationActions.size >= 256) {
      return Promise.reject(new AgentOsRuntimeError('delegation_in_flight_limit'));
    }
    let action!: Promise<unknown>;
    action = Promise.resolve()
      .then(delegate)
      .finally(() => {
        if (this.delegationActions.get(key) === action) this.delegationActions.delete(key);
      });
    this.delegationActions.set(key, action);
    return action;
  }

  async invocation(input: Parameters<AttemptMcpActionsPort['invocation']>[0]): Promise<unknown> {
    await this.assertBinding(input.binding);
    const load = () => this.work.loadAttemptMcpInvocation({
      organizationId: input.binding.organizationId, sessionId: input.binding.sessionId,
      taskId: input.binding.taskId, attemptId: input.binding.attemptId,
      requestedByUserId: input.binding.userId, invocationId: input.invocationId,
    });
    const invocation = await load();
    if (!invocation) throw new Error('attempt_mcp_invocation_not_found');
    return invocationProjection(invocation);
  }

  async child(
    input: Parameters<AttemptMcpActionsPort['child']>[0],
  ): Promise<unknown> {
    await this.assertBinding(input.binding);
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
      if (!input.turnId) throw new AgentOsRuntimeError('attempt_mcp_message_turn_missing', 'attempt_mcp_message_turn_missing');
      await this.controls.send({
        attemptId: child.attemptId,
        message: input.message ?? '',
        turnId: input.turnId,
      });
      return { childTaskId: child.childTaskId, status: child.taskStatus };
    }
    if (input.action === 'interrupt') {
      await this.controls.interrupt({ attemptId: child.attemptId });
      return { childTaskId: child.childTaskId, status: child.taskStatus };
    }
    if (input.action === 'wait') {
      return childProjection(child);
    }
    if (input.action === 'result') return childResult(child);
    return childProjection(child);
  }

  async assertBinding(input: Parameters<AttemptMcpActionsPort['catalog']>[0]['binding']): Promise<void> {
    const valid = await this.work.assertAttemptMcpBinding({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      attemptId: input.attemptId,
      agentVersionId: input.agentVersionId,
      requestedByUserId: input.userId,
      capabilityKeys: input.capabilityKeys,
    });
    if (!valid) {
      throw new AgentOsRuntimeError(
        'attempt_mcp_binding_invalid',
        'attempt_mcp_binding_invalid',
      );
    }
  }
}

function explicitMutationGrant(
  input: Parameters<AttemptMcpActionsPort['delegate']>[0],
  capabilities: Pick<AgentCapabilityRegistry, 'resolveDefinition'> | undefined,
): { capabilityKey: string; ownerDomain: string; input: Record<string, unknown> } | undefined {
  if (!input.capabilityKey && input.input === undefined) return undefined;
  if (!input.capabilityKey || input.input === undefined) {
    throw new AgentOsRuntimeError('capability_input_invalid', 'capability_input_invalid');
  }
  const definition = capabilities?.resolveDefinition(input.capabilityKey);
  if (!definition) throw new AgentOsRuntimeError('capability_not_found', 'capability_not_found');
  if (!definition.effects.some((effect) => MUTATION_EFFECTS.has(effect))) {
    throw new AgentOsRuntimeError('capability_delegation_required', 'capability_delegation_required');
  }
  try {
    return {
      capabilityKey: input.capabilityKey,
      ownerDomain: definition.ownerDomain,
      input: definition.inputSchema.parse(input.input) as Record<string, unknown>,
    };
  } catch {
    throw new AgentOsRuntimeError('capability_input_invalid', 'capability_input_invalid');
  }
}

function delegationIdempotencyKey(
  input: Parameters<AttemptMcpActionsPort['delegate']>[0],
  explicit: ReturnType<typeof explicitMutationGrant>,
): string {
  return deriveOwnerIdempotencyKey({
    attemptId: input.binding.attemptId,
    capabilityKey: `delegation.${input.targetAgentKey}`,
    input: {
      objective: input.objective,
      ...(explicit ? { capabilityKey: explicit.capabilityKey, input: explicit.input } : {}),
    },
  });
}

function delegationActionKey(
  input: Parameters<AttemptMcpActionsPort['delegate']>[0],
  idempotencyKey: string,
): string {
  return [
    input.binding.organizationId,
    input.binding.sessionId,
    input.binding.taskId,
    input.binding.attemptId,
    input.binding.userId,
    idempotencyKey,
  ].join('\u0000');
}

function delegatedChildInput(
  input: Parameters<AttemptMcpActionsPort['delegate']>[0],
  explicit: ReturnType<typeof explicitMutationGrant>,
  rootTaskId: string,
  parentInput: unknown,
): unknown {
  return explicit ? {
    explicitExecutionGrant: {
      ...explicit,
      parentTaskId: input.binding.taskId,
      rootTaskId,
      delegatingAttemptId: input.binding.attemptId,
    },
  } : parentInput;
}

function isInvocationPending(status: string): boolean { return ['authorized', 'approval_pending', 'ready', 'executing'].includes(status); }
function invocationProjection(invocation: { invocationId: string; status: string; result: unknown | null; error: unknown | null }) {
  const parsed = AgentResultEnvelopeSchema.safeParse(invocation.result);
  const result = parsed.success ? parsed.data : null;
  const error = invocation.error && typeof invocation.error === 'object' ? invocation.error as Record<string, unknown> : null;
  return {
    invocationId: invocation.invocationId, status: invocation.status, terminal: !isInvocationPending(invocation.status),
    result: result && {
      outcome: result.outcome,
      summary: result.summary,
      resourceRefs: result.resourceRefs,
      operationRefs: result.operationRefs,
      ...(result.needsInput ? { needsInput: result.needsInput } : {}),
      ...(result.output === undefined ? {} : { output: result.output }),
      ...(result.error ? { error: result.error } : {}),
    },
    error: error && { code: boundedText(error.code, 128), message: boundedText(error.message, 1_000) },
  };
}
function boundedText(value: unknown, maximum: number): string { return typeof value === 'string' ? value.slice(0, maximum) : ''; }

function encodedCatalogInputSchema(value: unknown): { encoding: 'json-schema-draft-07'; json: string } {
  const json = JSON.stringify(boundCatalogAnnotations(value));
  if (!json || Buffer.byteLength(json, 'utf8') > 16 * 1024) {
    throw new Error('attempt_mcp_catalog_schema_too_large');
  }
  return { encoding: 'json-schema-draft-07', json };
}

function boundCatalogAnnotations(value: unknown, annotationKey?: string): unknown {
  if (typeof value === 'string') {
    return annotationKey === 'description' || annotationKey === '$comment'
      ? value.slice(0, 1_000)
      : value;
  }
  if (Array.isArray(value)) {
    const items = annotationKey === 'examples' ? value.slice(0, 4) : value;
    return items.map((item) => annotationKey === 'examples'
      ? boundedExample(item)
      : boundCatalogAnnotations(item));
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => [key, boundCatalogAnnotations(item, key)]));
}

function boundedExample(value: unknown, depth = 0): unknown {
  if (depth >= 4) return null;
  if (typeof value === 'string') return value.slice(0, 1_000);
  if (Array.isArray(value)) return value.slice(0, 16).map((item) => boundedExample(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .slice(0, 32)
    .map(([key, item]) => [key.slice(0, 128), boundedExample(item, depth + 1)]));
}

function targetModel(context: { targetAgentKey: string; targetModel?: string | null }): string {
  const configured = context.targetModel?.trim() || process.env[`AGENT_${context.targetAgentKey.toUpperCase()}_MODEL`]?.trim();
  if (!configured) throw new Error(`missing_required_configuration:AGENT_${context.targetAgentKey.toUpperCase()}_MODEL`);
  return configured;
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
