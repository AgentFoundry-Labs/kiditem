import { IsolatedCliRuntimeAdapter, type IsolatedCliRuntimeOptions } from './isolated-cli-runtime.adapter';

type CodexOptions = Omit<
  IsolatedCliRuntimeOptions,
  'runtimeType' | 'binary' | 'allowedBinary' | 'versionPattern' | 'startArgs' | 'resumeArgs'
>;

const CODEX_NON_MCP_FEATURES = [
  'shell_tool',
  'unified_exec',
  'shell_snapshot',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'computer_use',
  'plugins',
  'plugin_sharing',
  'remote_plugin',
  'apps',
  'image_generation',
  'multi_agent',
  'workspace_dependencies',
  'code_mode',
  'code_mode_host',
  'in_app_browser',
  'view_image',
  'skill_mcp_dependency_install',
  'tool_suggest',
  'request_permissions_tool',
  'auth_elicitation',
  'hooks',
] as const;

const CODEX_MCP_ONLY_CONFIG = [
  '--ignore-user-config',
  '--ignore-rules',
  '--strict-config',
  '--config',
  'sandbox_mode="read-only"',
  '--config',
  'approval_policy="never"',
  '--config',
  'shell_environment_policy.allow_login_shell=false',
  '--config',
  'tools.web_search=false',
  '--config',
  'web_search="disabled"',
  ...CODEX_NON_MCP_FEATURES.flatMap((feature) => [
    '--config',
    `features.${feature}=false`,
  ]),
] as const;

export class CodexCliRuntimeAdapter extends IsolatedCliRuntimeAdapter {
  constructor(options: CodexOptions) {
    super({
      ...options,
      runtimeType: 'codex_cli',
      binary: 'codex',
      allowedBinary: 'codex',
      versionPattern:
        /^(?:codex(?:-cli)?\s+)?(?:0\.(?:14[7-9]|1[5-9]\d|[2-9]\d{2}|[1-9]\d{3,})\.\d+|[1-9]\d*\.\d+\.\d+)$/,
      startArgs: [
        'exec',
        ...CODEX_MCP_ONLY_CONFIG,
        '--skip-git-repo-check',
        '--json',
      ],
      resumeArgs: [
        'exec',
        'resume',
        ...CODEX_MCP_ONLY_CONFIG,
        '--skip-git-repo-check',
        '--json',
      ],
    });
  }
}
