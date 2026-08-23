export interface AttemptRuntimeProfile {
  model: string;
  settings?: readonly string[];
  loginHome: string;
}

export function buildCodexAttemptCommand(input: { workspace: string; socketPath: string; profile: AttemptRuntimeProfile }) {
  if (!input.profile.model.trim()) throw new Error('missing_runtime_model');
  return {
    bin: 'codex',
    args: [
      'exec', '--ephemeral', '--ignore-user-config', '--strict-config', '--skip-git-repo-check',
      '--sandbox', 'read-only', '--config', 'approval_policy="never"',
      '--config', 'tools.web_search=false', '--config', 'web_search="disabled"',
      '--model', input.profile.model, '-',
    ],
    cwd: input.workspace,
    env: { PATH: process.env.PATH ?? '', HOME: input.profile.loginHome, ATTEMPT_MCP_SOCKET_PATH: input.socketPath },
  };
}
