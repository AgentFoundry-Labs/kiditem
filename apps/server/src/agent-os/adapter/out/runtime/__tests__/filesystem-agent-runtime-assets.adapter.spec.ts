import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findAgentDefinitionByType } from '../../../../domain/agent-definition.registry';
import {
  FilesystemAgentRuntimeAssetsAdapter,
  resolveAgentRuntimeAssetsFromFilesystem,
} from '../filesystem-agent-runtime-assets.adapter';

describe('FilesystemAgentRuntimeAssetsAdapter', () => {
  const adapter = new FilesystemAgentRuntimeAssetsAdapter();

  it('loads and hashes every configured Sourcing runtime asset', async () => {
    const definition = findAgentDefinitionByType('sourcing')!;
    const assets = await adapter.resolve({
      agentType: definition.type,
      promptPath: definition.promptPath,
      skillKeys: definition.defaultSkillKeys,
      outputSchemaPath: definition.outputSchemaPath!,
    });

    expect(assets.outputSchemaVersion).toBe('sourcing-agent-answer.v1');
    expect(assets.prompt).toContain('KidItem Sourcing Agent');
    expect(assets.skills.map((skill) => skill.key)).toEqual(
      definition.defaultSkillKeys,
    );
    expect(assets.promptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(assets.outputSchemaSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fails when a configured asset escapes the repository or is missing', async () => {
    await expect(
      adapter.resolve({
        agentType: 'sourcing',
        promptPath: '../../etc/passwd',
        skillKeys: [],
        outputSchemaPath:
          'agent-config/schemas/sourcing-agent-answer.schema.json',
      }),
    ).rejects.toMatchObject({ code: 'runtime_asset_path_invalid' });

    await expect(
      adapter.resolve({
        agentType: 'sourcing',
        promptPath: 'agent-config/prompts/agents/missing.md',
        skillKeys: [],
        outputSchemaPath:
          'agent-config/schemas/sourcing-agent-answer.schema.json',
      }),
    ).rejects.toMatchObject({ code: 'runtime_asset_missing' });
  });

  it('rejects skills that are unknown, development-only, or not allowed', async () => {
    const definition = findAgentDefinitionByType('sourcing')!;
    const baseInput = {
      agentType: definition.type,
      promptPath: definition.promptPath,
      outputSchemaPath: definition.outputSchemaPath!,
    };

    await expect(
      adapter.resolve({ ...baseInput, skillKeys: ['sourcing.unknown'] }),
    ).rejects.toMatchObject({ code: 'runtime_asset_skill_unknown' });
    await expect(
      adapter.resolve({ ...baseInput, skillKeys: ['sourcing.magic_scraper'] }),
    ).rejects.toMatchObject({ code: 'runtime_asset_skill_mode_invalid' });
    await expect(
      adapter.resolve({
        ...baseInput,
        agentType: 'order',
        skillKeys: ['sourcing.evidence-grounded-analysis'],
      }),
    ).rejects.toMatchObject({ code: 'runtime_asset_skill_not_allowed' });
  });

  it('rejects malformed and unsupported output schemas with stable codes', async () => {
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), 'kiditem-runtime-assets-'),
    );
    const promptPath = 'agent-config/prompts/agents/sourcing.md';
    const outputSchemaPath =
      'agent-config/schemas/sourcing-agent-answer.schema.json';
    await mkdir(join(repositoryRoot, 'agent-config/prompts/agents'), {
      recursive: true,
    });
    await mkdir(join(repositoryRoot, 'agent-config/schemas'), { recursive: true });
    await writeFile(join(repositoryRoot, promptPath), 'prompt', 'utf8');

    try {
      await writeFile(join(repositoryRoot, outputSchemaPath), '{', 'utf8');
      await expect(
        resolveAgentRuntimeAssetsFromFilesystem({
          repositoryRoot,
          agentType: 'sourcing',
          promptPath,
          skillKeys: [],
          outputSchemaPath,
        }),
      ).rejects.toMatchObject({ code: 'runtime_asset_schema_invalid' });

      await writeFile(
        join(repositoryRoot, outputSchemaPath),
        JSON.stringify({ $id: 'sourcing-agent-answer.v2' }),
        'utf8',
      );
      await expect(
        resolveAgentRuntimeAssetsFromFilesystem({
          repositoryRoot,
          agentType: 'sourcing',
          promptPath,
          skillKeys: [],
          outputSchemaPath,
        }),
      ).rejects.toMatchObject({
        code: 'runtime_asset_schema_version_invalid',
      });
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });

  it('rejects symlinks that resolve outside the repository', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'kiditem-runtime-link-'));
    const repositoryRoot = join(fixtureRoot, 'repository');
    const promptPath = 'agent-config/prompts/agents/sourcing.md';
    const outputSchemaPath =
      'agent-config/schemas/sourcing-agent-answer.schema.json';
    await mkdir(join(repositoryRoot, 'agent-config/prompts/agents'), {
      recursive: true,
    });
    await mkdir(join(repositoryRoot, 'agent-config/schemas'), { recursive: true });
    await writeFile(join(fixtureRoot, 'outside.md'), 'outside', 'utf8');
    await symlink(
      join(fixtureRoot, 'outside.md'),
      join(repositoryRoot, promptPath),
    );
    await writeFile(
      join(repositoryRoot, outputSchemaPath),
      JSON.stringify({ $id: 'sourcing-agent-answer.v1' }),
      'utf8',
    );

    try {
      await expect(
        resolveAgentRuntimeAssetsFromFilesystem({
          repositoryRoot,
          agentType: 'sourcing',
          promptPath,
          skillKeys: [],
          outputSchemaPath,
        }),
      ).rejects.toMatchObject({ code: 'runtime_asset_path_invalid' });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
