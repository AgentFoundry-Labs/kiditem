import type { AttemptRuntimeProfile } from './codex-attempt.adapter';

export function buildClaudeAttemptCommand(input: { workspace: string; socketPath: string; profile: AttemptRuntimeProfile }) {
  if (!input.profile.model.trim()) throw new Error('missing_runtime_model');
  return {
    bin: 'claude',
    args: [
      '--print', '--output-format', 'stream-json', '--model', input.profile.model,
      '--setting-sources', '', '--tools', '', '--no-chrome', '--no-session-persistence',
      '--strict-mcp-config', '--permission-mode', 'dontAsk', '--disable-slash-commands',
    ],
    cwd: input.workspace,
    env: { PATH: process.env.PATH ?? '', HOME: input.profile.loginHome, ATTEMPT_MCP_SOCKET_PATH: input.socketPath },
  };
}
