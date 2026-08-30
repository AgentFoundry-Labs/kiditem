import { existsSync, realpathSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { GATEWAY_RUNTIME_TRAIN } from '@kiditem/shared/agent-runtime';

export type GatewayProviderCommand = Readonly<{
  executable: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<NodeJS.ProcessEnv>;
}>;

export type GatewayProviderInvocation = Readonly<{
  executable: string;
  argsPrefix: readonly string[];
}>;

/** Resolves only bundled, pinned provider entrypoints owned by the Gateway. */
export function gatewayProviderEntrypoint(runtimeRoot: string, provider: 'codex' | 'claude'): string {
  const root = resolve(runtimeRoot);
  const candidates = provider === 'codex'
    ? ['node_modules/@openai/codex/bin/codex.js', 'node_modules/@openai/codex/bin/codex']
    : ['node_modules/@anthropic-ai/claude-code/bin/claude.exe', 'node_modules/@anthropic-ai/claude-code/cli.js'];
  const selected = candidates.find((candidate) => existsSync(resolve(root, candidate))) ?? candidates[0]!;
  const entrypoint = resolve(root, selected);
  const canonicalRoot = existsSync(root) ? realpathSync(root) : root;
  const canonicalEntrypoint = existsSync(entrypoint) ? realpathSync(entrypoint) : entrypoint;
  const rel = relative(canonicalRoot, canonicalEntrypoint);
  if (!rel || rel.startsWith('..') || rel.includes('/..') || rel.includes('\\..')) throw new Error('provider_entrypoint_outside_gateway');
  return canonicalEntrypoint;
}

/** JavaScript CLIs run under the exact packaged Node train; callers cannot set argv. */
export function gatewayProviderInvocation(runtimeRoot: string, provider: 'codex' | 'claude'): GatewayProviderInvocation {
  const entrypoint = gatewayProviderEntrypoint(runtimeRoot, provider);
  if (extname(entrypoint).toLocaleLowerCase('en-US') !== '.js') {
    if (process.platform === 'win32' && extname(entrypoint).toLocaleLowerCase('en-US') !== '.exe') throw new Error('provider_entrypoint_not_native');
    return Object.freeze({ executable: entrypoint, argsPrefix: Object.freeze([]) });
  }
  const nodeExecutable = resolve(process.execPath);
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);
  if (nodeMajor !== GATEWAY_RUNTIME_TRAIN.nodeMajor || !isAbsolute(process.execPath) || !existsSync(nodeExecutable)) {
    throw new Error('gateway_node_runtime_invalid');
  }
  return Object.freeze({ executable: nodeExecutable, argsPrefix: Object.freeze([entrypoint]) });
}

/** An explicit allowlist replaces the inherited process/shell environment. */
export function providerEnvironment(input: Readonly<{
  home: string;
  providerHome?: Readonly<{ key: 'CODEX_HOME' | 'CLAUDE_CONFIG_DIR'; path: string }>;
  includeMacosUserIdentity?: boolean;
}>): Readonly<NodeJS.ProcessEnv> {
  const user = process.env.USER?.trim();
  if (input.includeMacosUserIdentity && !user) throw new Error('provider_user_identity_required');
  return Object.freeze({
    PATH: process.env.PATH ?? '',
    HOME: input.home,
    ...(input.providerHome ? { [input.providerHome.key]: input.providerHome.path } : {}),
    ...(input.includeMacosUserIdentity ? { USER: user } : {}),
    CODEX_MCP_PROTOCOL_VERSION: GATEWAY_RUNTIME_TRAIN.mcpProtocolRevision,
    MCP_SDK_GENERATION: 'v2',
    MCP_PROTOCOL_NEGOTIATION: 'auto',
    CODEX_DISABLE_AUTO_UPDATE: '1',
    DISABLE_AUTOUPDATER: '1',
  });
}
