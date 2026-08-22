import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import type {
  AgentDurableRuntimeAdapter,
  AgentDurableRuntimeExecutionContext,
  AgentSessionRuntimeCleanupInput,
  AgentSessionRuntimeCleanupResult,
  DurableRuntimeAdapterEvent,
  RuntimeHandle,
  RuntimeInspection,
  RuntimeInterruptInput,
} from '../../../application/port/out/runtime/agent-durable-runtime.port';
import type { RuntimeHandleCipher } from './runtime-handle-cipher';
import {
  parseRunScopedMcpConfig,
  type RunScopedMcpConfig,
} from './run-scoped-mcp-config';
import type { IsolatedCliFilesystemPort } from '../../../application/port/out/runtime/isolated-cli-filesystem.port';

export interface IsolatedCliFilesystem extends IsolatedCliFilesystemPort {
  mkdir(path: string, options: { recursive: true; mode: number }): Promise<unknown>;
  writeFile(path: string, value: string, options: { encoding: 'utf8'; mode: number }): Promise<unknown>;
  chmod(path: string, mode: number): Promise<unknown>;
}

export interface IsolatedCliStartRequest {
  binary: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  prompt: string;
}

export interface IsolatedCliProcessHandle {
  nativeSessionId: string;
  pid: number;
  processStartIdentity: string;
  reconnectSecret: string;
  generation: number;
}

export interface IsolatedCliNativeHandle extends IsolatedCliProcessHandle {
  executableVersion: string;
  organizationId: string;
  sessionId: string;
  startIntentId: string;
  runtimeCredentialGeneration: number;
  mcpToolSet: {
    schemaVersion: 1;
    servers: Array<{ key: string; tools: string[] }>;
  };
}

export interface IsolatedCliTransport {
  probeVersion(binary: string): Promise<string>;
  start(request: IsolatedCliStartRequest): Promise<IsolatedCliProcessHandle>;
  connect(handle: IsolatedCliNativeHandle, resume: { binary: string; args: string[]; cwd: string; env: Record<string, string> }): AsyncIterable<DurableRuntimeAdapterEvent>;
  inspect(handle: IsolatedCliNativeHandle): Promise<RuntimeInspection>;
  interrupt(handle: IsolatedCliNativeHandle, input: RuntimeInterruptInput): Promise<void>;
  cancel(handle: IsolatedCliNativeHandle): Promise<void>;
  readProcessStartIdentity(pid: number): Promise<string | null>;
  superviseStartIntent(input: IsolatedCliStartIntent): Promise<void>;
  inspectStartIntent(input: IsolatedCliStartIntent): Promise<RuntimeInspection>;
  cancelStartIntent(input: IsolatedCliStartIntent): Promise<void>;
  revokeStartIntent(input: IsolatedCliStartIntent): Promise<void>;
}

export interface IsolatedCliStartIntent {
  organizationId: string;
  sessionId: string;
  executionId: string;
  attemptId: string;
  startIntentId: string;
}

export interface IsolatedCliRuntimeOptions {
  runtimeType: string;
  binary: string;
  allowedBinary: string;
  versionPattern: RegExp;
  startArgs: string[];
  resumeArgs: string[];
  filesystem: IsolatedCliFilesystem;
  transport: IsolatedCliTransport;
  runRoot?: string;
  handleCipher: RuntimeHandleCipher;
  runtimeCredential(scope: RuntimeCredentialScope): string;
  mcpConfig(context: AgentDurableRuntimeExecutionContext): RunScopedMcpConfig;
  ambientEnv?: Record<string, string | undefined>;
}

export interface RuntimeCredentialScope {
  organizationId: string;
  sessionId: string;
  executionId: string;
  attemptId: string;
  startIntentId: string;
  runtimeCredentialGeneration: number;
}

export const DEFAULT_ISOLATED_CLI_RUN_ROOT = '/var/lib/kiditem-agent-runs';

export function isolatedCliRunRootFromEnvironment(
  env: Readonly<NodeJS.ProcessEnv> = process.env,
): string {
  return parseRunRoot(
    env.AGENT_DURABLE_RUNTIME_RUN_ROOT?.trim() ||
      DEFAULT_ISOLATED_CLI_RUN_ROOT,
  );
}

const mcpToolSetSchema = z.object({
  schemaVersion: z.literal(1),
  servers: z.array(z.object({
    key: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    tools: z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,127}$/)).max(100),
  }).strict()).max(20),
}).strict();

