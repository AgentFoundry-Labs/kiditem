import { afterEach, describe, expect, it } from 'vitest';
import { lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { AttemptWorkspaceService } from './attempt-workspace.service';

const roots: string[] = [];
const attemptId = '33333333-3333-4333-8333-333333333333';
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('AttemptWorkspaceService', () => {
  it('creates an empty private attempt workspace with direct HTTP MCP config and removes only it', async () => {
    const attemptRoot = await tmp('kiditem-runner-attempts-');
    const loginRoot = await tmp('kiditem-runner-login-');
    await mkdir(join(loginRoot, '.codex')); await writeFile(join(loginRoot, '.codex', 'auth.json'), 'credential-bytes-must-survive');
    const service = new AttemptWorkspaceService({
      attemptRoot,
      attemptRootGuard: fixtureAttemptRootGuard(attemptRoot),
      loginRoot,
      platform: 'macos',
    });
    const paths = await service.create(launch());

    const config = await readFile(paths.mcpConfigPath, 'utf8');
    const codexConfig = await readFile(paths.codexConfigPath, 'utf8');
    expect(config).toContain('http://127.0.0.1:4000/internal/agent-runtime/attempts/');
    expect(config).toContain('KIDITEM_ATTEMPT_MCP_TOKEN');
    expect(config).not.toContain('A'.repeat(43));
    expect(codexConfig).toContain('history.persistence = "none"');
    expect(codexConfig).toContain('web_search = "disabled"');
    expect(codexConfig).toContain('approval_policy = "never"');
    expect(codexConfig).toContain('default_permissions = ":workspace"');
    expect(codexConfig).toContain('exclude = ["KIDITEM_ATTEMPT_MCP_TOKEN"]');
    expect(codexConfig).toContain('required = true');
    expect(codexConfig).toContain('startup_timeout_sec = 5');
    expect(codexConfig).not.toContain('thread/start.ephemeral');
    expect(codexConfig).not.toContain('plugins.enabled');
    await service.linkProviderAuth(paths, 'codex_cli');
    expect((await lstat(join(paths.codexHome, 'auth.json'))).isSymbolicLink()).toBe(true);

    await service.remove(paths);
    await expect(stat(paths.root)).rejects.toThrow();
    expect(await readFile(join(loginRoot, '.codex', 'auth.json'), 'utf8')).toBe('credential-bytes-must-survive');
  });

  it('rejects a symlinked attempt root and never follows it during cleanup', async () => {
    const parent = await tmp('kiditem-runner-parent-');
    const outside = await tmp('kiditem-runner-outside-');
    const root = join(parent, 'attempts');
    await (await import('node:fs/promises')).symlink(outside, root);
    const service = new AttemptWorkspaceService({
      attemptRoot: root,
      attemptRootGuard: fixtureAttemptRootGuard(root),
      loginRoot: await tmp('kiditem-runner-login-'),
      platform: 'macos',
    });
    await expect(service.create(launch())).rejects.toThrow('runner_attempt_root_symlink_rejected');
  });

  it('does not create a workspace after its protected attempt-root guard detects replacement', async () => {
    const parent = await tmp('kiditem-runner-parent-');
    const attemptRoot = join(parent, 'attempts');
    const outside = await tmp('kiditem-runner-outside-');
    await mkdir(attemptRoot, { mode: 0o700 });
    let revalidated = false;
    const service = new AttemptWorkspaceService({
      attemptRoot,
      loginRoot: await tmp('kiditem-runner-login-'),
      platform: 'macos',
      attemptRootGuard: {
        canonicalPath: attemptRoot,
        revalidate: async () => {
          revalidated = true;
          await rm(attemptRoot, { recursive: true });
          await symlink(outside, attemptRoot);
          throw new Error('runner_protected_path_changed');
        },
      },
    } as unknown as ConstructorParameters<typeof AttemptWorkspaceService>[0]);

    await expect(service.create(launch())).rejects.toThrow('runner_protected_path_changed');
    expect(revalidated).toBe(true);
  });
});

async function tmp(prefix: string): Promise<string> { const value = await mkdtemp(join(tmpdir(), prefix)); roots.push(value); return value; }
function launch() {
  return {
    attemptId, runtime: 'codex_cli' as const, model: 'gpt-5.6', prompt: 'not on disk', timeoutMs: 10_000,
    workspacePolicy: 'empty_ephemeral_v1' as const,
    mcpUrl: `http://127.0.0.1:4000/internal/agent-runtime/attempts/${attemptId}/mcp`, attemptToken: 'A'.repeat(43),
    mcpToolScope: 'business' as const, mcpProtocolRevision: '2026-07-28' as const, cliContractIdentity: 'office-cli-contract-v2' as const,
  };
}

function fixtureAttemptRootGuard(attemptRoot: string) {
  const canonicalPath = resolve(attemptRoot);
  return {
    canonicalPath,
    revalidate: async () => {
      const info = await lstat(canonicalPath).catch(() => null);
      if (!info) throw new Error('runner_attempt_root_missing');
      if (info.isSymbolicLink()) throw new Error('runner_attempt_root_symlink_rejected');
      if (!info.isDirectory()) throw new Error('runner_attempt_root_missing');
      return canonicalPath;
    },
  };
}
