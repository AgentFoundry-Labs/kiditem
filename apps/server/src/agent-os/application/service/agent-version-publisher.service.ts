import type {
  AgentRuntimeManifest,
  CompiledAgentRuntimeManifest,
} from '../../domain/agent-runtime-manifest';
import {
  type AgentVersionRepositoryPort,
  type PublishedAgentVersionRecord,
} from '../port/out/repository/agent-version.repository.port';

export interface PublishableAgentVersion extends CompiledAgentRuntimeManifest {
  displayName: string;
  description: string;
}

export class AgentVersionPublisher {
  constructor(
    private readonly repository: AgentVersionRepositoryPort,
  ) {}

  publishAndActivate(
    input: PublishableAgentVersion,
  ): Promise<PublishedAgentVersionRecord> {
    const manifest: AgentRuntimeManifest = input.manifest;
    return this.repository.publishAndActivate({
      agentDefinitionKey: manifest.agentDefinitionKey,
      displayName: input.displayName,
      description: input.description,
      runtimeType: manifest.runtimeType,
      modelIdentity: manifest.modelIdentity,
      capabilityKeys: [...manifest.capabilityKeys],
      policyDocument: structuredClone(manifest.policyDocument),
      manifestHash: input.manifestHash,
      runtimeManifest: structuredClone(manifest),
    });
  }
}
