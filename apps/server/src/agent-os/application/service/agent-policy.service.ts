import { Inject, Injectable } from '@nestjs/common';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../port/out/agent-os-repository.port';
import {
  type AuthorizeToolUseInput,
  type AuthorizeToolUseResult,
  decidePolicy,
  type EffectiveToolPolicy,
  resolveToolPolicy,
} from '../../domain/policy.types';
import { findAgentDefinitionByType } from '../../domain/agent-definition.registry';

@Injectable()
export class AgentPolicyService {
  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
  ) {}

  async resolveEffectivePolicy(input: {
    organizationId: string;
    agentInstanceId: string;
    agentType: string;
    toolKey: string;
  }): Promise<EffectiveToolPolicy> {
    const definition = findAgentDefinitionByType(input.agentType);
    const definitionPolicy =
      definition?.defaultToolPolicies.find((policy) => policy.toolKey === input.toolKey) ??
      null;
    const instance = await this.repository.resolveInstanceToolPolicy({
      organizationId: input.organizationId,
      agentInstanceId: input.agentInstanceId,
      toolKey: input.toolKey,
    });

    const toolId = instance?.toolId ?? '';
    return resolveToolPolicy(definitionPolicy, instance, toolId, input.toolKey);
  }

  async authorizeToolUse(
    input: AuthorizeToolUseInput & { agentType: string },
  ): Promise<AuthorizeToolUseResult> {
    const policy = await this.resolveEffectivePolicy({
      organizationId: input.organizationId,
      agentInstanceId: input.agentInstanceId,
      agentType: input.agentType,
      toolKey: input.toolKey,
    });

    const decision = decidePolicy(policy);

    await this.repository.createAuthorizationEvent({
      organizationId: input.organizationId,
      agentInstanceId: input.agentInstanceId,
      requestId: input.requestId ?? null,
      runId: input.runId ?? null,
      toolKey: input.toolKey,
      toolId: policy.toolId || null,
      action: 'tool_use',
      decision: decision.decision,
      reasonCode: decision.reasonCode,
      reason: decision.reason,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      requestedByUserId: input.requestedByUserId ?? null,
      actorType: input.requestedByActorType ?? null,
      actorId: input.requestedByActorId ?? null,
      policySnapshot: {
        policy,
        context: input.context ?? {},
      },
    });

    return {
      decision: decision.decision,
      reasonCode: decision.reasonCode,
      reason: decision.reason,
      policy,
    };
  }

  async logAdminPolicyChange(input: {
    organizationId: string;
    agentInstanceId: string;
    actorUserId: string | null;
    toolKey: string;
    previousEffect: string | null;
    newEffect: string;
  }): Promise<void> {
    await this.repository.createAuthorizationEvent({
      organizationId: input.organizationId,
      agentInstanceId: input.agentInstanceId,
      requestId: null,
      runId: null,
      toolKey: input.toolKey,
      action: 'tool_policy_widening',
      decision: 'allowed',
      reasonCode: 'admin_policy_change',
      reason: `Tool ${input.toolKey} policy changed from ${input.previousEffect ?? 'none'} to ${input.newEffect}.`,
      resourceType: 'agent_instance_tool_policy',
      resourceId: input.agentInstanceId,
      requestedByUserId: input.actorUserId,
      actorType: 'admin',
      actorId: input.actorUserId,
      policySnapshot: {
        previousEffect: input.previousEffect,
        newEffect: input.newEffect,
      },
      decidedByUserId: input.actorUserId,
    });
  }
}
