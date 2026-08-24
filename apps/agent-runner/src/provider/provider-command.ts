import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { AttemptLaunchSpecSchema, ATTEMPT_RUNTIME_TRAIN, type AttemptLaunchSpec } from '@kiditem/shared/agent-runtime';
import type { AttemptWorkspacePaths } from '../attempt/attempt-workspace.service';
import { buildClaudeCommand } from './claude-command';
import { buildCodexCommand } from './codex-command';

export type ProviderCommand = Readonly<{
  executable: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<NodeJS.ProcessEnv>;
}>;

/** The only provider command factory; Nest cannot choose executable/args/cwd/env. */
export function buildProviderCommand(launchInput: AttemptLaunchSpec, paths: AttemptWorkspacePaths, runtimeRoot: string): ProviderCommand {
  const launch = AttemptLaunchSpecSchema.parse(launchInput);
  if (
    launch.mcpProtocolRevision !== ATTEMPT_RUNTIME_TRAIN.mcpProtocolRevision ||
    launch.cliContractIdentity !== ATTEMPT_RUNTIME_TRAIN.cliContractIdentity ||
    launch.workspacePolicy !== 'empty_ephemeral_v1'
  ) throw new Error('provider_launch_contract_invalid');
  return launch.runtime === 'codex_cli'
    ? buildCodexCommand(launch, paths, runtimeRoot)
    : buildClaudeCommand(launch, paths, runtimeRoot);
}

export function bundledProviderEntrypoint(runtimeRoot: string, provider: 'codex' | 'claude'): string {
  const root = resolve(runtimeRoot);
  const candidates = provider === 'codex'
    ? ['node_modules/@openai/codex/bin/codex.js', 'node_modules/@openai/codex/bin/codex']
    : ['node_modules/@anthropic-ai/claude-code/bin/claude.exe', 'node_modules/@anthropic-ai/claude-code/cli.js'];
  const selected = candidates.find((candidate) => existsSync(resolve(root, candidate))) ?? candidates[0]!;
  const entrypoint = resolve(root, selected);
  const rel = relative(root, entrypoint);
  if (!rel || rel.startsWith('..') || rel.includes('/..') || rel.includes('\\..')) throw new Error('provider_entrypoint_outside_runner');
  return entrypoint;
}

export function providerEnvironment(input: { home: string; providerHomeKey: 'CODEX_HOME' | 'CLAUDE_CONFIG_DIR'; providerHome: string; attemptToken: string; extra?: NodeJS.ProcessEnv }): Readonly<NodeJS.ProcessEnv> {
  return Object.freeze({
    PATH: process.env.PATH ?? '',
    HOME: input.home,
    [input.providerHomeKey]: input.providerHome,
    KIDITEM_ATTEMPT_MCP_TOKEN: input.attemptToken,
    CODEX_MCP_PROTOCOL_VERSION: ATTEMPT_RUNTIME_TRAIN.mcpProtocolRevision,
    MCP_SDK_GENERATION: 'v2',
    MCP_PROTOCOL_NEGOTIATION: 'auto',
    CODEX_DISABLE_AUTO_UPDATE: '1',
    DISABLE_AUTOUPDATER: '1',
    ...(input.extra ?? {}),
  });
}
