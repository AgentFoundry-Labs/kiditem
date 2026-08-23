import type { AttemptRuntimeProfile } from './codex-attempt.adapter';
import { agentResultOutputSchema } from './agent-result-output-schema';

export function buildClaudeAttemptCommand(input: { workspace: string; socketPath: string; mcpConfigPath: string; profile: AttemptRuntimeProfile; allowedTools?: string; extraEnv?: Record<string, string> }) {
  if (!input.profile.model.trim()) throw new Error('missing_runtime_model');
  if (!input.profile.home || !input.profile.claudeConfigDir) throw new Error('attempt_runtime_home_missing');
  return {
    bin: 'claude',
    args: [
      '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--model', input.profile.model,
      '--setting-sources', '', '--tools', 'Agent', '--allowedTools',
      input.allowedTools ?? 'mcp__kiditem_attempt__capability_catalog_search,mcp__kiditem_attempt__capability_invoke,mcp__kiditem_attempt__invocation_status,mcp__kiditem_attempt__invocation_wait,mcp__kiditem_attempt__invocation_result,mcp__kiditem_attempt__delegate_to_agent,mcp__kiditem_attempt__child_status,mcp__kiditem_attempt__child_wait,mcp__kiditem_attempt__child_result,mcp__kiditem_attempt__child_message,mcp__kiditem_attempt__child_interrupt',
      '--no-chrome', '--no-session-persistence', '--mcp-config', input.mcpConfigPath,
      '--strict-mcp-config', '--permission-mode', 'dontAsk', '--disable-slash-commands',
      '--json-schema', JSON.stringify(agentResultOutputSchema()),
    ],
    cwd: input.workspace,
    env: { PATH: process.env.PATH ?? '', HOME: input.profile.home, CLAUDE_CONFIG_DIR: input.profile.claudeConfigDir, ...(input.extraEnv ?? {}) },
  };
}
