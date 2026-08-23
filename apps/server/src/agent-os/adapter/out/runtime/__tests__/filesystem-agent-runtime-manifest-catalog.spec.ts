import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CODE_OWNED_RUNTIME_TYPES,
  FilesystemAgentRuntimeManifestCatalog,
} from '../filesystem-agent-runtime-manifest-catalog';
import { listAgentDefinitions } from '../../../../domain/agent-definition.registry';

const repositoryRoot = resolve(__dirname, '../../../../../../../..');

describe('FilesystemAgentRuntimeManifestCatalog', () => {
  it('recognizes the explicit detached Hermes runtime without enabling ACP implicitly', () => {
    expect(CODE_OWNED_RUNTIME_TYPES).toContain('hermes_http');
    expect(CODE_OWNED_RUNTIME_TYPES).not.toContain('hermes_acp');
  });

  it('compiles every code-owned definition with exact Operator capability authority', async () => {
    const catalog = new FilesystemAgentRuntimeManifestCatalog(repositoryRoot, {
      AGENT_DEFAULT_MODEL: 'gpt-test',
    });

    const compiled = await catalog.compileAll();

    expect(compiled).toHaveLength(listAgentDefinitions().length);
    expect(compiled.find((entry) => entry.agentDefinitionKey === 'operator')?.manifest)
      .toMatchObject({
        runtimeType: 'copilotkit_agui',
        capabilityKeys: [
          'agent_os.platform_probe',
          'analytics.readOverview',
          'sourcing.retrieveWorkspaceEvidence',
          'sourcing.inspectRecommendationRun',
        ],
      });
    expect(compiled.every((entry) => /^[a-f0-9]{64}$/.test(entry.manifestHash)))
      .toBe(true);
  });

  it('binds every migrated Task 6 judgment surface to a composed official runtime', async () => {
    const catalog = new FilesystemAgentRuntimeManifestCatalog(repositoryRoot, {
      AGENT_DEFAULT_MODEL: 'gpt-test',
    });

    const compiled = await catalog.compileAll();
    const runtimeByDefinition = new Map(
      compiled.map((entry) => [entry.agentDefinitionKey, entry.manifest.runtimeType]),
    );

    expect(runtimeByDefinition.get('ad_strategy')).toBe('claude_cli');
    expect(runtimeByDefinition.get('rules_suggest')).toBe('claude_cli');
    expect(runtimeByDefinition.get('sourcing')).toBe('codex_cli');
  });

  it('keeps migrated root prompts byte-identical to the legacy copies until cutover', async () => {
    for (const definition of listAgentDefinitions()) {
      if (definition.type === 'sourcing') continue;
      const [canonical, legacy] = await Promise.all([
        readFile(resolve(repositoryRoot, definition.promptPath), 'utf8'),
        readFile(
          resolve(repositoryRoot, 'apps/server', definition.promptPath),
          'utf8',
        ),
      ]);
      expect(canonical.trimEnd(), definition.type).toBe(legacy.trimEnd());
    }
  });

  it('fails closed when explicit model configuration is missing', async () => {
    const catalog = new FilesystemAgentRuntimeManifestCatalog(repositoryRoot, {});
    await expect(catalog.compileAll()).rejects.toThrow('Missing Agent model');
  });
});
