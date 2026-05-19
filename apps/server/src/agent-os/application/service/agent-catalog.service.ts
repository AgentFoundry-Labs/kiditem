import { Inject, Injectable } from '@nestjs/common';
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
  type AgentInstanceRecord,
  resolveEffectiveModel,
} from '../../domain/agent-os.types';
import {
  findAgentDefinitionByType,
  listAgentDefinitions,
  resolveDefinitionDefaultModel,
} from '../../domain/agent-definition.registry';

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

  listInstances(input: { organizationId: string }): Promise<AgentInstanceRecord[]> {
    return this.repository.listInstances(input);
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
