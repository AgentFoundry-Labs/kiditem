import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  GATEWAY_RUNTIME_TRAIN,
  GatewayReadinessSchema,
  ProviderReadinessSchema,
  type GatewayProviderReadiness,
  type ProviderReadiness,
  type ProviderRuntime,
} from '@kiditem/shared/agent-runtime';
import { ClaudeConversationProvider } from './claude/claude-conversation.provider';
import { buildClaudeAuthStatusCommand } from './claude/claude-command';
import { ClaudeMcpConfigStore } from './claude/claude-mcp-config';
import { NativeClaudeProcessLauncher } from './claude/claude-process-launcher';
import { ClaudeProviderSessionStore } from './claude/claude-session.store';
import { startCodexAppServer } from './codex/codex-app-server-process';
import { CodexConversationProvider } from './codex/codex-conversation.provider';
import type { CodexModelCapability } from './codex/codex-app-server-session';
import { createPlatformProcessSupervisor } from '../platform/platform-process-supervisor';
import type { ProcessSupervisor, SupervisedProcess } from '../platform/process-supervisor';
import { gatewayProviderInvocation, providerEnvironment } from './provider-command';
import type { ProviderConversationPort } from './provider-conversation.port';

// Current-generation Claude CLI models the Gateway may launch. Bump with the
// runtime train; replace the Opus entry with the Opus 5.5 ID once it ships.
const CLAUDE_MODELS = Object.freeze(['claude-opus-5', 'claude-sonnet-5']);
const CLAUDE_REASONING_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);

/**
 * The sole ProviderConversationPort assembly seam. Callers receive routing,
 * readiness projection, and one complete provider-tree close operation.
 */
export interface NativeProviderRuntime {
  readonly providers: Readonly<Record<ProviderRuntime, ProviderConversationPort>>;
  readiness(): Promise<GatewayProviderReadiness[]>;
  close(): Promise<void>;
}

export async function startNativeProviderRuntime(input: Readonly<{
  runtimeRoot: string;
  workspace: string;
  loginRoot: string;
  stateRoot: string;
  platform: 'macos' | 'windows';
  controlOrigin: string;
  mcpTransportToken: string;
  onFatal: (error: Error) => void;
}>): Promise<NativeProviderRuntime> {
  const supervisor = createPlatformProcessSupervisor({ platform: input.platform, runtimeRoot: input.runtimeRoot });
  await verifyGatewayRuntimePackages(input.runtimeRoot);
  const mcpUrl = `${input.controlOrigin}/internal/agent-runtime/mcp`;
  let codexLoggedIn: boolean;
  let claudeLoggedIn: boolean;
  try {
    [codexLoggedIn, claudeLoggedIn] = await Promise.all([
      verifyProviderLogin('codex_cli', input.runtimeRoot, input.loginRoot, supervisor),
      verifyProviderLogin('claude_cli', input.runtimeRoot, input.loginRoot, supervisor),
    ]);
  } catch (error) {
    await supervisor.shutdown().catch(() => undefined);
    throw error;
  }
  const mcpConfigs = new ClaudeMcpConfigStore({ stateRoot: input.stateRoot, platform: input.platform });
  await mcpConfigs.cleanup();
  let codexProcess: Awaited<ReturnType<typeof startCodexAppServer>> | null = null;
  let codexReadiness: ProviderReadiness | null = null;
  if (codexLoggedIn) {
    let started: Awaited<ReturnType<typeof startCodexAppServer>> | null = null;
    try {
      started = await startCodexAppServer({
        runtimeRoot: input.runtimeRoot,
        workspace: input.workspace,
        loginRoot: input.loginRoot,
        mcpUrl,
        mcpTransportToken: input.mcpTransportToken,
        supervisor,
        onFatal: input.onFatal,
      });
      codexReadiness = codexProviderReadiness(await started.session.modelCatalog());
      codexProcess = started;
    } catch {
      await started?.close();
    }
  }
  const codex: ProviderConversationPort = codexProcess && codexReadiness
    ? new CodexConversationProvider({ session: codexProcess.session, readiness: codexReadiness })
    : new UnavailableProvider('codex_cli');
  const claudeSessions = new ClaudeProviderSessionStore({ loginRoot: input.loginRoot });
  const claude: ProviderConversationPort = claudeLoggedIn
    ? new ClaudeConversationProvider({
      runtimeRoot: input.runtimeRoot,
      workspace: input.workspace,
      loginRoot: input.loginRoot,
      mcpUrl,
      mcpTransportToken: input.mcpTransportToken,
      configs: mcpConfigs,
      launcher: new NativeClaudeProcessLauncher({ supervisor, onFatal: input.onFatal }),
      sessions: claudeSessions,
      readiness: claudeProviderReadiness(),
    })
    : new UnavailableProvider('claude_cli');
  const providers: Readonly<Record<ProviderRuntime, ProviderConversationPort>> = {
    codex_cli: codex,
    claude_cli: claude,
  };
  const close = completeProviderTreeClose({ codexProcess, claude, supervisor });

  return {
    providers,
    readiness: () => gatewayReadiness([providers.codex_cli, providers.claude_cli]),
    close,
  };
}