const nativeHandleSchema = z.object({
  reconnectSecret: z.string().min(1).max(4_096),
  nativeSessionId: z.string().min(1).max(512),
  pid: z.number().int().positive(),
  processStartIdentity: z.string().min(1).max(512),
  executableVersion: z.string().min(1).max(512),
  organizationId: z.string().min(1).max(128),
  sessionId: z.string().uuid(),
  startIntentId: z.string().uuid(),
  runtimeCredentialGeneration: z.number().int().nonnegative(),
  mcpToolSet: mcpToolSetSchema,
}).strict();

const SAFE_AMBIENT_ENV = new Set(['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TZ']);
const runtimeCredentialSchema = z.string().min(1).max(4_096);

export class IsolatedCliRuntimeAdapter implements AgentDurableRuntimeAdapter {
  readonly runtimeType: string;
  readonly capabilities = {
    detached: true, reconnect: true, interrupt: true, cancel: true, inspect: true,
  } as const;
  private readonly runRoot: string;
  private readyVersion: string | null = null;
  private readonly cancellations = new Map<string, Promise<void>>();

  constructor(protected readonly options: IsolatedCliRuntimeOptions) {
    this.runtimeType = z.string().min(1).max(128).parse(options.runtimeType);
    if (
      options.binary !== options.allowedBinary ||
      options.binary.includes('/') ||
      !/^[a-z][a-z0-9_-]*$/.test(options.binary)
    ) throw new Error('CLI_RUNTIME_BINARY_NOT_ALLOWLISTED');
    if (options.startArgs.some(isUnsafeArgument) || options.resumeArgs.some(isUnsafeArgument)) {
      throw new Error('CLI_RUNTIME_ARGUMENT_FORBIDDEN');
    }
    this.runRoot = parseRunRoot(
      options.runRoot ?? isolatedCliRunRootFromEnvironment(),
    );
  }

  command(): { binary: string; startArgs: string[]; resumeArgs: string[] } {
    return {
      binary: this.options.binary,
      startArgs: [...this.options.startArgs],
      resumeArgs: [...this.options.resumeArgs],
    };
  }

  async assertReady(): Promise<void> {
    const version = z.string().min(1).max(512).parse(
      await this.options.transport.probeVersion(this.options.binary),
    );
    this.options.versionPattern.lastIndex = 0;
    if (!this.options.versionPattern.test(version)) {
      this.readyVersion = null;
      throw new Error(`CLI_RUNTIME_VERSION_INCOMPATIBLE: ${this.runtimeType}`);
    }
    this.readyVersion = version;
  }

  async start(context: AgentDurableRuntimeExecutionContext): Promise<RuntimeHandle> {
    if (!this.readyVersion) throw new Error(`CLI_RUNTIME_NOT_READY: ${this.runtimeType}`);
    if (context.runtimeType !== this.runtimeType) throw new Error('RUNTIME_CONTEXT_TYPE_MISMATCH');
    if (!context.startIntentId || context.runtimeCredentialGeneration === undefined) {
      throw new Error('RUNTIME_START_AUTHORITY_REQUIRED');
    }
    const paths = await this.prepareRunDirectories(context.executionId, context.attemptId);
    const credential = runtimeCredentialSchema.parse(this.options.runtimeCredential({
      organizationId: context.organizationId,
      sessionId: context.sessionId,
      executionId: context.executionId,
      attemptId: context.attemptId,
      startIntentId: context.startIntentId,
      runtimeCredentialGeneration: context.runtimeCredentialGeneration,
    }));
    const mcpConfig = parseRunScopedMcpConfig(this.options.mcpConfig(context));
    await this.writeOwnerOnly(
      paths.mcpConfig,
      JSON.stringify(mcpConfig),
    );
    const startIntent = exactStartIntent(context);
    await this.writeOwnerOnly(paths.startIntent, JSON.stringify(startIntent));
    await this.options.transport.superviseStartIntent(startIntent);
    const env = this.childEnvironment(paths.home, paths.mcpConfig, credential, context.startIntentId);
    const started = await this.options.transport.start({
      binary: this.options.binary,
      args: [...this.options.startArgs],
      cwd: paths.work,
      env,
      prompt: context.promptPackage.prompt,
    });
    const native = nativeHandleSchema.parse({
      reconnectSecret: started.reconnectSecret,
      nativeSessionId: started.nativeSessionId,
      pid: started.pid,
      processStartIdentity: started.processStartIdentity,
      executableVersion: this.readyVersion,
      organizationId: context.organizationId,
      sessionId: context.sessionId,
      startIntentId: context.startIntentId,
      runtimeCredentialGeneration: context.runtimeCredentialGeneration,
      mcpToolSet: snapshotMcpToolSet(mcpConfig),
    });
    const encryptedHandleRef = this.options.handleCipher.encrypt(JSON.stringify(native));
    const handle: RuntimeHandle = {
      runtimeType: this.runtimeType,
      executionId: context.executionId,
      attemptId: context.attemptId,
      externalRunId: native.nativeSessionId,
      encryptedHandleRef,
      generation: z.number().int().nonnegative().parse(started.generation),
    };
    await this.writeOwnerOnly(
      paths.state,
      JSON.stringify({
        runtimeType: handle.runtimeType,
        executionId: handle.executionId,
        attemptId: handle.attemptId,
        nativeSessionId: handle.externalRunId,
        pid: native.pid,
        processStartIdentity: native.processStartIdentity,
        executableVersion: native.executableVersion,
        generation: handle.generation,
        startIntentId: context.startIntentId,
        encryptedHandleRef,
      }),
    );
    return handle;
  }

