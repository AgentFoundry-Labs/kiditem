import { Inject, Injectable } from '@nestjs/common';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
  type CreateAgentInstanceInput,
  type CreateBlueprintInput,
  type UpdateAgentInstanceInput,
  type UpsertInstanceToolPolicyInput,
} from '../port/out/agent-os-repository.port';
import { AgentOsCatalogError } from '../../domain/agent-os.errors';
import { AgentPolicyService } from './agent-policy.service';
import {
  type AgentBlueprintRecord,
  type AgentInstanceRecord,
  resolveEffectiveModel,
} from '../../domain/agent-os.types';

@Injectable()
export class AgentCatalogService {
  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    private readonly policy: AgentPolicyService,
  ) {}

  listBlueprints(): Promise<AgentBlueprintRecord[]> {
    return this.repository.listBlueprints();
  }

  upsertBlueprint(input: CreateBlueprintInput): Promise<AgentBlueprintRecord> {
    if (!input.defaultModel || input.defaultModel.length === 0) {
      throw new AgentOsCatalogError(
        'blueprint_default_model_required',
        'AgentBlueprint.defaultModel is required.',
      );
    }
    return this.repository.upsertBlueprint(input);
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
    const blueprint = await this.repository.findBlueprintByType(input.type);
    if (!blueprint) {
      throw new AgentOsCatalogError(
        'blueprint_not_found',
        `No blueprint registered for type "${input.type}".`,
      );
    }

    const effectiveModel = resolveEffectiveModel({
      blueprintDefault: blueprint.defaultModel,
      instanceOverride: input.modelOverride ?? null,
    });
    if (!effectiveModel) {
      throw new AgentOsCatalogError(
        'instance_model_required',
        'Instance creation requires a resolvable model (override or blueprint default).',
      );
    }

    const data: CreateAgentInstanceInput = {
      organizationId: input.organizationId,
      blueprintId: blueprint.id,
      type: blueprint.type,
      name: input.name,
      role: input.role ?? 'specialist',
      title: input.title ?? null,
      icon: input.icon ?? null,
      reportsToId: input.reportsToId ?? null,
      lifecycleStatus: 'active',
      trustLevel: input.trustLevel ?? 0,
      adapterType: blueprint.defaultAdapterType,
      modelOverride: input.modelOverride ?? null,
      adapterConfig: input.adapterConfig ?? {},
      runtimeConfig: input.runtimeConfig ?? blueprint.defaultRuntimeConfig,
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
