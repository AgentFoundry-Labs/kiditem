import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type { AttemptLaunchSpec, AgentCliRuntime, RunnerPlatform } from '@kiditem/shared/agent-runtime';
import { AttemptLaunchSpecSchema } from '@kiditem/shared/agent-runtime';
import { createProtectedAttemptRootGuard, type RunnerProtectedAttemptRootGuard } from '../config/runner-config';
import { ProviderAuthReferenceService } from '../provider/provider-auth-reference';

export type AttemptWorkspacePaths = Readonly<{
  root: string;
  workspace: string;
  home: string;
  /** macOS Claude uses the host account's Keychain without exposing its config directory. */
  claudeLoginHome?: string;
  codexHome: string;
  claudeConfigDir: string;
  mcpConfigPath: string;
  codexConfigPath: string;
}>;

/** Runner-owned private workspace lifecycle; no provider home or credential bytes are copied. */
export class AttemptWorkspaceService {
  private readonly auth: ProviderAuthReferenceService;
  private readonly attemptRootGuard: Promise<RunnerProtectedAttemptRootGuard>;

  constructor(private readonly options: Readonly<{
    attemptRoot: string;
    loginRoot: string;
    platform: RunnerPlatform;
    attemptRootGuard?: RunnerProtectedAttemptRootGuard;
  }>) {
    this.auth = new ProviderAuthReferenceService({ loginRoot: options.loginRoot, platform: options.platform });
    this.attemptRootGuard = Promise.resolve(options.attemptRootGuard ?? createProtectedAttemptRootGuard(options.attemptRoot));
  }

  async create(input: AttemptLaunchSpec): Promise<AttemptWorkspacePaths> {
    const launch = AttemptLaunchSpecSchema.parse(input);
    const root = await this.checkedAttemptRoot();
    const attemptRoot = await mkdtemp(join(root, `${launch.attemptId}-`));
    const claudeLoginHome = this.options.platform === 'macos' && launch.runtime === 'claude_cli'
      ? await this.auth.loginRoot()
      : undefined;
    const paths: AttemptWorkspacePaths = Object.freeze({
      root: attemptRoot,
      workspace: join(attemptRoot, 'workspace'),
      home: join(attemptRoot, 'home'),
      ...(claudeLoginHome ? { claudeLoginHome } : {}),
      codexHome: join(attemptRoot, 'codex-home'),
      claudeConfigDir: join(attemptRoot, 'claude-config'),
      mcpConfigPath: join(attemptRoot, 'mcp.json'),
      codexConfigPath: join(attemptRoot, 'codex-home', 'config.toml'),
    });
    await Promise.all([paths.workspace, paths.home, paths.codexHome, paths.claudeConfigDir].map((path) => mkdir(path, { mode: 0o700 })));
    await Promise.all([
      writeFile(paths.mcpConfigPath, JSON.stringify(claudeMcpConfig(launch.mcpUrl)), { mode: 0o600 }),
      writeFile(paths.codexConfigPath, codexMcpConfig(launch.mcpUrl), { mode: 0o600 }),
      writeFile(join(paths.claudeConfigDir, 'settings.json'), JSON.stringify({ disableAutoUpdates: true, enableAllProjectMcpServers: false }), { mode: 0o600 }),
    ]);
    return paths;
  }

  async linkProviderAuth(paths: AttemptWorkspacePaths, runtime: AgentCliRuntime): Promise<void> {
    if (runtime === 'claude_cli' && this.options.platform === 'macos') return;
    const reference = await this.auth.resolve(runtime);
    const target = join(runtime === 'codex_cli' ? paths.codexHome : paths.claudeConfigDir, reference.targetName);
    await this.auth.materialize(reference, target);
  }

  async remove(paths: AttemptWorkspacePaths): Promise<void> {
    const configured = await this.checkedAttemptRoot();
    const target = resolve(paths.root);
    const rel = relative(configured, target);
    if (!rel || rel.startsWith('..') || rel.includes('/..') || rel.includes('\\..')) throw new Error('runner_attempt_workspace_scope_invalid');
    const info = await lstat(target).catch(() => null);
    if (!info) return;
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('runner_attempt_workspace_symlink_rejected');
    await rm(target, { recursive: true, force: true, maxRetries: 2 });
  }

  private async checkedAttemptRoot(): Promise<string> {
    const guard = await this.attemptRootGuard;
    if (resolve(guard.canonicalPath) !== resolve(this.options.attemptRoot)) {
      throw new Error('runner_attempt_workspace_scope_invalid');
    }
    return guard.revalidate();
  }
}

function claudeMcpConfig(url: string): object {
  return { mcpServers: { kiditem_attempt: { type: 'http', url, headers: { Authorization: 'Bearer ${KIDITEM_ATTEMPT_MCP_TOKEN}' } } } };
}

function codexMcpConfig(url: string): string {
  return [
    'history.persistence = "none"',
    'web_search = "disabled"',
    'approval_policy = "never"',
    'default_permissions = ":workspace"',
    '',
    '[shell_environment_policy]',
    'exclude = ["KIDITEM_ATTEMPT_MCP_TOKEN"]',
    '',
    '[mcp_servers.kiditem_attempt]',
    `url = ${JSON.stringify(url)}`,
    'bearer_token_env_var = "KIDITEM_ATTEMPT_MCP_TOKEN"',
    'required = true',
    'startup_timeout_sec = 5',
    '',
  ].join('\n');
}
