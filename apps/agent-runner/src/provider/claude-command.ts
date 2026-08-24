import type { AttemptLaunchSpec } from '@kiditem/shared/agent-runtime';
import type { AttemptWorkspacePaths } from '../attempt/attempt-workspace.service';
import { agentResultOutputSchema } from './agent-result-output-schema';
import { bundledProviderEntrypoint, providerEnvironment, type ProviderCommand } from './provider-command';

const KIDITEM_BUSINESS_MCP_TOOLS = [
  'mcp__kiditem_attempt__capability_catalog_search', 'mcp__kiditem_attempt__capability_invoke',
  'mcp__kiditem_attempt__invocation_status', 'mcp__kiditem_attempt__invocation_wait', 'mcp__kiditem_attempt__invocation_result',
  'mcp__kiditem_attempt__delegate_to_agent', 'mcp__kiditem_attempt__child_status', 'mcp__kiditem_attempt__child_wait',
  'mcp__kiditem_attempt__child_result', 'mcp__kiditem_attempt__child_message', 'mcp__kiditem_attempt__child_interrupt',
].join(',');
const CLAUDE_BUSINESS_ALLOWED_TOOLS = ['Agent', KIDITEM_BUSINESS_MCP_TOOLS].join(',');
const CLAUDE_READINESS_ALLOWED_TOOLS = 'mcp__kiditem_attempt__readiness_probe';

/** Builds a no-history, direct v2 MCP Claude invocation. */
export function buildClaudeCommand(launch: AttemptLaunchSpec, paths: AttemptWorkspacePaths, runtimeRoot: string): ProviderCommand {
  if (!launch.model.trim()) throw new Error('missing_runtime_model');
  const allowedTools = claudeAllowedTools(launch.mcpToolScope);
  return Object.freeze({
    executable: bundledProviderEntrypoint(runtimeRoot, 'claude'),
    args: Object.freeze([
      '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--model', launch.model,
      '--setting-sources', '', '--tools', allowedTools, '--allowedTools', allowedTools,
      '--no-chrome', '--no-session-persistence', '--mcp-config', paths.mcpConfigPath,
      '--strict-mcp-config', '--permission-mode', 'dontAsk', '--disable-slash-commands',
      '--json-schema', JSON.stringify(agentResultOutputSchema()),
    ]),
    cwd: paths.workspace,
    env: providerEnvironment({ home: paths.home, providerHomeKey: 'CLAUDE_CONFIG_DIR', providerHome: paths.claudeConfigDir, attemptToken: launch.attemptToken }),
  });
}

function claudeAllowedTools(scope: AttemptLaunchSpec['mcpToolScope']): string {
  switch (scope) {
    case 'business':
      return CLAUDE_BUSINESS_ALLOWED_TOOLS;
    case 'readiness_canary':
      return CLAUDE_READINESS_ALLOWED_TOOLS;
  }
  // Keep an unexpected scope fail-closed even if a future shared-contract
  // widening reaches this runner before its provider allowlist is updated.
  throw new Error('runner_mcp_tool_scope_invalid');
}