  async *connect(handle: RuntimeHandle): AsyncIterable<DurableRuntimeAdapterEvent> {
    const native = await this.validatedNativeHandle(handle);
    const paths = await this.prepareRunDirectories(
      handle.executionId,
      handle.attemptId,
    );
    const credential = runtimeCredentialSchema.parse(this.options.runtimeCredential({
      organizationId: native.organizationId, sessionId: native.sessionId, executionId: handle.executionId,
      attemptId: handle.attemptId, startIntentId: native.startIntentId,
      runtimeCredentialGeneration: native.runtimeCredentialGeneration,
    }));
    await this.writeOwnerOnly(
      paths.mcpConfig,
      JSON.stringify(hydrateMcpConfig(native.mcpToolSet, credential)),
    );
    const env = this.childEnvironment(paths.home, paths.mcpConfig, credential, native.startIntentId);
    for await (const event of this.options.transport.connect(native, {
      binary: this.options.binary,
      args: [...this.options.resumeArgs, native.nativeSessionId],
      cwd: paths.work,
      env,
    })) yield event;
  }

  async inspect(handle: RuntimeHandle): Promise<RuntimeInspection> {
    return this.options.transport.inspect(await this.validatedNativeHandle(handle));
  }

  async interrupt(handle: RuntimeHandle, input: RuntimeInterruptInput): Promise<void> {
    await this.options.transport.interrupt(await this.validatedNativeHandle(handle), input);
  }

  cancel(handle: RuntimeHandle): Promise<void> {
    const key = `${handle.executionId}:${handle.attemptId}:${handle.generation}`;
    const existing = this.cancellations.get(key);
    if (existing) return existing;
    const pending = this.cancelVerified(handle);
    this.cancellations.set(key, pending);
    return pending;
  }

  async cleanup(input: AgentSessionRuntimeCleanupInput): Promise<AgentSessionRuntimeCleanupResult> {
    if (!this.hasExactCleanupAuthority(input)) return unknownCleanup();
    const startIntent = cleanupStartIntent(input);
    try {
      let inspection = await this.options.transport.inspectStartIntent(startIntent);
      if (inspection.status === 'running') {
        await this.options.transport.cancelStartIntent(startIntent);
        inspection = await this.options.transport.inspectStartIntent(startIntent);
      }
      await this.options.transport.revokeStartIntent(startIntent);
      if (inspection.status === 'running' || inspection.status === 'unknown') return unknownCleanup();
      const scoped = { executionId: input.executionId, attemptId: input.attemptId };
      const owned = await this.options.filesystem.exists(scoped);
      if (owned) {
        await this.options.filesystem.removeTree(scoped);
        if (await this.options.filesystem.exists(scoped)) return unknownCleanup();
      }
      return {
        state: 'clean',
        executionAuthority: 'process_exited',
        credentials: 'irrevocably_revoked',
        handle: 'removed',
        filesystem: owned ? 'removed' : 'not_owned',
      };
    } catch {
      return unknownCleanup();
    }
  }

  private async cancelVerified(handle: RuntimeHandle): Promise<void> {
    const native = await this.validatedNativeHandle(handle);
    await this.options.transport.cancel(native);
  }

