export interface AttemptRuntimeProfile {
  model: string;
  settings?: readonly string[];
  loginHome: string;
}

export function buildCodexAttemptCommand(input: { workspace: string; socketPath: string; mcpConfigPath: string; profile: AttemptRuntimeProfile }) {
  if (!input.profile.model.trim()) throw new Error('missing_runtime_model');
  return {
    bin: 'codex',
    args: [
      'app-server', '--stdio', '--strict-config', '--config', `mcp_servers.kiditem_attempt.command=${JSON.stringify(process.execPath)}`,
      '--config', `mcp_servers.kiditem_attempt.args=[${JSON.stringify(resolveMcpServerPath())}]`,
      '--config', 'approval_policy="never"', '--config', 'tools.web_search=false', '--config', 'history.persistence="none"',
    ],
    cwd: input.workspace,
    env: { PATH: process.env.PATH ?? '', HOME: input.profile.loginHome, ATTEMPT_MCP_SOCKET_PATH: input.socketPath },
  };
}

function resolveMcpServerPath(): string {
  return `${process.cwd()}/dist/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.js`;
}
