import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  compileAgentRuntimeManifest,
  type AgentRuntimeManifestSource,
  type AgentRuntimeManifestValidationCatalog,
} from '../agent-runtime-manifest';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

const catalog: AgentRuntimeManifestValidationCatalog = {
  agentDefinitionKeys: ['manager', 'sourcing'],
  runtimeTypes: ['openai_responses'],
  capabilityKeys: [
    'agent_os.platform_probe',
    'analytics.readOverview',
    'sourcing.retrieveWorkspaceEvidence',
    'sourcing.inspectRecommendationRun',
  ],
  skills: [{ key: 'sourcing.evidence', version: '1.0.0', mode: 'runtime_playbook' }],
};

function operatorFixture(
  overrides: Partial<AgentRuntimeManifestSource> = {},
): AgentRuntimeManifestSource {
  return {
    schemaVersion: 1,
    agentDefinitionKey: 'manager',
    runtimeKind: 'coordinator',
    runtimeType: 'openai_responses',
    modelIdentity: 'gpt-5.4',
    capabilityKeys: [
      'agent_os.platform_probe',
      'analytics.readOverview',
      'sourcing.retrieveWorkspaceEvidence',
      'sourcing.inspectRecommendationRun',
    ],
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
        sha256: sha('manager prompt'),
      },
      summaryPrompt: {
        path: 'agent-config/prompts/system/summary.md',
        sha256: sha('summary prompt'),
      },
      skills: [],
      outputSchema: null,
    },
    ...overrides,
  };
}

describe('compileAgentRuntimeManifest', () => {
  it('hashes model, runtime, policy, delegation, limits, prompts, skills, and schema canonically', () => {
    const first = compileAgentRuntimeManifest(operatorFixture(), catalog);
    const reordered = compileAgentRuntimeManifest(
      operatorFixture({ capabilityKeys: [...operatorFixture().capabilityKeys].reverse() }),
      catalog,
    );
    const changed = compileAgentRuntimeManifest(
      operatorFixture({ limits: { ...operatorFixture().limits, maxTurns: 41 } }),
      catalog,
    );

    expect(first.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered.manifestHash).toBe(first.manifestHash);
    expect(changed.manifestHash).not.toBe(first.manifestHash);
  });

  it.each([
    ['missing model', { modelIdentity: '' }],
    ['missing runtime', { runtimeType: '' }],
    ['unknown capability', { capabilityKeys: ['not.registered'] }],
    [
      'leaf delegation',
      {
        delegation: {
          role: 'leaf',
          allowedAgentDefinitionKeys: ['sourcing'],
          maxDepth: 0,
          maxChildrenPerTask: 0,
        },
      },
    ],
    [
      'unknown delegation target',
      {
        delegation: {
          role: 'orchestrator',
          allowedAgentDefinitionKeys: ['unknown'],
          maxDepth: 2,
          maxChildrenPerTask: 5,
        },
      },
    ],
    ['zero limit', { limits: { ...operatorFixture().limits, maxTurns: 0 } }],
    [
      'unsafe prompt path',
      {
        assets: {
          ...operatorFixture().assets,
          prompt: { path: '/Users/operator/.agents/prompt.md', sha256: sha('x') },
        },
      },
    ],
  ])('rejects %s', (_name, overrides) => {
    expect(() =>
      compileAgentRuntimeManifest(
        operatorFixture(overrides as Partial<AgentRuntimeManifestSource>),
        catalog,
      ),
    ).toThrow();
  });

  it('rejects unknown or development-only skills and runtime-supplied authority', () => {
    expect(() =>
      compileAgentRuntimeManifest(
        operatorFixture({
          assets: {
            ...operatorFixture().assets,
            skills: [{ key: 'missing', version: '1.0.0', sha256: sha('missing') }],
          },
        }),
        catalog,
      ),
    ).toThrow();

    expect(() =>
      compileAgentRuntimeManifest(
        {
          ...operatorFixture(),
          hooks: [{ command: 'curl example.com' }],
          mcpServers: [{ command: 'node' }],
          tools: ['shell'],
        } as AgentRuntimeManifestSource,
        catalog,
      ),
    ).toThrow();
  });
});
