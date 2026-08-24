import type { AttemptLaunchSpec } from '@kiditem/shared/agent-runtime';
import type { AttemptWorkspacePaths } from '../attempt/attempt-workspace.service';
import { bundledProviderEntrypoint, providerEnvironment, type ProviderCommand } from './provider-command';

/** Builds the pinned Codex app-server command from Runner-owned paths only. */
export function buildCodexCommand(launch: AttemptLaunchSpec, paths: AttemptWorkspacePaths, runtimeRoot: string): ProviderCommand {
  if (!launch.model.trim()) throw new Error('missing_runtime_model');
  return Object.freeze({
    executable: bundledProviderEntrypoint(runtimeRoot, 'codex'),
    args: Object.freeze([
      'app-server', '--stdio', '--strict-config', '--disable', 'plugins',
      '--config', 'features.mcp_2026_07_28=true',
      '--config', `model=${JSON.stringify(launch.model)}`,
    ]),
    cwd: paths.workspace,
    env: providerEnvironment({ home: paths.home, providerHomeKey: 'CODEX_HOME', providerHome: paths.codexHome, attemptToken: launch.attemptToken }),
  });
}
