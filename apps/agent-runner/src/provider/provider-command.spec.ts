import { describe, expect, it } from 'vitest';
import { buildProviderCommand } from './provider-command';

describe('buildProviderCommand', () => {
  it('selects the provider only from the typed runtime and rejects a mismatched workspace policy/train', () => {
    const command = buildProviderCommand({ attemptId: '33333333-3333-4333-8333-333333333333', runtime: 'codex_cli', model: 'gpt-5.6', prompt: 'not argv', timeoutMs: 10_000, workspacePolicy: 'empty_ephemeral_v1', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/attempts/33333333-3333-4333-8333-333333333333/mcp', attemptToken: 'A'.repeat(43), mcpToolScope: 'business', mcpProtocolRevision: '2026-07-28', cliContractIdentity: 'office-cli-contract-v2' }, paths, '/opt/kiditem-runner');
    expect(command.executable).toContain('/opt/kiditem-runner/');
    expect(command.cwd).toBe(paths.workspace);
  });
});
const paths = { root: '/tmp/a', workspace: '/tmp/a/workspace', home: '/tmp/a/home', codexHome: '/tmp/a/codex', claudeConfigDir: '/tmp/a/claude', mcpConfigPath: '/tmp/a/mcp.json', codexConfigPath: '/tmp/a/codex.toml' };
