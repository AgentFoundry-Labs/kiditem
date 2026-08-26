import { gatewayProviderInvocation, providerEnvironment, type GatewayProviderCommand } from './provider-command';
import { claudeAgentDefinitions, type GatewayInstructionProfile } from '../profile/agent-profile.catalog';

export interface ClaudeTurnCommandInput {
  runtimeRoot: string;
  workspace: string;
  loginRoot: string;
  /** Gateway-created 0600 file; the MCP transport token never enters argv. */
  mcpConfigPath: string;
  sessionId: string;
  resume: boolean;
  model: string;
  reasoningEffort: string;
  instructionProfile: GatewayInstructionProfile;
}

/**
 * Exact pinned Claude CLI invocation. The Gateway, rather than Nest, owns its
 * executable, workspace, permissions, model/effort, streaming, and env.
 */
export function buildClaudeTurnCommand(input: Readonly<ClaudeTurnCommandInput>): GatewayProviderCommand {
  if (!input.sessionId.trim() || !input.model.trim() || !input.reasoningEffort.trim()) throw new Error('claude_turn_command_invalid');
  const invocation = gatewayProviderInvocation(input.runtimeRoot, 'claude');
  return Object.freeze({
    executable: invocation.executable,
    args: Object.freeze([
      ...invocation.argsPrefix,
      '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--model', input.model, '--effort', input.reasoningEffort,
      '--append-system-prompt', input.instructionProfile.selectedInstructions,
      '--agents', JSON.stringify(claudeAgentDefinitions(input.instructionProfile)),
      '--mcp-config', input.mcpConfigPath, '--strict-mcp-config',
      '--allow-dangerously-skip-permissions', '--permission-mode', 'bypassPermissions', '--disable-slash-commands',
      ...(input.resume ? ['--resume', input.sessionId] : ['--session-id', input.sessionId]),
    ]),
    cwd: input.workspace,
    env: providerEnvironment({
      home: input.loginRoot,
      ...(process.platform === 'darwin' ? { includeMacosUserIdentity: true } : {}),
    }),
  });
}

/** Login status is portable; only macOS inherits the required USER identity. */
export function buildClaudeAuthStatusCommand(
  runtimeRoot: string,
  loginRoot: string,
  platform: NodeJS.Platform = process.platform,
): GatewayProviderCommand {
  const invocation = gatewayProviderInvocation(runtimeRoot, 'claude');
  return Object.freeze({
    executable: invocation.executable,
    args: Object.freeze([...invocation.argsPrefix, 'auth', 'status', '--json']),
    cwd: runtimeRoot,
    env: providerEnvironment({
      home: loginRoot,
      ...(platform === 'darwin' ? { includeMacosUserIdentity: true } : {}),
    }),
  });
}
