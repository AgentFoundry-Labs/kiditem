import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { AgentRuntimeManifestSchema } from '../../../domain/agent-runtime-manifest';
import { findAgentSkillByKey } from '../../../domain/agent-skill.registry';
import type {
  AgentDurableRuntimeAssetsPort,
  ResolvedAgentDurableRuntimeAssets,
} from '../../../application/port/out/runtime/agent-durable-runtime.port';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';

@Injectable()
export class FilesystemAgentDurableRuntimeAssetsAdapter
  implements AgentDurableRuntimeAssetsPort
{
  constructor(
    private readonly repositoryRoot = resolve(__dirname, '../../../../../../..'),
  ) {}

  async resolve(input: {
    agentDefinitionKey: string;
    manifest: unknown;
  }): Promise<ResolvedAgentDurableRuntimeAssets> {
    const manifest = AgentRuntimeManifestSchema.parse(input.manifest);
    if (manifest.agentDefinitionKey !== input.agentDefinitionKey) {
      throw mismatch();
    }
    const root = await realpath(this.repositoryRoot);
    const prompt = await readHashed(root, manifest.assets.prompt);
    const summaryPrompt = await readHashed(root, manifest.assets.summaryPrompt);
    const skills = await Promise.all(manifest.assets.skills.map(async (expected) => {
      const registered = findAgentSkillByKey(expected.key);
      if (!registered || registered.version !== expected.version || registered.mode !== 'runtime_playbook') {
        throw mismatch();
      }
      const content = await readCodeOwned(root, registered.skillPath);
      if (sha256(content) !== expected.sha256) throw mismatch();
      return { ...expected, content };
    }));
    const outputSchema = manifest.assets.outputSchema
      ? await readOutputSchema(root, manifest.assets.outputSchema)
      : null;
    return {
      prompt,
      promptSha256: manifest.assets.prompt.sha256,
      summaryPrompt,
      summaryPromptSha256: manifest.assets.summaryPrompt.sha256,
      skills,
      outputSchema,
    };
  }
}

async function readHashed(
  root: string,
  expected: { path: string; sha256: string },
): Promise<string> {
  const content = await readCodeOwned(root, expected.path);
  if (sha256(content) !== expected.sha256) throw mismatch();
  return content;
}

async function readOutputSchema(
  root: string,
  expected: { path: string; version: string; sha256: string },
): Promise<NonNullable<ResolvedAgentDurableRuntimeAssets['outputSchema']>> {
  const content = await readHashed(root, expected);
  let document: unknown;
  try { document = JSON.parse(content); } catch { throw mismatch(); }
  if (
    typeof document !== 'object' || document === null || Array.isArray(document) ||
    (document as Record<string, unknown>).$id !== expected.version
  ) throw mismatch();
  return { ...expected, document: document as Record<string, unknown> };
}

async function readCodeOwned(root: string, path: string): Promise<string> {
  if (isAbsolute(path) || path.startsWith('~') || path.includes('\\') || !path.startsWith('agent-config/')) {
    throw mismatch();
  }
  const candidate = resolve(root, path);
  const fromRoot = relative(root, candidate);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw mismatch();
  const absolute = await realpath(candidate).catch(() => { throw mismatch(); });
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) throw mismatch();
  return readFile(absolute, 'utf8').catch(() => { throw mismatch(); });
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function mismatch(): AgentOsRuntimeError {
  return new AgentOsRuntimeError(
    'AGENT_RUNTIME_ASSET_HASH_MISMATCH',
    'Runtime assets do not match the immutable Agent version.',
  );
}
