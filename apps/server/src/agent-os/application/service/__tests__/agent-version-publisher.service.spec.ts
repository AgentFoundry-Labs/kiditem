import { describe, expect, it, vi } from 'vitest';
import {
  compileAgentRuntimeManifest,
  type AgentRuntimeManifestSource,
} from '../../../domain/agent-runtime-manifest';
import {
  AgentVersionPublisher,
  type PublishableAgentVersion,
} from '../agent-version-publisher.service';
import type {
  AgentVersionRepositoryPort,
  PublishedAgentVersionRecord,
} from '../../port/out/repository/agent-version.repository.port';

const manifestSource: AgentRuntimeManifestSource = {
  schemaVersion: 1,
  agentDefinitionKey: 'manager',
  runtimeKind: 'coordinator',
  runtimeType: 'copilotkit_agui',
  modelIdentity: 'gpt-5.4',
  capabilityKeys: ['agent_os.platform_probe'],
  policyDocument: { sideEffects: ['read'] },
  delegation: {
    role: 'orchestrator',
    allowedAgentDefinitionKeys: ['sourcing'],
    maxDepth: 2,
    maxChildrenPerTask: 5,
  },
  limits: {
    maxTurns: 40,
    maxContextTokens: 32_000,
    summaryTargetTokens: 1_024,
  },
  assets: {
    prompt: {
      path: 'agent-config/prompts/agents/manager.md',
      sha256: 'a'.repeat(64),
    },
    summaryPrompt: {
      path: 'agent-config/prompts/system/summary.md',
      sha256: 'b'.repeat(64),
    },
    skills: [],
    outputSchema: null,
  },
};

const catalog = {
  agentDefinitionKeys: ['manager', 'sourcing'],
  runtimeTypes: ['copilotkit_agui'],
  capabilityKeys: ['agent_os.platform_probe'],
  skills: [],
};

function publishable(maxTurns = 40): PublishableAgentVersion {
  const source = {
    ...manifestSource,
    limits: { ...manifestSource.limits, maxTurns },
  };
  const compiled = compileAgentRuntimeManifest(source, catalog);
  return {
    displayName: 'Operator',
    description: 'KidItem coordinator',
    ...compiled,
  };
}

function inMemoryRepository(): AgentVersionRepositoryPort & {
  activeFor(key: string): PublishedAgentVersionRecord | null;
} {
  const records: PublishedAgentVersionRecord[] = [];
  const publish = vi.fn<AgentVersionRepositoryPort['publishAndActivate']>(
    async (input) => {
      const equal = records.find(
        (record) =>
          record.agentDefinitionKey === input.agentDefinitionKey &&
          record.manifestHash === input.manifestHash,
      );
      if (equal) return equal;
      for (const record of records) {
        if (record.agentDefinitionKey === input.agentDefinitionKey) {
          record.retiredAt = new Date('2026-08-14T00:00:00.000Z');
        }
      }
      const record: PublishedAgentVersionRecord = {
        id: `version-${records.length + 1}`,
        ...input,
        version:
          Math.max(
            0,
            ...records
              .filter(
                (candidate) =>
                  candidate.agentDefinitionKey === input.agentDefinitionKey,
              )
              .map((candidate) => candidate.version),
          ) + 1,
        activatedAt: new Date('2026-08-14T00:00:00.000Z'),
        retiredAt: null,
      };
      records.push(record);
      return record;
    },
  );
  return {
    publishAndActivate: publish,
    findActiveByDefinitionKey: async (key) =>
      records.find(
        (record) =>
          record.agentDefinitionKey === key && record.retiredAt === null,
      ) ?? null,
    activeFor: (key) =>
      records.find(
        (record) =>
          record.agentDefinitionKey === key && record.retiredAt === null,
      ) ?? null,
  };
}

describe('AgentVersionPublisher', () => {
  it('publishes equal manifests idempotently and versions a changed manifest', async () => {
    const repository = inMemoryRepository();
    const publisher = new AgentVersionPublisher(repository);

    const v1 = await publisher.publishAndActivate(publishable());
    expect((await publisher.publishAndActivate(publishable())).id).toBe(v1.id);
    const v2 = await publisher.publishAndActivate(publishable(41));

    expect(v2.version).toBe(v1.version + 1);
    expect(repository.activeFor('manager')).toEqual(v2);
  });

  it('never mutates a previously published immutable version', async () => {
    const repository = inMemoryRepository();
    const publisher = new AgentVersionPublisher(repository);
    const v1 = await publisher.publishAndActivate(publishable());

    await publisher.publishAndActivate(publishable(41));

    expect(v1.manifestHash).toBe(publishable().manifestHash);
    expect(v1.version).toBe(1);
    expect(v1.retiredAt).toBeInstanceOf(Date);
  });
});
