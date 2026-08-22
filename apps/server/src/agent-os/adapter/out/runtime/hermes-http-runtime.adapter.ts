import { z } from 'zod';
import type {
  AgentDurableRuntimeAdapter,
  AgentDurableRuntimeExecutionContext,
  DurableRuntimeAdapterEvent,
  RuntimeHandle,
  RuntimeInspection,
  RuntimeInterruptInput,
} from '../../../application/port/out/runtime/agent-durable-runtime.port';
import { CanonicalResourceRefSchema } from '@kiditem/shared/agent-interaction';
import { MAX_AGENT_SESSION_ARTIFACT_BYTES as maxArtifactBytes } from '../../../application/port/out/runtime/agent-durable-runtime.port';
import type { RuntimeHandleCipher } from './runtime-handle-cipher';
import type { RuntimeCredentialBroker } from './runtime-credential-broker';
import {
  buildRunScopedMcpConfig,
  type RegisteredMcpTool,
  type RunScopedMcpConfig,
} from './run-scoped-mcp-config';

export type HermesProviderItem =
  | { type: 'text_delta'; content: string }
  | { type: 'progress'; progress: number; label: string }
  | { type: 'interrupt'; interruptId: string; payload: Record<string, unknown> }
  | {
      type: 'artifact_candidate';
      externalArtifactId: string;
      artifactType: string;
      label: string;
      contentBase64: string;
      mimeType: string;
      sha256: string;
      navigationActionId: string;
      metadata?: Record<string, unknown>;
    }
  | { type: 'resource_ref'; resource: unknown }
  | { type: 'terminal'; status: 'completed' | 'failed' | 'cancelled'; output?: Record<string, unknown>; errorCode?: string };

export interface HermesRuntimeTransport {
  start(input: {
    context: AgentDurableRuntimeExecutionContext;
    mcpConfig: RunScopedMcpConfig;
    credentialExpiresAt: string;
  }): Promise<{ externalRunId: string; reconnectSecret: string; generation: number }>;
  connect(input: { externalRunId: string; reconnectSecret: string; generation: number }): AsyncIterable<HermesProviderItem>;
  inspect(input: { externalRunId: string; reconnectSecret: string; generation: number }): Promise<RuntimeInspection>;
  interrupt(input: { externalRunId: string; reconnectSecret: string; generation: number; interrupt: RuntimeInterruptInput }): Promise<void>;
  cancel(input: { externalRunId: string; reconnectSecret: string; generation: number }): Promise<void>;
}

export interface HermesFetchRuntimeTransportOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}

export interface HermesRuntimeAdapterOptions {
  transport: HermesRuntimeTransport;
  credentialBroker: RuntimeCredentialBroker;
  handleCipher: RuntimeHandleCipher;
  toolRegistry: ReadonlyMap<string, RegisteredMcpTool>;
  unsafeOptions?: unknown;
}

const providerItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text_delta'), content: z.string().max(100_000) }).strict(),
  z.object({ type: z.literal('progress'), progress: z.number().min(0).max(1), label: z.string().min(1).max(500) }).strict(),
  z.object({ type: z.literal('interrupt'), interruptId: z.string().min(1).max(256), payload: z.record(z.string(), z.unknown()) }).strict(),
  z.object({
    type: z.literal('artifact_candidate'),
    externalArtifactId: z.string().min(1).max(256),
    artifactType: z.string().min(1).max(128),
    label: z.string().min(1).max(500),
    contentBase64: z.string().base64().max(22_369_624),
    mimeType: z.string().min(1).max(128),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    navigationActionId: z.string().uuid(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  }).strict(),
  z.object({ type: z.literal('resource_ref'), resource: CanonicalResourceRefSchema }).strict(),
  z.object({ type: z.literal('terminal'), status: z.enum(['completed', 'failed', 'cancelled']), output: z.record(z.string(), z.unknown()).optional(), errorCode: z.string().min(1).max(256).optional() }).strict(),
]);

const startResponseSchema = z.object({
  externalRunId: z.string().min(1).max(512),
  reconnectSecret: z.string().min(1).max(4_096),
  generation: z.number().int().nonnegative(),
}).strict();

const inspectionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('running') }).strict(),
  z.object({ status: z.literal('completed'), output: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ status: z.literal('cancelled') }).strict(),
  z.object({ status: z.literal('unknown') }).strict(),
]);

/**
 * Narrow HTTP bridge for an explicitly deployed Hermes control plane. It does
 * not discover endpoints or forward organization/policy identifiers. A
 * configured base URL is the only external authority surface.
 */
