export type AgentLocalCliProvider = 'claude_cli' | 'codex_cli';

export interface BuildAgentLocalCliCommandInput {
  provider: AgentLocalCliProvider;
  model: string;
  workingDirectory: string;
  hostEnvironment: Readonly<NodeJS.ProcessEnv>;
  prompt: string;
  outputSchema: Record<string, unknown>;
  outputSchemaFile: string;
  outputFile: string;
  claudeMaxBudgetUsd: string;
}

export interface AgentLocalCliCommand {
  bin: 'claude' | 'codex';
  args: string[];
  cwd: string;
  env: Record<string, string>;
  stdin: string;
}

const SHARED_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TMPDIR',
  'TZ',
] as const;
const CLAUDE_ENV_KEYS: readonly string[] = [];
const CODEX_ENV_KEYS = ['CODEX_HOME'] as const;

export function filterLocalCliEnvironment(
  provider: AgentLocalCliProvider,
  hostEnvironment: Readonly<NodeJS.ProcessEnv>,
): Record<string, string> {
  const providerKeys = provider === 'claude_cli' ? CLAUDE_ENV_KEYS : CODEX_ENV_KEYS;
  const result: Record<string, string> = {};
  for (const key of [...SHARED_ENV_KEYS, ...providerKeys]) {
    const value = hostEnvironment[key];
    if (value?.trim()) result[key] = value;
  }
  return result;
}

export function buildClaudeCommand(
  input: BuildAgentLocalCliCommandInput,
): AgentLocalCliCommand {
  return {
    bin: 'claude',
    args: [
      '--print',
      '--output-format',
      'json',
      '--model',
      input.model,
      '--setting-sources',
      '',
      '--tools',
      '',
      '--strict-mcp-config',
      '--no-chrome',
      '--no-session-persistence',
      '--permission-mode',
      'dontAsk',
      '--disable-slash-commands',
      '--json-schema',
      JSON.stringify(input.outputSchema),
    ],
    cwd: input.workingDirectory,
    env: filterLocalCliEnvironment('claude_cli', input.hostEnvironment),
    stdin: input.prompt,
  };
}

const DISABLED_CODEX_FEATURES = [
  'shell_tool',
  'unified_exec',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'computer_use',
  'plugins',
  'image_generation',
  'apps',
  'multi_agent',
  'workspace_dependencies',
  'code_mode',
  'in_app_browser',
  'view_image',
] as const;

export function buildCodexCommand(
  input: BuildAgentLocalCliCommandInput,
): AgentLocalCliCommand {
  return {
    bin: 'codex',
    args: [
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      '--strict-config',
      '--skip-git-repo-check',
      '--cd',
      input.workingDirectory,
      '--sandbox',
      'read-only',
      ...DISABLED_CODEX_FEATURES.flatMap((feature) => ['--disable', feature]),
      '--config',
      'approval_policy="never"',
      '--config',
      'allow_login_shell=false',
      '--config',
      'tools.web_search=false',
      '--config',
      'web_search="disabled"',
      '--output-schema',
      input.outputSchemaFile,
      '--output-last-message',
      input.outputFile,
      '--json',
      '--model',
      input.model,
      '-',
    ],
    cwd: input.workingDirectory,
    env: filterLocalCliEnvironment('codex_cli', input.hostEnvironment),
    stdin: input.prompt,
  };
}

export function buildAgentLocalCliCommand(
  input: BuildAgentLocalCliCommandInput,
): AgentLocalCliCommand {
  return input.provider === 'claude_cli'
    ? buildClaudeCommand(input)
    : buildCodexCommand(input);
}
