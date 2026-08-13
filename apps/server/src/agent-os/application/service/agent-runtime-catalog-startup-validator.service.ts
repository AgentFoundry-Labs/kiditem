import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import {
  AGENT_VERSION_REPOSITORY,
  type AgentVersionRepositoryPort,
} from '../port/out/repository/agent-version.repository.port';

export const AGENT_RUNTIME_MANIFEST_CATALOG = Symbol(
  'AGENT_RUNTIME_MANIFEST_CATALOG',
);

export interface CompiledAgentRuntimeCatalogEntry {
  agentDefinitionKey: string;
  manifestHash: string;
}

export interface AgentRuntimeManifestCatalog {
  compileAll(): Promise<CompiledAgentRuntimeCatalogEntry[]>;
}

@Injectable()
export class AgentRuntimeCatalogStartupValidator
  implements OnApplicationBootstrap
{
  constructor(
    @Inject(AGENT_VERSION_REPOSITORY)
    private readonly repository: AgentVersionRepositoryPort,
    @Inject(AGENT_RUNTIME_MANIFEST_CATALOG)
    private readonly catalog: AgentRuntimeManifestCatalog,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const entries = await this.catalog.compileAll();
    const keys = entries.map((entry) => entry.agentDefinitionKey);
    if (new Set(keys).size !== keys.length) {
      throw new Error('AGENT_RUNTIME_DEFINITION_DUPLICATE');
    }
    const hashes = entries.map((entry) => entry.manifestHash);
    if (new Set(hashes).size !== hashes.length) {
      throw new Error('AGENT_RUNTIME_MANIFEST_HASH_COLLISION');
    }

    for (const entry of entries) {
      const active = await this.repository.findActiveByDefinitionKey(
        entry.agentDefinitionKey,
      );
      if (!active) {
        throw new Error(
          `AGENT_RUNTIME_MANIFEST_NOT_PUBLISHED:${entry.agentDefinitionKey}`,
        );
      }
      if (active.manifestHash !== entry.manifestHash) {
        throw new Error(
          `AGENT_RUNTIME_MANIFEST_DRIFT:${entry.agentDefinitionKey}`,
        );
      }
    }
  }
}