export class HermesFetchRuntimeTransport implements HermesRuntimeTransport {
  private readonly baseUrl: URL;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: HermesFetchRuntimeTransportOptions) {
    try {
      this.baseUrl = new URL(options.baseUrl);
    } catch {
      throw new Error('HERMES_RUNTIME_BASE_URL_INVALID');
    }
    if (!['https:', 'http:'].includes(this.baseUrl.protocol)) {
      throw new Error('HERMES_RUNTIME_BASE_URL_INVALID');
    }
    if (
      this.baseUrl.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(this.baseUrl.hostname)
    ) {
      throw new Error('HERMES_RUNTIME_BASE_URL_INSECURE');
    }
    if (!this.baseUrl.pathname.endsWith('/')) {
      this.baseUrl.pathname = `${this.baseUrl.pathname}/`;
    }
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async start(input: {
    context: AgentDurableRuntimeExecutionContext;
    mcpConfig: RunScopedMcpConfig;
    credentialExpiresAt: string;
  }): Promise<{ externalRunId: string; reconnectSecret: string; generation: number }> {
    const response = await this.request('runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        execution: {
          id: input.context.executionId,
          attemptId: input.context.attemptId,
          agentDefinitionKey: input.context.agentDefinitionKey,
          agentVersionId: input.context.agentVersionId,
          runtimeType: input.context.runtimeType,
          modelIdentity: input.context.modelIdentity,
        },
        promptPackage: input.context.promptPackage,
        conversationView: input.context.conversationView,
        currentInput: input.context.currentInput,
        currentResourceRefs: input.context.currentResourceRefs,
        mcpConfig: input.mcpConfig,
        credentialExpiresAt: input.credentialExpiresAt,
      }),
    });
    return startResponseSchema.parse(await json(response));
  }

  async *connect(input: {
    externalRunId: string;
    reconnectSecret: string;
    generation: number;
  }): AsyncIterable<HermesProviderItem> {
    const response = await this.request(
      `runs/${encodeURIComponent(input.externalRunId)}/events?generation=${input.generation}`,
      { headers: reconnectHeaders(input.reconnectSecret) },
    );
    if (!response.body) throw new Error('HERMES_RUNTIME_STREAM_MISSING');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let remainder = '';
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        remainder += decoder.decode(next.value, { stream: true });
        const lines = remainder.split(/\r?\n/);
        remainder = lines.pop() ?? '';
        for (const line of lines) {
          const parsed = parseStreamLine(line);
          if (parsed) yield providerItemSchema.parse(parsed);
        }
      }
      const trailing = parseStreamLine(remainder + decoder.decode());
      if (trailing) yield providerItemSchema.parse(trailing);
    } finally {
      reader.releaseLock();
    }
  }

  async inspect(input: {
    externalRunId: string;
    reconnectSecret: string;
    generation: number;
  }): Promise<RuntimeInspection> {
    const response = await this.request(
      `runs/${encodeURIComponent(input.externalRunId)}?generation=${input.generation}`,
      { headers: reconnectHeaders(input.reconnectSecret) },
    );
    return inspectionSchema.parse(await json(response));
  }

  async interrupt(input: {
    externalRunId: string;
    reconnectSecret: string;
    generation: number;
    interrupt: RuntimeInterruptInput;
  }): Promise<void> {
    await this.request(
      `runs/${encodeURIComponent(input.externalRunId)}/interrupts?generation=${input.generation}`,
      {
        method: 'POST',
        headers: {
          ...reconnectHeaders(input.reconnectSecret),
          'content-type': 'application/json',
        },
        body: JSON.stringify(input.interrupt),
      },
    );
  }

  async cancel(input: {
    externalRunId: string;
    reconnectSecret: string;
    generation: number;
  }): Promise<void> {
    await this.request(
      `runs/${encodeURIComponent(input.externalRunId)}/cancel?generation=${input.generation}`,
      { method: 'POST', headers: reconnectHeaders(input.reconnectSecret) },
    );
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetcher(new URL(path, this.baseUrl).toString(), init);
    } catch {
      throw new Error('HERMES_RUNTIME_TRANSPORT_UNAVAILABLE');
    }
    if (!response.ok) {
      throw new Error(`HERMES_RUNTIME_TRANSPORT_STATUS:${response.status}`);
    }
    return response;
  }
}

export function hermesFetchRuntimeTransportFromEnvironment(
  env: Readonly<NodeJS.ProcessEnv> = process.env,
): HermesFetchRuntimeTransport {
  const baseUrl = env.HERMES_RUNTIME_BASE_URL?.trim();
  if (!baseUrl) throw new Error('HERMES_RUNTIME_BASE_URL_REQUIRED');
  return new HermesFetchRuntimeTransport({ baseUrl });
}

export class HermesHttpRuntimeAdapter implements AgentDurableRuntimeAdapter {
  readonly runtimeType: string = 'hermes_http';
  readonly capabilities = {
    detached: true, reconnect: true, interrupt: true, cancel: true, inspect: true,
  } as const;
  private readonly cancellationByHandle = new Map<string, Promise<void>>();

