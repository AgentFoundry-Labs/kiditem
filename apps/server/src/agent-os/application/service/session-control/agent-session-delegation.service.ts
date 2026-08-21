import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  AGENT_SESSION_CONTROL_REPOSITORY,
  type AgentSessionControlRepositoryPort,
} from '../../port/out/repository/agent-session-control.repository.port';
import { AgentRuntimeManifestSchema } from '../../../domain/agent-runtime-manifest';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import { AgentSessionTaskDispatchService } from './agent-session-task-dispatch.service';

const capabilityKeysSchema = z
  .array(z.string().min(1).max(128))
  .refine((keys) => new Set(keys).size === keys.length);

@Injectable()
export class AgentSessionDelegationService {
  constructor(
    @Inject(AGENT_SESSION_CONTROL_REPOSITORY)
    private readonly repository: AgentSessionControlRepositoryPort,
    private readonly dispatch: AgentSessionTaskDispatchService,
  ) {}

  async delegate(input: {
    organizationId: string;
    sessionId: string;
    parentTaskId: string;
    parentExecutionId: string;
    targetAgentDefinitionKey: string;
    objective: string;
    authoritySubset: string[];
    idempotencyKey: string;
    requestedByUserId?: string | null;
  }): Promise<{
    delegationId: string;
    childTaskId: string;
    childExecutionId: string;
    operationsRunId: string;
  }> {
    const objective = input.objective.replace(/\s+/g, ' ').trim();
    if (!objective || objective.length > 2_000) throw denied();
    const requestedAuthority = capabilityKeysSchema.parse(input.authoritySubset);
    const context = await this.repository.loadDelegationContext(input);
    if (!context) throw denied();
    const manifest = AgentRuntimeManifestSchema.parse(context.parentManifest);
    const policy = new Set(capabilityKeysSchema.parse(context.parentPolicyCapabilityKeys));
    const targetCapabilities = new Set(capabilityKeysSchema.parse(context.targetCapabilityKeys));
    const depth = context.parentDepth + 1;
    if (
      context.sessionLifecycle !== 'active' ||
      ['completed', 'failed', 'cancelled', 'archived'].includes(context.taskStatus) ||
      context.parentExecutionId !== input.parentExecutionId ||
      context.parentAgentVersionId.length === 0 ||
      manifest.delegation.role !== 'orchestrator' ||
      !manifest.delegation.allowedAgentDefinitionKeys.includes(input.targetAgentDefinitionKey) ||
      context.targetDefinitionKey !== input.targetAgentDefinitionKey ||
      !context.activeTarget ||
      depth > manifest.delegation.maxDepth ||
      context.childCount >= manifest.delegation.maxChildrenPerTask ||
      requestedAuthority.some((key) => !policy.has(key) || !targetCapabilities.has(key))
    ) throw denied();

    const delegated = await this.repository.createDelegatedTask({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      parentTaskId: input.parentTaskId,
      parentExecutionId: input.parentExecutionId,
      fromAgentVersionId: context.parentAgentVersionId,
      toAgentVersionId: context.targetAgentVersionId,
      targetAgentDefinitionKey: input.targetAgentDefinitionKey,
      objective,
      authoritySubset: [...requestedAuthority].sort(),
      depth,
      maxDepth: manifest.delegation.maxDepth,
      maxChildrenPerTask: manifest.delegation.maxChildrenPerTask,
      idempotencyKey: input.idempotencyKey,
    });
    const operation = await this.dispatch.dispatch({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      taskId: delegated.childTaskId,
      executionId: delegated.childExecutionId,
      requestedByUserId: input.requestedByUserId ?? null,
    });
    return {
      ...delegated,
      operationsRunId: operation.operationsRunId,
    };
  }
}

function denied(): AgentOsRuntimeError {
  return new AgentOsRuntimeError(
    'AGENT_DELEGATION_NOT_ALLOWED',
    'Delegation is outside the immutable Agent version and execution policy.',
  );
}
