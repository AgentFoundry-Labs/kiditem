import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  GATEWAY_RUNTIME_TRAIN,
  GatewayReadinessSchema,
  gatewayPlatformFromNodePlatform,
  ProviderReadinessSchema,
  type GatewayProviderReadiness,
  type ProviderReadiness,
  type ProviderRuntime,
} from '@kiditem/shared/agent-runtime';
import { loadGatewayConfig, readGatewayInstallationToken } from './config/gateway-config';
import { GatewayControlClient } from './control/gateway-control.client';
import { GatewayCommandDispatcher } from './control/gateway-command-dispatcher';
import { GatewayEventOutbox } from './control/gateway-event-outbox';
import { NativeGatewayControlSession } from './control/native-gateway-control-session';
import { ConversationDescriptorStore } from './conversation/conversation-descriptor.store';
import { ConversationGateway } from './conversation/conversation-gateway';
import { ConversationPreferenceStore } from './conversation/conversation-preference.store';
import { ClaudeConversationProvider } from './provider/claude-conversation.provider';
import { ClaudeMcpConfigStore } from './provider/claude-mcp-config';
import { NativeClaudeProcessLauncher } from './provider/claude-process-launcher';
import { ClaudeProviderSessionStore } from './provider/claude-session.store';
import { startCodexAppServer } from './provider/codex-app-server-process';
import { CodexConversationProvider } from './provider/codex-conversation.provider';
import { buildClaudeAuthStatusCommand } from './provider/claude-command';
import { gatewayProviderInvocation, providerEnvironment } from './provider/provider-command';
import type { ProviderConversationPort } from './provider/provider-conversation.port';
import type { CodexModelCapability } from './provider/codex-app-server-session';

const CLAUDE_MODELS = Object.freeze(['claude-opus-4-6', 'claude-sonnet-4-5']);
const CLAUDE_REASONING_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);