/** Exact bundled package facts only—there is no runtime install or floating lookup. */
export async function verifyGatewayRuntimePackages(runtimeRoot: string): Promise<{ codex_cli: '0.149.1'; claude_cli: '2.1.245' }> {
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);
  if (nodeMajor !== GATEWAY_RUNTIME_TRAIN.nodeMajor) throw new Error('gateway_node_runtime_invalid');
  await exactPackageVersion(runtimeRoot, '@openai/codex', GATEWAY_RUNTIME_TRAIN.codexVersion);
  await exactPackageVersion(runtimeRoot, '@anthropic-ai/claude-code', GATEWAY_RUNTIME_TRAIN.claudeVersion);
  return { codex_cli: GATEWAY_RUNTIME_TRAIN.codexVersion, claude_cli: GATEWAY_RUNTIME_TRAIN.claudeVersion };
}

/** Codex model/list is the sole source for its model-to-effort support matrix. */
export function codexProviderReadiness(catalog: readonly CodexModelCapability[]): ProviderReadiness {
  if (!catalog.length || catalog.length > 100) throw new Error('gateway_codex_model_catalog_invalid');
  try {
    return ProviderReadinessSchema.parse({
      runtime: 'codex_cli',
      version: GATEWAY_RUNTIME_TRAIN.codexVersion,
      models: catalog.map((entry) => entry.model),
      reasoningEfforts: [...new Set(catalog.flatMap((entry) => entry.reasoningEfforts))],
      modelReasoningEfforts: catalog.map((entry) => ({ model: entry.model, reasoningEfforts: [...entry.reasoningEfforts] })),
      loginVerified: true,
      mcpProtocolRevision: GATEWAY_RUNTIME_TRAIN.mcpProtocolRevision,
    });
  } catch {
    throw new Error('gateway_codex_model_catalog_invalid');
  }
}

/** The Claude CLI accepts the five API effort levels; the Gateway sends one explicitly on every launch. */
export function claudeProviderReadiness(): ProviderReadiness {
  return ProviderReadinessSchema.parse({
    runtime: 'claude_cli',
    version: GATEWAY_RUNTIME_TRAIN.claudeVersion,
    models: [...CLAUDE_MODELS],
    reasoningEfforts: [...CLAUDE_REASONING_EFFORTS],
    modelReasoningEfforts: CLAUDE_MODELS.map((model) => ({ model, reasoningEfforts: [...CLAUDE_REASONING_EFFORTS] })),
    loginVerified: true,
    mcpProtocolRevision: GATEWAY_RUNTIME_TRAIN.mcpProtocolRevision,
  });
}

async function gatewayReadiness(providers: readonly ProviderConversationPort[]): Promise<GatewayProviderReadiness[]> {
  const entries = await Promise.all(providers.map(async (provider): Promise<GatewayProviderReadiness> => {
    try {
      return { runtime: provider.runtime, ready: true, readiness: await provider.readiness() };
    } catch {
      return { runtime: provider.runtime, ready: false, code: 'gateway_provider_unavailable' };
    }
  }));
  return GatewayReadinessSchema.parse(entries);
}

