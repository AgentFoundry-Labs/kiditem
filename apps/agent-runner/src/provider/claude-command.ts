import type { AttemptLaunchSpec } from '@kiditem/shared/agent-runtime';
import { resolve } from 'node:path';
import type { AttemptWorkspacePaths } from '../attempt/attempt-workspace.service';
import { agentResultOutputSchema } from './agent-result-output-schema';
import { bundledProviderInvocation, providerEnvironment, type ProviderCommand } from './provider-command';

/** Builds a no-history, direct v2 MCP Claude invocation. */
export function buildClaudeCommand(launch: AttemptLaunchSpec, paths: AttemptWorkspacePaths, runtimeRoot: string): ProviderCommand {
  if (!launch.model.trim()) throw new Error('missing_runtime_model');
  const invocation = bundledProviderInvocation(runtimeRoot, 'claude');
  const macosKeychainHome = paths.claudeLoginHome;
  return Object.freeze({
    executable: invocation.executable,
    args: Object.freeze([
      ...invocation.argsPrefix,
      '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--model', launch.model,
      '--setting-sources', '',
      '--no-chrome', '--no-session-persistence', '--mcp-config', paths.mcpConfigPath,
      '--strict-mcp-config', '--allow-dangerously-skip-permissions', '--permission-mode', 'bypassPermissions', '--disable-slash-commands',
      '--json-schema', JSON.stringify(agentResultOutputSchema()),
    ]),
    cwd: paths.workspace,
    env: providerEnvironment({
      home: macosKeychainHome ?? paths.home,
      ...(macosKeychainHome
        ? { includeMacosUserIdentity: true }
        : { providerHome: { key: 'CLAUDE_CONFIG_DIR' as const, path: paths.claudeConfigDir } }),
      attemptToken: launch.attemptToken,
    }),
  });
}

/**
 * Local, boolean-only login inspection.  It deliberately shares the macOS
 * execution environment: same account HOME and USER, no CLAUDE_CONFIG_DIR,
 * and no attempt token or host configuration materialization.
 */
export function buildClaudeMacosAuthStatusCommand(runtimeRoot: string, loginRoot: string): ProviderCommand {
  const invocation = bundledProviderInvocation(runtimeRoot, 'claude');
  return Object.freeze({
    executable: invocation.executable,
    args: Object.freeze([...invocation.argsPrefix, 'auth', 'status', '--json']),
    cwd: resolve(runtimeRoot),
    env: providerEnvironment({ home: loginRoot, includeMacosUserIdentity: true }),
  });
}
