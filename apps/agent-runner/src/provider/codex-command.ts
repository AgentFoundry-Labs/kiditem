import type { AttemptLaunchSpec } from '@kiditem/shared/agent-runtime';
import type { AttemptWorkspacePaths } from '../attempt/attempt-workspace.service';
import { bundledProviderInvocation, providerEnvironment, type ProviderCommand } from './provider-command';

/** Builds the pinned Codex app-server command from Runner-owned paths only. */
export function buildCodexCommand(launch: AttemptLaunchSpec, paths: AttemptWorkspacePaths, runtimeRoot: string): ProviderCommand {
  if (!launch.model.trim()) throw new Error('missing_runtime_model');
  const invocation = bundledProviderInvocation(runtimeRoot, 'codex');
  return Object.freeze({
    executable: invocation.executable,
    args: Object.freeze([
      ...invocation.argsPrefix,
      'app-server', '--stdio', '--strict-config', '--disable', 'plugins',
      '--config', 'features.mcp_2026_07_28=true',
      '--config', `model=${JSON.stringify(launch.model)}`,
    ]),
    cwd: paths.workspace,
    env: providerEnvironment({
      home: paths.home,
      providerHome: { key: 'CODEX_HOME', path: paths.codexHome },
      attemptToken: launch.attemptToken,
    }),
  });
}
