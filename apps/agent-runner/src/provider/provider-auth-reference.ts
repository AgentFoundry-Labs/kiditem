import { link, lstat, mkdir, realpath, symlink } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import type { AgentCliRuntime, RunnerPlatform } from '@kiditem/shared/agent-runtime';

export type ProviderAuthReference = Readonly<{ runtime: AgentCliRuntime; source: string; targetName: string }>;

/** Validates and materializes only the selected provider login artifact; never reads credential bytes. */
export class ProviderAuthReferenceService {
  constructor(private readonly options: Readonly<{ loginRoot: string; platform: RunnerPlatform }>) {}

  async resolve(runtime: AgentCliRuntime): Promise<ProviderAuthReference> {
    const loginRoot = await checkedDirectory(this.options.loginRoot);
    const relativeArtifact = runtime === 'codex_cli' ? join('.codex', 'auth.json') : join('.claude', '.credentials.json');
    const source = join(loginRoot, relativeArtifact);
    const info = await lstat(source).catch(() => null);
    if (!info?.isFile() || info.isSymbolicLink()) throw new Error('provider_auth_reference_invalid');
    const realSource = await realpath(source).catch(() => null);
    if (!realSource || !contained(loginRoot, realSource)) throw new Error('provider_auth_reference_invalid');
    return Object.freeze({ runtime, source: realSource, targetName: runtime === 'codex_cli' ? 'auth.json' : '.credentials.json' });
  }

  async materialize(reference: ProviderAuthReference, target: string): Promise<void> {
    const targetPath = resolve(target);
    const targetInfo = await lstat(targetPath).catch(() => null);
    if (targetInfo) throw new Error('provider_auth_target_exists');
    await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });
    if (this.options.platform === 'macos') {
      await symlink(reference.source, targetPath);
      return;
    }
    if (this.options.platform === 'windows') {
      await link(reference.source, targetPath);
      return;
    }
    throw new Error('runner_platform_unsupported');
  }
}

async function checkedDirectory(value: string): Promise<string> {
  const source = resolve(value);
  const info = await lstat(source).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error('provider_auth_reference_invalid');
  return realpath(source);
}

function contained(root: string, target: string): boolean {
  const value = relative(root, target);
  return !!value && !value.startsWith('..') && !value.includes('/..') && !value.includes('\\..');
}
