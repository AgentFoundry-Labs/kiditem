import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildClaudeCommand, buildClaudeMacosAuthStatusCommand } from './claude-command';
import { bundledProviderEntrypoint } from './provider-command';

afterEach(() => { vi.unstubAllEnvs(); });

describe('buildClaudeCommand', () => {
  it('builds pinned v2 stream-json invocation without prompt/token argv or persistent settings', () => {
    const token = 'A'.repeat(43); const prompt = 'secret prompt';
    const command = buildClaudeCommand({ attemptId: '33333333-3333-4333-8333-333333333333', runtime: 'claude_cli', model: 'claude-sonnet', prompt, timeoutMs: 10_000, workspacePolicy: 'empty_ephemeral_v1', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/attempts/33333333-3333-4333-8333-333333333333/mcp', attemptToken: token, mcpToolScope: 'business', mcpProtocolRevision: '2026-07-28', cliContractIdentity: 'office-cli-contract-v2' }, { root: '/tmp/a', workspace: '/tmp/a/workspace', home: '/tmp/a/home', codexHome: '/tmp/a/codex', claudeConfigDir: '/tmp/a/claude', mcpConfigPath: '/tmp/a/mcp.json', codexConfigPath: '/tmp/a/codex.toml' }, '/opt/kiditem-runner');
    expect(command.executable).toMatch(/^\/opt\/kiditem-runner\//);
    expect(command.args).toEqual(expect.arrayContaining(['--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--strict-mcp-config']));
    expect(command.env.MCP_SDK_GENERATION).toBe('v2'); expect(command.env.MCP_PROTOCOL_NEGOTIATION).toBe('auto');
    expect(command.args.join(' ')).not.toContain(prompt); expect(command.args.join(' ')).not.toContain(token);
  });

  it('uses the same macOS account Keychain with no isolated Claude config directory', () => {
    const loginRoot = '/Users/runner-login';
    const paths = Object.assign({
      root: '/tmp/a', workspace: '/tmp/a/workspace', home: '/tmp/a/home', codexHome: '/tmp/a/codex', claudeConfigDir: '/tmp/a/claude', mcpConfigPath: '/tmp/a/mcp.json', codexConfigPath: '/tmp/a/codex.toml',
    }, { claudeLoginHome: loginRoot });
    const command = buildClaudeCommand({
      attemptId: '33333333-3333-4333-8333-333333333333', runtime: 'claude_cli', model: 'claude-sonnet', prompt: 'secret prompt', timeoutMs: 10_000,
      workspacePolicy: 'empty_ephemeral_v1', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/attempts/33333333-3333-4333-8333-333333333333/mcp',
      attemptToken: 'A'.repeat(43), mcpToolScope: 'business', mcpProtocolRevision: '2026-07-28', cliContractIdentity: 'office-cli-contract-v2',
    }, paths, '/opt/kiditem-runner');

    expect(command.env.HOME).toBe(loginRoot);
    expect(command.env.USER).toBe(process.env.USER);
    expect(command.env.CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(command.env.SHELL).toBeUndefined();
    expect(command.env.TERM).toBeUndefined();
    expect(command.args).toEqual(expect.arrayContaining(['--setting-sources', '', '--no-session-persistence', '--strict-mcp-config']));
  });

  it('builds its local macOS auth-status probe with the same Keychain environment and no attempt secret', () => {
    vi.stubEnv('USER', 'runner-login');
    const command = buildClaudeMacosAuthStatusCommand('/opt/kiditem-runner', '/Users/runner-login');

    expect(command.args).toEqual(expect.arrayContaining(['auth', 'status', '--json']));
    expect(command.env).toMatchObject({ HOME: '/Users/runner-login', USER: 'runner-login' });
    expect(command.env.CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(command.env.KIDITEM_ATTEMPT_MCP_TOKEN).toBeUndefined();
  });

  it('fails closed instead of silently omitting macOS Keychain identity', () => {
    vi.stubEnv('USER', '');
    const paths = Object.assign({
      root: '/tmp/a', workspace: '/tmp/a/workspace', home: '/tmp/a/home', codexHome: '/tmp/a/codex', claudeConfigDir: '/tmp/a/claude', mcpConfigPath: '/tmp/a/mcp.json', codexConfigPath: '/tmp/a/codex.toml',
    }, { claudeLoginHome: '/Users/runner-login' });

    expect(() => buildClaudeCommand({
      attemptId: '33333333-3333-4333-8333-333333333333', runtime: 'claude_cli', model: 'claude-sonnet', prompt: 'secret prompt', timeoutMs: 10_000,
      workspacePolicy: 'empty_ephemeral_v1', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/attempts/33333333-3333-4333-8333-333333333333/mcp',
      attemptToken: 'A'.repeat(43), mcpToolScope: 'business', mcpProtocolRevision: '2026-07-28', cliContractIdentity: 'office-cli-contract-v2',
    }, paths, '/opt/kiditem-runner')).toThrow('provider_user_identity_required');
  });

  it('allows native Agent subagents and exactly the scoped KidItem MCP tools, without shell or browser tools', () => {
    const command = buildClaudeCommand({ attemptId: '33333333-3333-4333-8333-333333333333', runtime: 'claude_cli', model: 'claude-sonnet', prompt: 'secret prompt', timeoutMs: 10_000, workspacePolicy: 'empty_ephemeral_v1', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/attempts/33333333-3333-4333-8333-333333333333/mcp', attemptToken: 'A'.repeat(43), mcpToolScope: 'business', mcpProtocolRevision: '2026-07-28', cliContractIdentity: 'office-cli-contract-v2' }, { root: '/tmp/a', workspace: '/tmp/a/workspace', home: '/tmp/a/home', codexHome: '/tmp/a/codex', claudeConfigDir: '/tmp/a/claude', mcpConfigPath: '/tmp/a/mcp.json', codexConfigPath: '/tmp/a/codex.toml' }, '/opt/kiditem-runner');
    const tools = command.args[command.args.indexOf('--tools') + 1]!.split(',');
    const allowed = command.args[command.args.indexOf('--allowedTools') + 1]!.split(',');

    expect(tools).toHaveLength(12);
    expect(tools[0]).toBe('Agent');
    expect(allowed).toEqual(tools);
    expect(tools).not.toContain('Bash');
    expect(tools).not.toContain('browser');
    expect(tools.filter((tool) => tool.startsWith('mcp__kiditem_attempt__'))).toHaveLength(11);
  });

  it('allows exactly the scoped readiness canary tool and none of the business surface', () => {
    const launch = {
      attemptId: '33333333-3333-4333-8333-333333333333', runtime: 'claude_cli', model: 'claude-sonnet', prompt: 'readiness probe', timeoutMs: 10_000,
      workspacePolicy: 'empty_ephemeral_v1', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/attempts/33333333-3333-4333-8333-333333333333/mcp',
      attemptToken: 'A'.repeat(43), mcpProtocolRevision: '2026-07-28', cliContractIdentity: 'office-cli-contract-v2',
      mcpToolScope: 'readiness_canary', readinessProbeNonce: '51e975ef-c0a7-4ab1-8007-47c0fd563505',
    };
    const command = buildClaudeCommand(launch, { root: '/tmp/a', workspace: '/tmp/a/workspace', home: '/tmp/a/home', codexHome: '/tmp/a/codex', claudeConfigDir: '/tmp/a/claude', mcpConfigPath: '/tmp/a/mcp.json', codexConfigPath: '/tmp/a/codex.toml' }, '/opt/kiditem-runner');
    const tools = command.args[command.args.indexOf('--tools') + 1]!.split(',');
    const allowed = command.args[command.args.indexOf('--allowedTools') + 1]!.split(',');

    expect(tools).toEqual(['mcp__kiditem_attempt__readiness_probe']);
    expect(allowed).toEqual(tools);
    expect(tools).not.toContain('Agent');
    expect(tools.filter((tool) => tool.startsWith('mcp__kiditem_attempt__'))).toHaveLength(1);
  });

  it('the installed 2.1.241 parser recognizes the stream-json verbose contract before any provider request', async () => {
    const executable = bundledProviderEntrypoint(resolve(process.cwd(), '../..'), 'claude');
    const child = spawn(executable, ['--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--help'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    const [code, signal] = await once(child, 'exit') as [number | null, NodeJS.Signals | null];

    expect({ code, signal }).toEqual({ code: 0, signal: null });
  });
});
