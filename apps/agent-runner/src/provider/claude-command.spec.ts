import { describe, expect, it } from 'vitest';
import { buildClaudeCommand } from './claude-command';

describe('buildClaudeCommand', () => {
  it('builds pinned v2 stream-json invocation without prompt/token argv or persistent settings', () => {
    const token = 'A'.repeat(43); const prompt = 'secret prompt';
    const command = buildClaudeCommand({ attemptId: '33333333-3333-4333-8333-333333333333', runtime: 'claude_cli', model: 'claude-sonnet', prompt, timeoutMs: 10_000, workspacePolicy: 'empty_ephemeral_v1', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/attempts/33333333-3333-4333-8333-333333333333/mcp', attemptToken: token, mcpProtocolRevision: '2026-07-28', cliContractIdentity: 'office-cli-contract-v2' }, { root: '/tmp/a', workspace: '/tmp/a/workspace', home: '/tmp/a/home', codexHome: '/tmp/a/codex', claudeConfigDir: '/tmp/a/claude', mcpConfigPath: '/tmp/a/mcp.json', codexConfigPath: '/tmp/a/codex.toml' }, '/opt/kiditem-runner');
    expect(command.executable).toMatch(/^\/opt\/kiditem-runner\//);
    expect(command.args).toEqual(expect.arrayContaining(['--input-format', 'stream-json', '--output-format', 'stream-json', '--no-session-persistence', '--strict-mcp-config']));
    expect(command.env.MCP_SDK_GENERATION).toBe('v2'); expect(command.env.MCP_PROTOCOL_NEGOTIATION).toBe('auto');
    expect(command.args.join(' ')).not.toContain(prompt); expect(command.args.join(' ')).not.toContain(token);
  });

  it('allows native Agent subagents and exactly the scoped KidItem MCP tools, without shell or browser tools', () => {
    const command = buildClaudeCommand({ attemptId: '33333333-3333-4333-8333-333333333333', runtime: 'claude_cli', model: 'claude-sonnet', prompt: 'secret prompt', timeoutMs: 10_000, workspacePolicy: 'empty_ephemeral_v1', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/attempts/33333333-3333-4333-8333-333333333333/mcp', attemptToken: 'A'.repeat(43), mcpProtocolRevision: '2026-07-28', cliContractIdentity: 'office-cli-contract-v2' }, { root: '/tmp/a', workspace: '/tmp/a/workspace', home: '/tmp/a/home', codexHome: '/tmp/a/codex', claudeConfigDir: '/tmp/a/claude', mcpConfigPath: '/tmp/a/mcp.json', codexConfigPath: '/tmp/a/codex.toml' }, '/opt/kiditem-runner');
    const tools = command.args[command.args.indexOf('--tools') + 1]!.split(',');
    const allowed = command.args[command.args.indexOf('--allowedTools') + 1]!.split(',');

    expect(tools).toHaveLength(12);
    expect(tools[0]).toBe('Agent');
    expect(allowed).toEqual(tools);
    expect(tools).not.toContain('Bash');
    expect(tools).not.toContain('browser');
    expect(tools.filter((tool) => tool.startsWith('mcp__kiditem_attempt__'))).toHaveLength(11);
  });
});