  constructor(private readonly options: HermesRuntimeAdapterOptions) {
    if (options.unsafeOptions !== undefined) throw new Error('HERMES_RUNTIME_OPTIONS_FORBIDDEN');
  }

  async start(context: AgentDurableRuntimeExecutionContext): Promise<RuntimeHandle> {
    if (context.runtimeType !== this.runtimeType) throw new Error('RUNTIME_CONTEXT_TYPE_MISMATCH');
    const issued = this.options.credentialBroker.issue({
      executionId: context.executionId,
      attemptId: context.attemptId,
    });
    const started = await this.options.transport.start({
      context,
      mcpConfig: buildRunScopedMcpConfig({
        capabilityKeys: context.capabilityKeys,
        registeredTools: this.options.toolRegistry,
        credential: issued.token,
      }),
      credentialExpiresAt: issued.expiresAt.toISOString(),
    });
    const externalRunId = z.string().min(1).max(512).parse(started.externalRunId);
    const reconnectSecret = z.string().min(1).max(4_096).parse(started.reconnectSecret);
    return {
      runtimeType: this.runtimeType,
      executionId: context.executionId,
      attemptId: context.attemptId,
      externalRunId,
      encryptedHandleRef: this.options.handleCipher.encrypt(reconnectSecret),
      generation: z.number().int().nonnegative().parse(started.generation),
    };
  }

  async *connect(handle: RuntimeHandle): AsyncIterable<DurableRuntimeAdapterEvent> {
    const transportHandle = this.transportHandle(handle);
    for await (const item of this.options.transport.connect(transportHandle)) {
      yield normalizeHermesProviderItem(item);
    }
  }

  inspect(handle: RuntimeHandle): Promise<RuntimeInspection> {
    return this.options.transport.inspect(this.transportHandle(handle));
  }

  interrupt(handle: RuntimeHandle, interrupt: RuntimeInterruptInput): Promise<void> {
    return this.options.transport.interrupt({ ...this.transportHandle(handle), interrupt });
  }

  cancel(handle: RuntimeHandle): Promise<void> {
    const key = `${handle.executionId}:${handle.attemptId}:${handle.generation}`;
    const existing = this.cancellationByHandle.get(key);
    if (existing) return existing;
    const pending = this.options.transport.cancel(this.transportHandle(handle));
    this.cancellationByHandle.set(key, pending);
    return pending;
  }

  private transportHandle(handle: RuntimeHandle) {
    if (handle.runtimeType !== this.runtimeType) throw new Error('RUNTIME_HANDLE_TYPE_MISMATCH');
    return {
      externalRunId: handle.externalRunId,
      reconnectSecret: this.options.handleCipher.decrypt(handle.encryptedHandleRef),
      generation: handle.generation,
    };
  }
}

export function normalizeHermesProviderItem(item: HermesProviderItem): DurableRuntimeAdapterEvent {
  const parsed = providerItemSchema.parse(item);
  switch (parsed.type) {
    case 'text_delta': return { kind: 'text_delta', content: parsed.content };
    case 'progress': return { kind: 'progress', progress: parsed.progress, label: parsed.label };
    case 'interrupt': return { kind: 'interrupt', interruptId: parsed.interruptId, payload: parsed.payload };
    case 'artifact_candidate': {
      const bytes = Buffer.from(parsed.contentBase64, 'base64');
      if (bytes.byteLength > maxArtifactBytes) {
        throw new Error('agent_session_artifact_too_large');
      }
      return {
        kind: 'artifact_candidate',
        externalArtifactId: parsed.externalArtifactId,
        artifactType: parsed.artifactType,
        label: parsed.label,
        bytes,
        mimeType: parsed.mimeType,
        sha256: parsed.sha256,
        navigationActionId: parsed.navigationActionId,
        metadata: parsed.metadata,
      };
    }
    case 'resource_ref': return { kind: 'resource_ref', resource: parsed.resource };
    case 'terminal': return { kind: 'terminal', status: parsed.status, ...(parsed.output ? { output: parsed.output } : {}), ...(parsed.errorCode ? { errorCode: parsed.errorCode } : {}) };
  }
}

function reconnectHeaders(reconnectSecret: string): Record<string, string> {
  return { 'x-hermes-reconnect-secret': reconnectSecret };
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error('HERMES_RUNTIME_RESPONSE_INVALID');
  }
}

function parseStreamLine(line: string): unknown | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:') || trimmed.startsWith('id:')) {
    return null;
  }
  const source = trimmed.startsWith('data:')
    ? trimmed.slice('data:'.length).trim()
    : trimmed;
  try {
    return JSON.parse(source);
  } catch {
    throw new Error('HERMES_RUNTIME_STREAM_INVALID');
  }
}
