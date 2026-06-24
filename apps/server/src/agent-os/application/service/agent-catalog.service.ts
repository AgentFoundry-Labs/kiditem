import { Inject, Injectable } from '@nestjs/common';
import type { AgentInstanceToolPolicySummary } from '@kiditem/shared/agent-os';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
  type CreateAgentInstanceInput,
  type UpdateAgentInstanceInput,
  type UpsertInstanceToolPolicyInput,
} from '../port/out/repository/agent-os-repository.port';
import { AgentOsCatalogError } from '../../domain/agent-os.errors';
import { AgentPolicyService } from './agent-policy.service';
import {
  type AgentDefinitionRecord,
  type AgentSkillDefinitionRecord,
  type AgentInstanceRecord,
  resolveEffectiveModel,
} from '../../domain/agent-os.types';
import {
  findAgentDefinitionByType,
  listAgentDefinitions,
  resolveDefinitionDefaultModel,
  resolveDefinitionModelPlan,
} from '../../domain/agent-definition.registry';
import { listAgentSkills } from '../../domain/agent-skill.registry';

@Injectable()
export class AgentCatalogService {
  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    private readonly policy: AgentPolicyService,
  ) {}

  listDefinitions(): AgentDefinitionRecord[] {
    return listAgentDefinitions();
  }

  listSkills(): AgentSkillDefinitionRecord[] {
    return listAgentSkills();
  }

  async listInstances(input: { organizationId: string }): Promise<AgentInstanceRecord[]> {
    const instances = await this.repository.listInstances(input);
    const registeredTypes = new Set(
      listAgentDefinitions().map((definition) => definition.type),
    );

    return instances.filter((instance) => registeredTypes.has(instance.type));
  }

  async createInstance(input: {
    organizationId: string;
    type: string;
    name: string;
    role?: string;
    title?: string | null;
    icon?: string | null;
    reportsToId?: string | null;
    trustLevel?: number;
    modelOverride?: string | null;
    adapterConfig?: Record<string, unknown>;
    runtimeConfig?: Record<string, unknown>;
    promptPathOverride?: string | null;
  }): Promise<AgentInstanceRecord> {
    const definition = findAgentDefinitionByType(input.type);
    if (!definition) {
      throw new AgentOsCatalogError(
        'agent_definition_not_found',
        `No agent definition registered for type "${input.type}".`,
      );
    }

    const effectiveModel = resolveEffectiveModel({
      definitionDefault: resolveDefinitionDefaultModel(definition),
      instanceOverride: input.modelOverride ?? null,
    });
    if (!effectiveModel) {
      throw new AgentOsCatalogError(
        'instance_model_required',
        'Instance creation requires a resolvable model (override or definition default).',
      );
    }
    const modelPlan = resolveDefinitionModelPlan(definition, effectiveModel);
    if (!modelPlan.modelPlan) {
      throw new AgentOsCatalogError(
        'instance_model_required',
        modelPlan.missingEnv
          ? `Instance creation requires ${modelPlan.missingEnv} for ${modelPlan.missingRole} model.`
          : 'Instance creation requires a resolvable model plan.',
      );
    }

    const data: CreateAgentInstanceInput = {
      organizationId: input.organizationId,
      type: definition.type,
      name: input.name,
      role: input.role ?? 'specialist',
      title: input.title ?? null,
      icon: input.icon ?? null,
      reportsToId: input.reportsToId ?? null,
      lifecycleStatus: 'active',
      trustLevel: input.trustLevel ?? 0,
      adapterType: definition.defaultAdapterType,
      modelOverride: input.modelOverride ?? null,
      adapterConfig: input.adapterConfig ?? {},
      runtimeConfig: input.runtimeConfig ?? {},
      promptPathOverride: input.promptPathOverride ?? null,
    };

    return this.repository.createInstanceWithRuntimeState(data);
  }

  updateInstance(input: UpdateAgentInstanceInput): Promise<AgentInstanceRecord> {
    return this.repository.updateInstance(input);
  }

  async listInstanceToolPolicies(input: {
    organizationId: string;
    agentInstanceId: string;
  }): Promise<AgentInstanceToolPolicySummary[]> {
    const instance = await this.repository.findInstanceById({
      organizationId: input.organizationId,
      id: input.agentInstanceId,
    });
    if (!instance) {
      throw new AgentOsCatalogError(
        'agent_instance_not_found',
        `Agent instance ${input.agentInstanceId} not found.`,
      );
    }

    const definition = findAgentDefinitionByType(instance.type);
    const definitionPolicies = definition?.defaultToolPolicies ?? [];
    const overrides = await this.repository.listInstanceToolPolicies(input);
    const overridesByToolKey = new Map(
      overrides.map((policy) => [policy.toolKey, policy]),
    );
    const toolKeys = new Set([
      ...definitionPolicies.map((policy) => policy.toolKey),
      ...overrides.map((policy) => policy.toolKey),
    ]);

    return [...toolKeys]
      .sort()
      .map((toolKey) => {
        const override = overridesByToolKey.get(toolKey);
        if (override) {
          return {
            toolKey,
            effect: override.effect,
            source: 'instance',
            approvalMode: override.approvalMode,
            dryRunMode: override.dryRunMode,
            constraints: override.constraints,
          } satisfies AgentInstanceToolPolicySummary;
        }
        const definitionPolicy = definitionPolicies.find(
          (policy) => policy.toolKey === toolKey,
        );
        return {
          toolKey,
          effect: definitionPolicy?.effect ?? 'deny',
          source: definitionPolicy ? 'definition' : 'missing',
          approvalMode: definitionPolicy?.approvalMode ?? 'none',
          dryRunMode: definitionPolicy?.dryRunMode ?? 'optional',
          constraints: definitionPolicy?.constraints ?? {},
        } satisfies AgentInstanceToolPolicySummary;
      });
  }

  async upsertInstanceToolPolicy(
    input: UpsertInstanceToolPolicyInput & { actorUserId?: string | null },
  ): Promise<void> {
    const previous = await this.repository.resolveInstanceToolPolicy({
      organizationId: input.organizationId,
      agentInstanceId: input.agentInstanceId,
      toolKey: input.toolKey,
    });

    await this.repository.upsertInstanceToolPolicy(input);

    await this.policy.logAdminPolicyChange({
      organizationId: input.organizationId,
      agentInstanceId: input.agentInstanceId,
      toolKey: input.toolKey,
      previousEffect: previous?.effect ?? null,
      newEffect: input.effect,
      actorUserId: input.actorUserId ?? null,
    });
  }
}