export async function runNativeAgentGateway(argv: readonly string[]): Promise<never> {
  const config = await loadGatewayConfig(argv);
  const token = await readGatewayInstallationToken(config.tokenFile);
  const platform = gatewayPlatformFromNodePlatform();
  await verifyGatewayRuntimePackages(config.runtimeRoot);
  const mcpUrl = `${config.controlOrigin}/internal/agent-runtime/mcp`;
  const [codexLoggedIn, claudeLoggedIn] = await Promise.all([
    verifyProviderLogin('codex_cli', config.runtimeRoot, config.loginRoot),
    verifyProviderLogin('claude_cli', config.runtimeRoot, config.loginRoot),
  ]);
  const mcpConfigs = new ClaudeMcpConfigStore({ stateRoot: config.stateRoot, platform });
  await mcpConfigs.cleanup();
  let codexProcess: Awaited<ReturnType<typeof startCodexAppServer>> | null = null;
  let codexReadiness: ProviderReadiness | null = null;
  if (codexLoggedIn) {
    let started: Awaited<ReturnType<typeof startCodexAppServer>> | null = null;
    try {
      started = await startCodexAppServer({ runtimeRoot: config.runtimeRoot, workspace: config.workspace, loginRoot: config.loginRoot, mcpUrl });
      codexReadiness = codexProviderReadiness(await started.session.modelCatalog());
      codexProcess = started;
    } catch {
      started?.close();
    }
  }
  const codex = codexProcess && codexReadiness
    ? new CodexConversationProvider({ session: codexProcess.session, readiness: codexReadiness })
    : new UnavailableProvider('codex_cli');
  const claudeSessions = new ClaudeProviderSessionStore({ loginRoot: config.loginRoot });
  const claude = claudeLoggedIn
    ? new ClaudeConversationProvider({
      runtimeRoot: config.runtimeRoot,
      workspace: config.workspace,
      loginRoot: config.loginRoot,
      mcpUrl,
      configs: mcpConfigs,
      launcher: new NativeClaudeProcessLauncher(),
      sessions: claudeSessions,
      readiness: claudeProviderReadiness(),
    })
    : new UnavailableProvider('claude_cli');
  const preferences = new ConversationPreferenceStore({ stateRoot: config.stateRoot, platform });
  const gateway = new ConversationGateway({
    descriptors: new ConversationDescriptorStore({ stateRoot: config.stateRoot, platform }),
    providers: { codex_cli: codex, claude_cli: claude },
  });
  const gatewayInstanceId = randomUUID();
  const outbox = new GatewayEventOutbox({ gatewayInstanceId, redactionTokens: [token] });
  outbox.enqueue({ kind: 'gateway.readiness', readiness: await gatewayReadiness([codex, claude]) });
  const dispatcher = new GatewayCommandDispatcher({ gateway, outbox, preferences });
  const client = new GatewayControlClient({ controlOrigin: config.controlOrigin, token });
  const control = new NativeGatewayControlSession({
    client,
    dispatcher,
    outbox,
    poll: { kind: 'poll', gatewayInstanceId, platform, runtimeTrain: GATEWAY_RUNTIME_TRAIN },
    onPollLoss: async () => {
      codexProcess?.close();
      if (claude instanceof ClaudeConversationProvider) await claude.close();
    },
  });
  const shutdown = (): void => { void control.shutdown().catch(() => undefined); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  try {
    return await control.run();
  } finally {
    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);
    await control.shutdown();
  }
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

/** Claude 2.1.245 documents these five exact effort values; no effort default exists. */
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

async function exactPackageVersion(runtimeRoot: string, packageName: string, expected: string): Promise<void> {
  let value: { version?: unknown };
  try { value = JSON.parse(await readFile(join(resolve(runtimeRoot), 'node_modules', packageName, 'package.json'), 'utf8')) as { version?: unknown }; }
  catch { throw new Error('gateway_provider_package_missing'); }
  if (value.version !== expected) throw new Error('gateway_provider_version_invalid');
}

/** Boolean-only provider login check; provider output and credential bytes never cross this boundary. */
async function verifyProviderLogin(runtime: ProviderRuntime, runtimeRoot: string, loginRoot: string): Promise<boolean> {
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
  return exitZero(command, 10_000);
}

function exitZero(command: Readonly<{ executable: string; args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv }>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolveStatus) => {
    let child: ReturnType<typeof spawn>;
    try { child = spawn(command.executable, [...command.args], { cwd: command.cwd, env: command.env, stdio: ['ignore', 'ignore', 'ignore'] }); }
    catch { resolveStatus(false); return; }
    let settled = false;
    const settle = (value: boolean): void => { if (!settled) { settled = true; resolveStatus(value); } };
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* exited */ } settle(false); }, timeoutMs);
    child.once('error', () => { clearTimeout(timer); settle(false); });
    child.once('close', (code) => { clearTimeout(timer); settle(code === 0); });
  });
}

class UnavailableProvider implements ProviderConversationPort {
  constructor(readonly runtime: ProviderRuntime) {}
  async list() { throw new Error('gateway_provider_unavailable'); }
  async create() { throw new Error('gateway_provider_unavailable'); }
  async history() { throw new Error('gateway_provider_unavailable'); }
  async rename() { throw new Error('gateway_provider_unavailable'); }
  async delete() { throw new Error('gateway_provider_unavailable'); }
  async startTurn() { throw new Error('gateway_provider_unavailable'); }
  async sendInput() { throw new Error('gateway_provider_unavailable'); }
  async interrupt() { throw new Error('gateway_provider_unavailable'); }
  async readiness(): Promise<ProviderReadiness> { throw new Error('gateway_provider_unavailable'); }
}

if (process.argv[1]?.endsWith('main.cjs')) {
  void runNativeAgentGateway(process.argv.slice(2)).catch(() => { process.exitCode = 1; });
}