  private async validatedNativeHandle(handle: RuntimeHandle): Promise<IsolatedCliNativeHandle> {
    if (handle.runtimeType !== this.runtimeType) throw new Error('RUNTIME_HANDLE_TYPE_MISMATCH');
    if (!this.readyVersion) await this.assertReady();
    const readyVersion = this.readyVersion;
    if (!readyVersion) throw new Error(`CLI_RUNTIME_NOT_READY: ${this.runtimeType}`);
    const raw = this.options.handleCipher.decrypt(handle.encryptedHandleRef);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('CLI_RUNTIME_HANDLE_INVALID');
    }
    const native = nativeHandleSchema.parse(parsed);
    if (native.nativeSessionId !== handle.externalRunId) throw new Error('CLI_RUNTIME_HANDLE_CORRELATION_INVALID');
    if (native.executableVersion !== readyVersion) {
      throw new Error(`CLI_RUNTIME_VERSION_CHANGED: ${this.runtimeType}`);
    }
    const currentIdentity = await this.options.transport.readProcessStartIdentity(native.pid);
    if (currentIdentity !== native.processStartIdentity) throw new Error('CLI_PROCESS_IDENTITY_MISMATCH');
    return { ...native, generation: handle.generation };
  }

  private async prepareRunDirectories(executionId: string, attemptId: string) {
    const paths = this.paths(executionId, attemptId);
    for (const path of [
      paths.root,
      paths.home,
      paths.configHome,
      paths.work,
      paths.stateDirectory,
    ]) {
      await this.options.filesystem.mkdir(path, { recursive: true, mode: 0o700 });
      await this.options.filesystem.chmod(path, 0o700);
    }
    return paths;
  }

  private paths(executionId: string, attemptId: string) {
    const segment = z.string().uuid();
    const root = join(this.runRoot, segment.parse(executionId), segment.parse(attemptId));
    return {
      root,
      home: join(root, 'home'),
      configHome: join(root, 'home', '.config'),
      work: join(root, 'work'),
      stateDirectory: join(root, 'state'),
      mcpConfig: join(root, 'state', 'mcp.json'),
      state: join(root, 'state', 'runtime.json'),
      startIntent: join(root, 'state', 'start-intent.json'),
    };
  }

  private childEnvironment(home: string, mcpConfigPath: string, credential: string, startIntentId: string) {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.options.ambientEnv ?? process.env)) {
      if (SAFE_AMBIENT_ENV.has(key) && typeof value === 'string') env[key] = value;
    }
    return {
      ...env,
      HOME: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      KIDITEM_RUNTIME_CREDENTIAL: credential,
      KIDITEM_MCP_CONFIG: mcpConfigPath,
      KIDITEM_RUNTIME_START_INTENT: startIntentId,
    };
  }

  private async writeOwnerOnly(path: string, value: string): Promise<void> {
    await this.options.filesystem.writeFile(path, value, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await this.options.filesystem.chmod(path, 0o600);
  }

  private hasExactCleanupAuthority(input: AgentSessionRuntimeCleanupInput): boolean {
    if (input.runtimeType !== this.runtimeType) return false;
    try {
      z.string().uuid().parse(input.executionId);
      z.string().uuid().parse(input.attemptId);
      z.string().uuid().parse(input.startIntentId);
    } catch {
      return false;
    }
    return !input.handle || (
      input.handle.runtimeType === this.runtimeType
      && input.handle.executionId === input.executionId
      && input.handle.attemptId === input.attemptId
    );
  }
}

function exactStartIntent(context: AgentDurableRuntimeExecutionContext): IsolatedCliStartIntent {
  return {
    organizationId: context.organizationId,
    sessionId: context.sessionId,
    executionId: context.executionId,
    attemptId: context.attemptId,
    startIntentId: context.startIntentId,
  };
}

function cleanupStartIntent(input: AgentSessionRuntimeCleanupInput): IsolatedCliStartIntent {
  return {
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    executionId: input.executionId,
    attemptId: input.attemptId,
    startIntentId: input.startIntentId,
  };
}

function unknownCleanup(): AgentSessionRuntimeCleanupResult {
  return { state: 'unknown', code: 'RUNTIME_CLEANUP_UNKNOWN' };
}

function snapshotMcpToolSet(config: RunScopedMcpConfig) {
  return mcpToolSetSchema.parse({
    schemaVersion: config.schemaVersion,
    servers: config.servers.map((server) => ({
      key: server.key,
      tools: [...server.tools],
    })),
  });
}

function hydrateMcpConfig(
  toolSet: z.infer<typeof mcpToolSetSchema>,
  credential: string,
): RunScopedMcpConfig {
  return {
    schemaVersion: toolSet.schemaVersion,
    servers: toolSet.servers.map((server) => ({
      key: server.key,
      credential,
      tools: [...server.tools],
    })),
  };
}

function parseRunRoot(value: string): string {
  if (!isAbsolute(value) || value.includes('\u0000')) {
    throw new Error('CLI_RUNTIME_RUN_ROOT_INVALID');
  }
  const normalized = resolve(value);
  if (normalized === '/') throw new Error('CLI_RUNTIME_RUN_ROOT_INVALID');
  return normalized;
}

function isUnsafeArgument(value: string): boolean {
  return /(?:--yolo|dangerously-skip|permission-mode|approval.*(?:off|never)|--config(?:=|$)|--mcp)/i.test(value);
}
