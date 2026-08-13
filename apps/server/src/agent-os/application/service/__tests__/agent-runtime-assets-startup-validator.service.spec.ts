import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findAgentDefinitionByType,
  listAgentDefinitions,
} from '../../../domain/agent-definition.registry';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import { AgentRuntimeAssetsStartupValidator } from '../agent-runtime-assets-startup-validator.service';
import type {
  AgentRuntimeAssetsPort,
  ResolvedAgentRuntimeAssets,
} from '../../port/out/runtime/agent-runtime-assets.port';

vi.mock('../../../domain/agent-definition.registry', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../../domain/agent-definition.registry')
  >();
  return {
    ...actual,
    listAgentDefinitions: vi.fn(actual.listAgentDefinitions),
  };
});

const resolvedAssets: ResolvedAgentRuntimeAssets = {
  promptPath: 'agent-config/prompts/agents/sourcing.md',
  prompt: 'prompt',
  promptSha256: 'a'.repeat(64),
  skills: [],
  outputSchemaPath: 'agent-config/schemas/sourcing-agent-answer.schema.json',
  outputSchemaVersion: 'sourcing-agent-answer.v1',
  outputSchema: { $id: 'sourcing-agent-answer.v1' },
  outputSchemaSha256: 'b'.repeat(64),
};

describe('AgentRuntimeAssetsStartupValidator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates every configured definition and fails on the later missing asset', async () => {
    const sourcing = findAgentDefinitionByType('sourcing')!;
    vi.mocked(listAgentDefinitions).mockReturnValue([
      { ...sourcing, id: 'first', type: 'first' },
      {
        ...sourcing,
        id: 'second',
        type: 'second',
        promptPath: 'agent-config/prompts/agents/missing.md',
      },
    ]);
    const assets = {
      resolve: vi
        .fn<AgentRuntimeAssetsPort['resolve']>()
        .mockResolvedValueOnce(resolvedAssets)
        .mockRejectedValueOnce(
          new AgentOsRuntimeError(
            'runtime_asset_missing',
            'Missing sourcing prompt.',
          ),
        ),
    };
    const validator = new AgentRuntimeAssetsStartupValidator(assets);

    await expect(validator.onApplicationBootstrap()).rejects.toMatchObject({
      code: 'runtime_asset_missing',
    });
    expect(assets.resolve).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ agentType: 'first' }),
    );
    expect(assets.resolve).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        agentType: 'second',
        promptPath: 'agent-config/prompts/agents/missing.md',
      }),
    );
  });
});
