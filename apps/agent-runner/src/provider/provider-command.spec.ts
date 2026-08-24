import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildProviderCommand } from './provider-command';

describe('buildProviderCommand', () => {
  it('selects the provider only from the typed runtime and rejects a mismatched workspace policy/train', () => {
    const command = buildProviderCommand({ attemptId: '33333333-3333-4333-8333-333333333333', runtime: 'codex_cli', model: 'gpt-5.6', prompt: 'not argv', timeoutMs: 10_000, workspacePolicy: 'empty_ephemeral_v1', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/attempts/33333333-3333-4333-8333-333333333333/mcp', attemptToken: 'A'.repeat(43), mcpToolScope: 'business', mcpProtocolRevision: '2026-07-28', cliContractIdentity: 'office-cli-contract-v2' }, paths, '/opt/kiditem-runner');
    expect(command.executable).toBe(resolve(process.execPath));
    expect(command.args[0]).toContain('/opt/kiditem-runner/');
    expect(command.cwd).toBe(paths.workspace);
  });

  it('never exposes a bundled JavaScript Codex entrypoint as lpApplicationName', async () => {
    const root = await bundledRuntime('node_modules/@openai/codex/bin/codex.js');
    try {
      const script = join(root, 'node_modules/@openai/codex/bin/codex.js');
      const command = buildProviderCommand(codexLaunch(), paths, root);

      expect(command.executable).toBe(resolve(process.execPath));
      expect(command.args.slice(0, 2)).toEqual([await realpath(script), 'app-server']);
      expect(command.executable.endsWith('.js')).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses the same fixed Node wrapper for a JavaScript Claude fallback but keeps a native executable direct', async () => {
    const jsRoot = await bundledRuntime('node_modules/@anthropic-ai/claude-code/cli.js');
    const nativeRoot = await bundledRuntime('node_modules/@anthropic-ai/claude-code/bin/claude.exe');
    try {
      const jsScript = join(jsRoot, 'node_modules/@anthropic-ai/claude-code/cli.js');
      const jsCommand = buildProviderCommand(claudeLaunch(), paths, jsRoot);
      expect(jsCommand.executable).toBe(resolve(process.execPath));
      expect(jsCommand.args[0]).toBe(await realpath(jsScript));

      const nativeExecutable = join(nativeRoot, 'node_modules/@anthropic-ai/claude-code/bin/claude.exe');
      const nativeCommand = buildProviderCommand(claudeLaunch(), paths, nativeRoot);
      expect(nativeCommand.executable).toBe(await realpath(nativeExecutable));
      expect(nativeCommand.args[0]).toBe('--print');
    } finally {
      await Promise.all([rm(jsRoot, { recursive: true, force: true }), rm(nativeRoot, { recursive: true, force: true })]);
    }
  });
});
const paths = { root: '/tmp/a', workspace: '/tmp/a/workspace', home: '/tmp/a/home', codexHome: '/tmp/a/codex', claudeConfigDir: '/tmp/a/claude', mcpConfigPath: '/tmp/a/mcp.json', codexConfigPath: '/tmp/a/codex.toml' };

async function bundledRuntime(entrypoint: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kiditem-provider-command-'));
  const path = join(root, entrypoint);
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, '# bundled fixture\n');
  return root;
}

function codexLaunch() {
  return { attemptId: '33333333-3333-4333-8333-333333333333', runtime: 'codex_cli' as const, model: 'gpt-5.6', prompt: 'not argv', timeoutMs: 10_000, workspacePolicy: 'empty_ephemeral_v1' as const, mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/attempts/33333333-3333-4333-8333-333333333333/mcp', attemptToken: 'A'.repeat(43), mcpToolScope: 'business' as const, mcpProtocolRevision: '2026-07-28' as const, cliContractIdentity: 'office-cli-contract-v2' as const };
}

function claudeLaunch() {
  return { ...codexLaunch(), runtime: 'claude_cli' as const, model: 'claude-sonnet' };
}
