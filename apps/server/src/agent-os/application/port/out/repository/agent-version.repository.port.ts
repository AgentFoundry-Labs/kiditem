import type { AgentRuntimeManifest } from '../../../../domain/agent-runtime-manifest';

export const AGENT_VERSION_REPOSITORY = Symbol('AGENT_VERSION_REPOSITORY');

export interface PublishAgentVersionInput {
  agentDefinitionKey: string;
  displayName: string;
  description: string;
  runtimeType: string;
  modelIdentity: string;
  capabilityKeys: string[];
  policyDocument: Record<string, unknown>;
  manifestHash: string;
  runtimeManifest: AgentRuntimeManifest;
}

export interface PublishedAgentVersionRecord extends PublishAgentVersionInput {
  id: string;
  version: number;
  activatedAt: Date | null;
  retiredAt: Date | null;
}

export interface AgentVersionRepositoryPort {
  publishAndActivate(
    input: PublishAgentVersionInput,
  ): Promise<PublishedAgentVersionRecord>;
  findActiveByDefinitionKey(
    agentDefinitionKey: string,
  ): Promise<Pick<PublishedAgentVersionRecord, 'manifestHash'> | null>;
}
