import { describe, expect, it, vi } from 'vitest';

describe('buildClaudeTurnCommand', () => {
  it('uses provider-persistent first-session and resume contracts with a Gateway-owned selected profile and exact native-agent registry', async () => {
    const { buildClaudeTurnCommand } = await import('./claude-command');
    const { gatewayInstructionProfile } = await import('../../profile/agent-profile.catalog');
    vi.stubEnv('USER', 'gateway-user');
    try {
      const first = buildClaudeTurnCommand({
        runtimeRoot: process.cwd(), workspace: '/gateway/workspace', loginRoot: '/gateway/login', mcpConfigPath: '/gateway/state/turn-1.mcp.json',
        sessionId: '33333333-3333-4333-8333-333333333333', resume: false, model: 'claude-fable-5', reasoningEffort: 'high', instructionProfile: gatewayInstructionProfile(null),
      });
      const resumed = buildClaudeTurnCommand({
        runtimeRoot: process.cwd(), workspace: '/gateway/workspace', loginRoot: '/gateway/login', mcpConfigPath: '/gateway/state/turn-2.mcp.json',
        sessionId: '33333333-3333-4333-8333-333333333333', resume: true, model: 'claude-fable-5', reasoningEffort: 'medium', instructionProfile: gatewayInstructionProfile('sourcing'),
      });

      expect(first.args).toEqual(expect.arrayContaining([
        '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
        '--model', 'claude-fable-5', '--effort', 'high', '--session-id', '33333333-3333-4333-8333-333333333333',
        '--mcp-config', '/gateway/state/turn-1.mcp.json', '--strict-mcp-config',
        '--allow-dangerously-skip-permissions', '--permission-mode', 'bypassPermissions',
      ]));
      expect(first.args).not.toContain('--resume');
      expect(first.args).not.toContain('--no-session-persistence');
      expect(resumed.args).toEqual(expect.arrayContaining(['--resume', '33333333-3333-4333-8333-333333333333', '--effort', 'medium']));
      expect(resumed.args).not.toContain('--session-id');
      expect(first.args.join(' ')).not.toContain('mcpTransportToken');
      expect(first.args).toEqual(expect.arrayContaining(['--append-system-prompt', expect.stringContaining('KidItem General Chat'), '--agents']));
      expect(resumed.args).toEqual(expect.arrayContaining(['--append-system-prompt', expect.stringContaining('KidItem Sourcing Agent'), '--agents']));
      const agentJson = first.args[first.args.indexOf('--agents') + 1];
      expect(JSON.parse(agentJson!)).toEqual(expect.objectContaining({
        sourcing: expect.objectContaining({ prompt: expect.stringContaining('KidItem Sourcing Agent') }),
        merchandising: expect.objectContaining({ prompt: expect.stringContaining('KidItem Merchandising Agent') }),
        supply: expect.objectContaining({ prompt: expect.stringContaining('KidItem Supply Agent') }),
        channel_operations: expect.objectContaining({ prompt: expect.stringContaining('KidItem Channel Operations Agent') }),
        advertising: expect.objectContaining({ prompt: expect.stringContaining('KidItem Advertising Agent') }),
      }));
      expect(first.env).toMatchObject({ HOME: '/gateway/login' });
      if (process.platform === 'darwin') expect(first.env).toMatchObject({ USER: 'gateway-user' });
      else expect(first.env).not.toHaveProperty('USER');
      expect(first.env).not.toHaveProperty('CLAUDE_CONFIG_DIR');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('builds auth status without a macOS-only USER requirement on Windows', async () => {
    const { buildClaudeAuthStatusCommand } = await import('./claude-command');
    vi.stubEnv('USER', '');
    try {
      const command = buildClaudeAuthStatusCommand(process.cwd(), '/gateway/login', 'win32');
      expect(command.args).toEqual(expect.arrayContaining(['auth', 'status', '--json']));
      expect(command.env).toMatchObject({ HOME: '/gateway/login' });
      expect(command.env).not.toHaveProperty('USER');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