function completeProviderTreeClose(input: Readonly<{
  codexProcess: Awaited<ReturnType<typeof startCodexAppServer>> | null;
  claude: ProviderConversationPort;
  supervisor: ProcessSupervisor;
}>): () => Promise<void> {
  let closing: Promise<void> | null = null;
  return (): Promise<void> => {
    closing ??= (async () => {
      const results = await Promise.allSettled([
        ...(input.codexProcess ? [input.codexProcess.close()] : []),
        ...(input.claude instanceof ClaudeConversationProvider ? [input.claude.close()] : []),
      ]);
      const failures = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
      try { await input.supervisor.shutdown(); }
      catch (error) { failures.push(error); }
      if (failures.length) throw new AggregateError(failures, 'gateway_provider_tree_shutdown_failed');
    })();
    return closing;
  };
}

async function exactPackageVersion(runtimeRoot: string, packageName: string, expected: string): Promise<void> {
  let value: { version?: unknown };
  try { value = JSON.parse(await readFile(join(resolve(runtimeRoot), 'node_modules', packageName, 'package.json'), 'utf8')) as { version?: unknown }; }
  catch { throw new Error('gateway_provider_package_missing'); }
  if (value.version !== expected) throw new Error('gateway_provider_version_invalid');
}

/** Boolean-only provider login check; provider output and credential bytes never cross this Module. */
export async function verifyProviderLogin(
  runtime: ProviderRuntime,
  runtimeRoot: string,
  loginRoot: string,
  supervisor: ProcessSupervisor,
): Promise<boolean> {
  const command = runtime === 'codex_cli'
    ? (() => {
      const invocation = gatewayProviderInvocation(runtimeRoot, 'codex');
      return {
        executable: invocation.executable,
        args: [...invocation.argsPrefix, 'login', 'status'],
        cwd: runtimeRoot,
        env: providerEnvironment({ home: loginRoot, providerHome: { key: 'CODEX_HOME', path: join(loginRoot, '.codex') }, ...(process.platform === 'darwin' ? { includeMacosUserIdentity: true } : {}) }),
      };
    })()
    : buildClaudeAuthStatusCommand(runtimeRoot, loginRoot);
  return exitZero(command, supervisor, 10_000);
}

async function exitZero(
  command: Readonly<{ executable: string; args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv }>,
  supervisor: ProcessSupervisor,
  timeoutMs: number,
): Promise<boolean> {
  let process: SupervisedProcess;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  let resolveStatus!: (value: boolean) => void;
  let rejectStatus!: (error: Error) => void;
  const result = new Promise<boolean>((resolveStatusValue, rejectStatusValue) => {
    resolveStatus = resolveStatusValue;
    rejectStatus = rejectStatusValue;
  });
  const settle = (value: boolean): void => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    resolveStatus(value);
  };
  const fail = (error: Error): void => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    rejectStatus(error);
  };
  try {
    process = await supervisor.launch(command, {
      onExit: (exit) => settle(exit.code === 0),
      onFatal: fail,
    });
  } catch {
    return false;
  }
  if (!settled) {
    timer = setTimeout(() => {
      void process.terminate().then(() => settle(false), (error) => fail(error instanceof Error ? error : new Error('gateway_login_tree_termination_failed')));
    }, timeoutMs);
    timer.unref();
  }
  return result;
}

class UnavailableProvider implements ProviderConversationPort {
  constructor(readonly runtime: ProviderRuntime) {}
  async list() { throw new Error('gateway_provider_unavailable'); }
  async create() { throw new Error('gateway_provider_unavailable'); }
  async rename() { throw new Error('gateway_provider_unavailable'); }
  async delete() { throw new Error('gateway_provider_unavailable'); }
  async startTurn() { throw new Error('gateway_provider_unavailable'); }
  async interrupt() { throw new Error('gateway_provider_unavailable'); }
  async readiness(): Promise<ProviderReadiness> { throw new Error('gateway_provider_unavailable'); }
}
