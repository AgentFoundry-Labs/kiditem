export interface AttemptRuntimeProfile {
  model: string;
  loginHome: string;
  home?: string;
  codexHome?: string;
  claudeConfigDir?: string;
}

export function buildCodexAttemptCommand(input: { workspace: string; socketPath: string; mcpConfigPath: string; profile: AttemptRuntimeProfile; mcpServerName?: string; mcpExecutable?: string; mcpEnv?: Record<string, string> }) {
  if (!input.profile.model.trim()) throw new Error('missing_runtime_model');
  if (!input.profile.home || !input.profile.codexHome) throw new Error('attempt_runtime_home_missing');
  const serverName = input.mcpServerName ?? 'kiditem_attempt';
  const executable = input.mcpExecutable ?? resolveMcpServerPath();
  const mcpEnv = input.mcpEnv ?? { ATTEMPT_MCP_SOCKET_PATH: input.socketPath };
  return {
    bin: 'codex',
    args: [
      'app-server', '--stdio', '--strict-config', '--config', `mcp_servers.${serverName}.command=${JSON.stringify(process.execPath)}`,
      '--config', `mcp_servers.${serverName}.args=[${JSON.stringify(executable)}]`,
      '--config', 'approval_policy="never"', '--config', 'tools.web_search=false', '--config', 'history.persistence="none"',
    ],
    cwd: input.workspace,
    env: { PATH: process.env.PATH ?? '', HOME: input.profile.home, CODEX_HOME: input.profile.codexHome, ...mcpEnv },
  };
}

function resolveMcpServerPath(): string {
  return `${process.cwd()}/dist/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.js`;
}
