import { existsSync, realpathSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';
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

type BundledProviderInvocation = Readonly<{
  executable: string;
  argsPrefix: readonly string[];
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
  const canonicalRoot = existsSync(root) ? realpathSync(root) : root;
  const canonicalEntrypoint = existsSync(entrypoint) ? realpathSync(entrypoint) : entrypoint;
  const rel = relative(canonicalRoot, canonicalEntrypoint);
  if (!rel || rel.startsWith('..') || rel.includes('/..') || rel.includes('\\..')) throw new Error('provider_entrypoint_outside_runner');
  return canonicalEntrypoint;
}

/**
 * Resolves the only structured launch shape that may cross the Windows Job
 * boundary. JavaScript package entrypoints are data to the fixed Node 22
 * executable, never CreateProcessW's lpApplicationName.
 */
export function bundledProviderInvocation(runtimeRoot: string, provider: 'codex' | 'claude'): BundledProviderInvocation {
  const entrypoint = bundledProviderEntrypoint(runtimeRoot, provider);
  if (extname(entrypoint).toLocaleLowerCase('en-US') !== '.js') {
    if (process.platform === 'win32' && extname(entrypoint).toLocaleLowerCase('en-US') !== '.exe') {
      throw new Error('provider_entrypoint_not_native');
    }
    return Object.freeze({ executable: entrypoint, argsPrefix: Object.freeze([]) });
  }
  const nodeExecutable = resolve(process.execPath);
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);
  if (nodeMajor !== ATTEMPT_RUNTIME_TRAIN.nodeMajor || !isAbsolute(process.execPath) || !existsSync(nodeExecutable)) {
    throw new Error('runner_node_runtime_invalid');
  }
  return Object.freeze({ executable: nodeExecutable, argsPrefix: Object.freeze([entrypoint]) });
}

/** Safe Windows-native fixture command that shares the production resolver. */
export function bundledProviderVersionProbe(runtimeRoot: string, provider: 'codex' | 'claude'): ProviderCommand {
  const invocation = bundledProviderInvocation(runtimeRoot, provider);
  return Object.freeze({
    executable: invocation.executable,
    args: Object.freeze([...invocation.argsPrefix, '--version']),
    cwd: resolve(runtimeRoot),
    env: Object.freeze({ PATH: process.env.PATH ?? '' }),
  });
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
