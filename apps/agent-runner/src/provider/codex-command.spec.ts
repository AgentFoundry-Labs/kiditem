import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { buildCodexCommand } from './codex-command';

const token = 'A'.repeat(43); const prompt = 'this prompt must never appear in argv';
const paths = { root: '/tmp/attempt', workspace: '/tmp/attempt/workspace', home: '/tmp/attempt/home', codexHome: '/tmp/attempt/codex-home', claudeConfigDir: '/tmp/attempt/claude-config', mcpConfigPath: '/tmp/attempt/mcp.json', codexConfigPath: '/tmp/attempt/codex.toml' };

describe('buildCodexCommand', () => {
  it('uses only a Runner-owned executable and explicit non-persistent direct-MCP configuration', () => {
    const command = buildCodexCommand(launch(), paths, '/opt/kiditem-runner');
    expect(command.executable).toMatch(/^\/opt\/kiditem-runner\//);
    expect(command.args).toEqual(expect.arrayContaining([
      'app-server', '--stdio', '--strict-config', '--disable', 'plugins',
      '--config', 'features.mcp_2026_07_28=true',
    ]));
    expect(command.args.join(' ')).not.toContain('thread/start.ephemeral');
    expect(command.args.join(' ')).not.toContain('plugins.enabled');
    expect(command.env.CODEX_MCP_PROTOCOL_VERSION).toBe('2026-07-28');
    expect(command.env.KIDITEM_ATTEMPT_MCP_TOKEN).toBe(token);
    expect(command.args.join(' ')).not.toContain(prompt);
    expect(command.args.join(' ')).not.toContain(token);
  });

  it('boots the installed 0.149.1 app-server with the strict generated config and :workspace profile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiditem-codex-strict-'));
    const codexHome = join(root, 'codex-home');
    const require = createRequire(import.meta.url);
    const entrypoint = require.resolve('@openai/codex/bin/codex.js');
    await mkdir(codexHome, { recursive: true });
    await writeFile(join(codexHome, 'config.toml'), [
      'history.persistence = "none"',
      'web_search = "disabled"',
      'approval_policy = "never"',
      'default_permissions = ":workspace"',
      '',
      '[shell_environment_policy]',
      'exclude = ["KIDITEM_ATTEMPT_MCP_TOKEN"]',
      '',
    ].join('\n'));
    const child = spawn(process.execPath, [entrypoint, 'app-server', '--stdio', '--strict-config', '--disable', 'plugins'], {
      cwd: root,
      env: { ...process.env, HOME: root, CODEX_HOME: codexHome },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const rpc = new JsonRpcFixture(child);
    try {
      await rpc.request('initialize', { clientInfo: { name: 'kiditem-test', version: '1' }, capabilities: null });
      rpc.notify('initialized', {});
      const thread = await rpc.request('thread/start', {
        model: 'gpt-5.6', cwd: root, approvalPolicy: 'never', ephemeral: true,
      }) as Record<string, unknown>;
      expect(((thread.activePermissionProfile as Record<string, unknown> | undefined)?.id)).toBe(':workspace');
      expect(JSON.stringify(rpc.stderr)).not.toContain('unknown field');
    } finally {
      child.kill('SIGTERM');
      await onceExit(child);
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);
});
function launch() { return { attemptId: '33333333-3333-4333-8333-333333333333', runtime: 'codex_cli' as const, model: 'gpt-5.6', prompt, timeoutMs: 10_000, workspacePolicy: 'empty_ephemeral_v1' as const, mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/attempts/33333333-3333-4333-8333-333333333333/mcp', attemptToken: token, mcpToolScope: 'business' as const, mcpProtocolRevision: '2026-07-28' as const, cliContractIdentity: 'office-cli-contract-v2' as const }; }

class JsonRpcFixture {
  private buffer = '';
  private readonly pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  readonly stderr: string[] = [];
  private nextId = 0;

  constructor(private readonly child: ReturnType<typeof spawn>) {
    child.stdout!.setEncoding('utf8'); child.stderr!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => this.receive(chunk));
    child.stderr!.on('data', (chunk: string) => this.stderr.push(chunk));
    child.once('exit', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('codex_strict_fixture_exited'));
      this.pending.clear();
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = `test-${++this.nextId}`;
    this.child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error('codex_strict_fixture_timeout')); }, 10_000);
    });
  }

  notify(method: string, params: unknown): void { this.child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`); }

  private receive(chunk: string): void {
    this.buffer += chunk;
    while (this.buffer.includes('\n')) {
      const index = this.buffer.indexOf('\n'); const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
      let message: { id?: string; result?: unknown; error?: unknown };
      try { message = JSON.parse(line) as { id?: string; result?: unknown; error?: unknown }; } catch { continue; }
      if (!message.id) continue;
      const pending = this.pending.get(message.id); if (!pending) continue;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`codex_strict_fixture_rpc_error_${message.id}`)); else pending.resolve(message.result);
    }
  }
}

async function onceExit(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
}
