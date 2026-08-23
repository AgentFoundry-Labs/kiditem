import type { AttemptRuntimeProfile } from './codex-attempt.adapter';

export function buildClaudeAttemptCommand(input: { workspace: string; socketPath: string; mcpConfigPath: string; profile: AttemptRuntimeProfile }) {
  if (!input.profile.model.trim()) throw new Error('missing_runtime_model');
  return {
    bin: 'claude',
    args: [
      '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--model', input.profile.model,
      '--setting-sources', '', '--tools', 'Agent', '--allowedTools',
      'mcp__kiditem_attempt__capability_catalog_search,mcp__kiditem_attempt__capability_invoke,mcp__kiditem_attempt__delegate_to_agent,mcp__kiditem_attempt__child_status,mcp__kiditem_attempt__child_wait,mcp__kiditem_attempt__child_result,mcp__kiditem_attempt__child_message,mcp__kiditem_attempt__child_interrupt',
      '--no-chrome', '--no-session-persistence', '--mcp-config', input.mcpConfigPath,
      '--strict-mcp-config', '--permission-mode', 'dontAsk', '--disable-slash-commands',
    ],
    cwd: input.workspace,
    env: { PATH: process.env.PATH ?? '', HOME: input.profile.loginHome, ATTEMPT_MCP_SOCKET_PATH: input.socketPath },
  };
}
