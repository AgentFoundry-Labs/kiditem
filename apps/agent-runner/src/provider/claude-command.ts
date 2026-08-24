import type { AttemptLaunchSpec } from '@kiditem/shared/agent-runtime';
import type { AttemptWorkspacePaths } from '../attempt/attempt-workspace.service';
import { agentResultOutputSchema } from './agent-result-output-schema';
import { bundledProviderEntrypoint, providerEnvironment, type ProviderCommand } from './provider-command';

const KIDITEM_MCP_TOOLS = [
  'mcp__kiditem_attempt__capability_catalog_search', 'mcp__kiditem_attempt__capability_invoke',
  'mcp__kiditem_attempt__invocation_status', 'mcp__kiditem_attempt__invocation_wait', 'mcp__kiditem_attempt__invocation_result',
  'mcp__kiditem_attempt__delegate_to_agent', 'mcp__kiditem_attempt__child_status', 'mcp__kiditem_attempt__child_wait',
  'mcp__kiditem_attempt__child_result', 'mcp__kiditem_attempt__child_message', 'mcp__kiditem_attempt__child_interrupt',
].join(',');
const CLAUDE_ALLOWED_TOOLS = ['Agent', KIDITEM_MCP_TOOLS].join(',');

/** Builds a no-history, direct v2 MCP Claude invocation. */
export function buildClaudeCommand(launch: AttemptLaunchSpec, paths: AttemptWorkspacePaths, runtimeRoot: string): ProviderCommand {
  if (!launch.model.trim()) throw new Error('missing_runtime_model');
  return Object.freeze({
    executable: bundledProviderEntrypoint(runtimeRoot, 'claude'),
    args: Object.freeze([
      '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--model', launch.model,
      '--setting-sources', '', '--tools', CLAUDE_ALLOWED_TOOLS, '--allowedTools', CLAUDE_ALLOWED_TOOLS,
      '--no-chrome', '--no-session-persistence', '--mcp-config', paths.mcpConfigPath,
      '--strict-mcp-config', '--permission-mode', 'dontAsk', '--disable-slash-commands',
      '--json-schema', JSON.stringify(agentResultOutputSchema()),
    ]),
    cwd: paths.workspace,
    env: providerEnvironment({ home: paths.home, providerHomeKey: 'CLAUDE_CONFIG_DIR', providerHome: paths.claudeConfigDir, attemptToken: launch.attemptToken }),
  });
}
