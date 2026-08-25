import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { appendFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRequestScopedReadinessMcpHandler } from '../../../server/src/agent-os/adapter/in/http/runtime/attempt-mcp-http.controller';
import { AttemptWorkspaceService, type AttemptWorkspacePaths } from '../attempt/attempt-workspace.service';
import { agentResultOutputSchema } from './agent-result-output-schema';

const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const ATTEMPT_TOKEN = 'A'.repeat(43);
const NONCE = '51e975ef-c0a7-4ab1-8007-47c0fd563505';
const PROVIDER_INPUT_MESSAGES = [
  { type: 'message', callIdPresent: false },
  { type: 'message', callIdPresent: false },
  { type: 'message', callIdPresent: false },
] as const;

/**
 * These use the bundled 0.149.1 app-server, never a real model endpoint.
 * The fake Responses server extracts bounded tool metadata and discards every
 * prompt, token, authorization header, and provider payload immediately.
 */
describe('Codex app-server readiness boundary', () => {
  it('uses mcpServer/tool/call to complete the modern readiness probe with its exact nonce', async () => {
    const provider = await localResponsesProvider();
    const mcp = await modernReadinessMcp();
    const generated = await workspace(mcp.url);
    let child: ReturnType<typeof spawn> | undefined;
    try {
      await appendFile(generated.paths.codexConfigPath, localProviderConfig(provider.url));
      child = strictAppServer(generated.paths);
      const rpc = new Rpc(child);
      await rpc.request('initialize', { clientInfo: { name: 'kiditem-local-readiness', version: '1' }, capabilities: null });
      rpc.notify('initialized', {});
      const thread = await rpc.request('thread/start', {
        model: 'local-fake-model', modelProvider: 'local_fake', cwd: generated.paths.workspace, approvalPolicy: 'never', ephemeral: true,
      }) as { thread?: { id?: string }; activePermissionProfile?: { id?: string } };
      const threadId = thread.thread?.id;
      if (!threadId) throw new Error('local_readiness_direct_probe_thread_id_missing');
      expect(thread.activePermissionProfile?.id).toBe(':danger-full-access');
      await rpc.request('mcpServer/tool/call', {
        threadId,
        server: 'kiditem_attempt',
        tool: 'readiness_probe',
        arguments: { nonce: NONCE },
      });

      expect(mcp.methods).toEqual(expect.arrayContaining(['tools/list', 'tools/call']));
      expect(mcp.methods.indexOf('tools/list')).toBeLessThan(mcp.methods.indexOf('tools/call'));
      expect(mcp.probes).toEqual([NONCE]);
    } finally {
      if (child) await stop(child);
      await mcp.close();
      await provider.close();
      await rm(generated.root, { recursive: true, force: true });
    }
  }, 20_000);

  it('hides the provider tool before a separate enabled probe thread performs the direct call', async () => {
    const provider = await localResponsesProvider();
    const mcp = await modernReadinessMcp();
    const generated = await workspace(mcp.url);
    let child: ReturnType<typeof spawn> | undefined;
    try {
      await appendFile(generated.paths.codexConfigPath, localProviderConfig(provider.url));
      child = strictAppServer(generated.paths);
      const rpc = new Rpc(child);
      await rpc.request('initialize', { clientInfo: { name: 'kiditem-local-readiness', version: '1' }, capabilities: null });
      rpc.notify('initialized', {});
      const providerThread = await rpc.request('thread/start', {
        model: 'local-fake-model', modelProvider: 'local_fake', cwd: generated.paths.workspace, approvalPolicy: 'never', ephemeral: true,
        config: { mcp_servers: { kiditem_attempt: { disabled_tools: ['readiness_probe'] } } },
      }) as { thread?: { id?: string }; activePermissionProfile?: { id?: string } };
      const providerThreadId = providerThread.thread?.id;
      if (!providerThreadId) throw new Error('local_readiness_hidden_provider_thread_id_missing');
      expect(providerThread.activePermissionProfile?.id).toBe(':danger-full-access');
      const turn = rpc.request('turn/start', {
        threadId: providerThreadId,
        input: [{ type: 'text', text: 'local bounded disabled-tool provider metadata', text_elements: [] }],
      });
      void turn.catch(() => undefined);

      const metadata = await provider.next();

      expect(metadata.input).toEqual(PROVIDER_INPUT_MESSAGES);
      expect(metadata.tools).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'namespace',
          name: 'mcp__kiditem_attempt',
          children: [expect.objectContaining({ type: 'function', name: 'readiness_probe' })],
        }),
      ]));
      const probeThread = await rpc.request('thread/start', {
        model: 'local-fake-model', modelProvider: 'local_fake', cwd: generated.paths.workspace, approvalPolicy: 'never', ephemeral: true,
      }) as { thread?: { id?: string }; activePermissionProfile?: { id?: string } };
      const probeThreadId = probeThread.thread?.id;
      if (!probeThreadId) throw new Error('local_readiness_enabled_probe_thread_id_missing');
      expect(probeThreadId).not.toBe(providerThreadId);
      expect(probeThread.activePermissionProfile?.id).toBe(':danger-full-access');
      await rpc.request('mcpServer/tool/call', {
        threadId: probeThreadId,
        server: 'kiditem_attempt',
        tool: 'readiness_probe',
        arguments: { nonce: NONCE },
      });

      expect(rpc.calls).toEqual(expect.arrayContaining([
        { method: 'turn/start', threadId: providerThreadId },
        { method: 'mcpServer/tool/call', threadId: probeThreadId },
      ]));
      expect(mcp.methods).toEqual(expect.arrayContaining(['tools/list', 'tools/call']));
      expect(mcp.probes).toEqual([NONCE]);
    } finally {
      if (child) await stop(child);
      await mcp.close();
      await provider.close();
      await rm(generated.root, { recursive: true, force: true });
    }
  }, 20_000);

  it.each([
    ['pre-created', true],
    ['created after completion', false],
  ] as const)('calls an enabled %s probe after an exact strict provider turn completes', async (_timing, createProbeBeforeTurn) => {
    const provider = await localResponsesProvider();
    const mcp = await modernReadinessMcp();
    const generated = await workspace(mcp.url);
    let child: ReturnType<typeof spawn> | undefined;
    try {
      await appendFile(generated.paths.codexConfigPath, localProviderConfig(provider.url));
      child = strictAppServer(generated.paths);
      const rpc = new Rpc(child);
      await rpc.request('initialize', { clientInfo: { name: 'kiditem-local-readiness', version: '1' }, capabilities: null });
      rpc.notify('initialized', {});
      const providerThread = await readinessThread(rpc, generated.paths, { disabled_tools: ['readiness_probe'] });
      const preCreatedProbe = createProbeBeforeTurn ? await readinessThread(rpc, generated.paths) : undefined;
      const turn = rpc.request('turn/start', {
        threadId: providerThread.id,
        input: [{ type: 'text', text: 'local strict completion ordering', text_elements: [] }],
        outputSchema: agentResultOutputSchema(),
      });
      void turn.catch(() => undefined);

      const metadata = await provider.next();
      expect(metadata.tools).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'mcp__kiditem_attempt' }),
      ]));
      expect(metadata.textFormat).toMatchObject({
        type: 'json_schema',
        strict: true,
        schema: {
          rootType: 'object',
          rootUsesAnyOf: false,
          rootProperties: ['error', 'needsInput', 'operationRefs', 'outcome', 'resourceRefs', 'summary'],
          rootRequired: ['error', 'needsInput', 'operationRefs', 'outcome', 'resourceRefs', 'summary'],
          violations: [],
        },
      });
      const completion = await rpc.waitForTurnCompletion(providerThread.id);
      assertStrictCompletion(completion, providerThread.id);
      const probeThread = preCreatedProbe ?? await readinessThread(rpc, generated.paths);
      expect(probeThread.id).not.toBe(providerThread.id);
      const beforeDirect = mcp.observations.length;
      const outcome = await directProbeOutcome(rpc, probeThread.id);

      expect({ outcome, observations: mcp.observations }).toEqual({
        outcome: 'success',
        observations: expect.arrayContaining([
          { method: 'tools/list', status: 200 },
          { method: 'tools/call', status: 200 },
        ]),
      });
      expect(mcp.observations.slice(beforeDirect)).toEqual(expect.arrayContaining([{ method: 'tools/call', status: 200 }]));
      expect(mcp.probes).toEqual([NONCE]);
    } finally {
      if (child) await stop(child);
      await mcp.close();
      await provider.close();
      await rm(generated.root, { recursive: true, force: true });
    }
  }, 20_000);

  it('exposes the readiness child to the model as an auto-choice namespace without requiring a model-selected call', async () => {
    const provider = await localResponsesProvider();
    const mcp = await modernReadinessMcp();
    const generated = await workspace(mcp.url);
    let child: ReturnType<typeof spawn> | undefined;
    try {
      await appendFile(generated.paths.codexConfigPath, localProviderConfig(provider.url));
      child = strictAppServer(generated.paths);
      const rpc = new Rpc(child);
      await rpc.request('initialize', { clientInfo: { name: 'kiditem-local-readiness', version: '1' }, capabilities: null });
      rpc.notify('initialized', {});
      const thread = await rpc.request('thread/start', {
        model: 'local-fake-model', modelProvider: 'local_fake', cwd: generated.paths.workspace, approvalPolicy: 'never', ephemeral: true,
      }) as { thread?: { id?: string } };
      const threadId = thread.thread?.id;
      if (!threadId) throw new Error('local_readiness_thread_id_missing');
      const turn = rpc.request('turn/start', {
        threadId,
        input: [{ type: 'text', text: 'local model-visible readiness metadata', text_elements: [] }],
      });
      void turn.catch(() => undefined);

      const metadata = await provider.next();

      expect(metadata.input).toEqual(PROVIDER_INPUT_MESSAGES);
      expect(metadata.request).toEqual({ method: 'POST', path: '/v1/responses' });
      expect(metadata.stream).toBe(true);
      expect(metadata.toolChoice).toEqual({ type: 'auto' });
      expect(metadata.tools).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'namespace',
          name: 'mcp__kiditem_attempt',
          children: [expect.objectContaining({ type: 'function', name: 'readiness_probe' })],
        }),
      ]));
      expect(mcp.methods).toContain('tools/list');
      expect(mcp.methods).not.toContain('tools/call');
    } finally {
      if (child) await stop(child);
      await mcp.close();
      await provider.close();
      await rm(generated.root, { recursive: true, force: true });
    }
  }, 20_000);
});

type GeneratedWorkspace = Readonly<{ root: string; paths: AttemptWorkspacePaths }>;

async function workspace(mcpUrl: string): Promise<GeneratedWorkspace> {
  const root = await mkdtemp(join(tmpdir(), 'kiditem-codex-readiness-'));
  const attemptRoot = join(root, 'attempts');
  await mkdir(attemptRoot, { recursive: true, mode: 0o700 });
  const service = new AttemptWorkspaceService({
    attemptRoot,
    loginRoot: root,
    platform: 'macos',
    attemptRootGuard: { canonicalPath: attemptRoot, revalidate: async () => attemptRoot },
  });
  return {
    root,
    paths: await service.create({
      attemptId: ATTEMPT_ID,
      runtime: 'codex_cli',
      model: 'local-fake-model',
      prompt: 'local deterministic readiness turn',
      timeoutMs: 10_000,
      workspacePolicy: 'empty_ephemeral_v1',
      mcpUrl,
      attemptToken: ATTEMPT_TOKEN,
      mcpToolScope: 'readiness_canary',
      readinessProbeNonce: NONCE,
      mcpProtocolRevision: '2026-07-28',
      cliContractIdentity: 'office-cli-contract-v2',
    }),
  };
}

function strictAppServer(paths: AttemptWorkspacePaths): ReturnType<typeof spawn> {
  const require = createRequire(import.meta.url);
  const entrypoint = require.resolve('@openai/codex/bin/codex.js');
  return spawn(process.execPath, [entrypoint, 'app-server', '--stdio', '--strict-config', '--disable', 'plugins', '--config', 'features.mcp_2026_07_28=true'], {
    cwd: paths.workspace,
    env: {
      ...process.env,
      HOME: paths.home,
      CODEX_HOME: paths.codexHome,
      KIDITEM_ATTEMPT_MCP_TOKEN: ATTEMPT_TOKEN,
      KIDITEM_LOCAL_FAKE_KEY: 'local',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

async function readinessThread(
  rpc: Rpc,
  paths: AttemptWorkspacePaths,
  override?: Readonly<{ disabled_tools: readonly string[] }>,
): Promise<Readonly<{ id: string }>> {
  const thread = await rpc.request('thread/start', {
    model: 'local-fake-model', modelProvider: 'local_fake', cwd: paths.workspace, approvalPolicy: 'never', ephemeral: true,
    ...(override ? { config: { mcp_servers: { kiditem_attempt: override } } } : {}),
  }) as { thread?: { id?: string }; activePermissionProfile?: { id?: string } };
  const id = thread.thread?.id;
  if (!id) throw new Error('local_readiness_experiment_thread_id_missing');
  if (thread.activePermissionProfile?.id !== ':danger-full-access') throw new Error('local_readiness_experiment_permission_profile_mismatch');
  return Object.freeze({ id });
}

async function directProbeOutcome(rpc: Rpc, threadId: string): Promise<string> {
  try {
    await rpc.request('mcpServer/tool/call', {
      threadId,
      server: 'kiditem_attempt',
      tool: 'readiness_probe',
      arguments: { nonce: NONCE },
    });
    return 'success';
  } catch (error) {
    return error instanceof Error ? error.message : 'local_readiness_direct_probe_failed';
  }
}

function assertStrictCompletion(completion: TurnCompletion, threadId: string): void {
  if (completion.status !== 'completed' || !completion.agentMessagePresent) {
    throw new Error(`local_readiness_completion_invalid status=${completion.status} item_types=${completion.itemTypes.join(',') || 'none'} error_code=${completion.errorCode ?? 'none'}`);
  }
  expect(completion.threadId).toBe(threadId);
}

async function modernReadinessMcp(): Promise<{
  url: string;
  probe: Promise<void>;
  methods: string[];
  observations: { method: string; status: number }[];
  probes: string[];
  close(): Promise<void>;
}> {
  const probe = deferred<void>();
  const methods: string[] = [];
  const observations: { method: string; status: number }[] = [];
  const probes: string[] = [];
  const server = createServer(async (request, response) => {
    let handler: ReturnType<typeof createRequestScopedReadinessMcpHandler> | undefined;
    let method: string | undefined;
    try {
      const body = await readJson(request);
      if (typeof body.method === 'string') { method = body.method; methods.push(method); }
      handler = createRequestScopedReadinessMcpHandler({
        nonce: NONCE,
        onProbe: ({ nonce }) => { probes.push(nonce); probe.resolve(); },
      });
      const result = await handler.fetch(new Request(`http://127.0.0.1${request.url}`, {
        method: request.method,
        headers: request.headers as HeadersInit,
        body: JSON.stringify(body),
      }), { parsedBody: body });
      response.statusCode = result.status;
      if (method) observations.push({ method, status: result.status });
      result.headers.forEach((value, name) => response.setHeader(name, value));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      response.statusCode = 500;
      if (method) observations.push({ method, status: 500 });
      response.end();
    } finally {
      await handler?.close();
    }
  });
  server.listen(4000, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:4000/internal/agent-runtime/attempts/${ATTEMPT_ID}/mcp`,
    probe: probe.promise,
    methods,
    observations,
    probes,
    close: () => closeServer(server),
  };
}

type Metadata = Readonly<{
  request: Readonly<{ method: string; path: string }>;
  stream: boolean;
  toolChoice: Record<string, string> | null;
  tools: readonly Record<string, unknown>[];
  input: readonly Record<string, unknown>[];
  textFormat: Record<string, unknown> | null;
}>;

async function localResponsesProvider(): Promise<{ url: string; next(): Promise<Metadata>; close(): Promise<void> }> {
  const metadata = deferred<Metadata>();
  const server = createServer(async (request, response) => {
    try {
      const body = await readJson(request);
      metadata.resolve({
        request: { method: request.method ?? '', path: request.url ?? '' },
        stream: body.stream === true,
        toolChoice: safeChoice(body.tool_choice),
        tools: Array.isArray(body.tools) ? body.tools.map(safeTool).filter((value): value is Record<string, unknown> => value !== null) : [],
        input: Array.isArray(body.input) ? body.input.map(safeInput).filter((value): value is Record<string, unknown> => value !== null) : [],
        textFormat: safeTextFormat(body.text),
      });
      sendSse(response, completedResponseEvents());
    } catch {
      response.statusCode = 500;
      response.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, next: () => metadata.promise, close: () => closeServer(server) };
}

function localProviderConfig(providerUrl: string): string {
  return [
    '',
    '[model_providers.local_fake]',
    'name = "local fake"',
    `base_url = ${JSON.stringify(`${providerUrl}/v1`)}`,
    'env_key = "KIDITEM_LOCAL_FAKE_KEY"',
    'wire_api = "responses"',
    'requires_openai_auth = false',
    '',
  ].join('\n');
}

function sendSse(response: import('node:http').ServerResponse, events: readonly object[]): void {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  response.end(events.map((event) => `event: ${String((event as { type?: unknown }).type)}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
}

function completedResponseEvents(): object[] {
  const responseId = 'resp_local';
  return [
    { type: 'response.created', response: { id: responseId } },
    {
      type: 'response.output_item.done',
      item: {
        type: 'message',
        role: 'assistant',
        id: 'msg_local',
        content: [{ type: 'output_text', text: JSON.stringify({ outcome: 'completed', summary: 'local', resourceRefs: [], operationRefs: [], needsInput: null, error: null }) }],
      },
    },
    {
      type: 'response.completed',
      response: {
        id: responseId,
        usage: { input_tokens: 0, input_tokens_details: null, output_tokens: 0, output_tokens_details: null, total_tokens: 0 },
      },
    },
  ];
}

function safeTool(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const tool = value as Record<string, unknown>;
  return defined({
    type: text(tool.type),
    name: text(tool.name),
    defer_loading: boolean(tool.defer_loading) ?? boolean(tool.deferLoading),
    children: Array.isArray(tool.tools) ? tool.tools.map(safeTool).filter((child): child is Record<string, unknown> => child !== null) : undefined,
  });
}

function safeChoice(value: unknown): Record<string, string> | null {
  if (typeof value === 'string') return { type: value };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const choice = value as Record<string, unknown>;
  return defined({ type: text(choice.type), name: text(choice.name) }) as Record<string, string>;
}

function safeInput(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  return defined({
    type: text(input.type),
    name: text(input.name),
    namespace: text(input.namespace),
    callIdPresent: Object.hasOwn(input, 'call_id') || Object.hasOwn(input, 'callId'),
  });
}

function safeTextFormat(value: unknown): Record<string, unknown> | null {
  const format = object(object(value)?.format);
  if (!format) return null;
  return defined({
    type: text(format.type),
    strict: boolean(format.strict),
    schema: safeSchemaMetadata(format.schema) ?? undefined,
  });
}

function safeSchemaMetadata(value: unknown): Record<string, unknown> | null {
  const schema = object(value);
  if (!schema) return null;
  const properties = object(schema.properties);
  return {
    rootType: text(schema.type),
    rootUsesAnyOf: schema.anyOf !== undefined,
    rootProperties: properties ? Object.keys(properties).sort() : [],
    rootRequired: Array.isArray(schema.required) ? schema.required.filter((field): field is string => typeof field === 'string').sort() : [],
    violations: strictSchemaViolations(schema),
  };
}

function strictSchemaViolations(value: unknown, path = '$'): string[] {
  const schema = object(value);
  if (!schema) return [`${path}: schema node must be an object`];
  const violations: string[] = [];
  if (Object.keys(schema).length === 0) violations.push(`${path}: schema node must not be empty`);
  if (path === '$' && schema.anyOf !== undefined) violations.push('$: root schema must not use anyOf');
  const properties = object(schema.properties);
  const isObject = schema.type === 'object' || properties !== null;
  if (isObject) {
    if (schema.type !== 'object') violations.push(`${path}: object schema must declare type=object`);
    if (schema.additionalProperties !== false) violations.push(`${path}: object schema must set additionalProperties=false`);
    if (!properties) {
      violations.push(`${path}: object schema must declare properties`);
    } else {
      const required = Array.isArray(schema.required) ? schema.required.filter((field): field is string => typeof field === 'string') : [];
      for (const [name, child] of Object.entries(properties)) {
        if (!required.includes(name)) violations.push(`${path}.${name}: property must be required`);
        violations.push(...strictSchemaViolations(child, `${path}.${name}`));
      }
    }
  }
  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((child, index) => violations.push(...strictSchemaViolations(child, `${path}.anyOf[${index}]`)));
  }
  if (schema.items !== undefined) violations.push(...strictSchemaViolations(schema.items, `${path}.items`));
  return violations;
}

function defined<T extends Record<string, unknown>>(value: T): Record<string, Exclude<T[keyof T], undefined>> {
  return Object.fromEntries(Object.entries(value).filter(([, current]) => current !== undefined)) as Record<string, Exclude<T[keyof T], undefined>>;
}

function text(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function boolean(value: unknown): boolean | undefined { return typeof value === 'boolean' ? value : undefined; }

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.byteLength;
    if (bytes > 1_048_576) throw new Error('local_readiness_request_too_large');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

class Rpc {
  private buffer = '';
  private nextId = 0;
  private readonly pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  private readonly turnCompletions: TurnCompletion[] = [];
  private readonly turnCompletionWaiters = new Map<string, { resolve(value: TurnCompletion): void; reject(error: Error): void }>();
  readonly calls: { method: string; threadId?: string }[] = [];

  constructor(private readonly child: ReturnType<typeof spawn>) {
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => this.receive(chunk));
    child.once('exit', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('local_readiness_app_server_exited'));
      this.pending.clear();
      for (const pending of this.turnCompletionWaiters.values()) pending.reject(new Error('local_readiness_app_server_exited'));
      this.turnCompletionWaiters.clear();
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    const threadId = object(params)?.threadId;
    this.calls.push({ method, ...(typeof threadId === 'string' ? { threadId } : {}) });
    const id = `local-${++this.nextId}`;
    this.child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`local_readiness_rpc_timeout_${method}`)); }, 10_000);
    });
  }

  notify(method: string, params: unknown): void { this.child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`); }

  waitForTurnCompletion(threadId: string): Promise<TurnCompletion> {
    const received = this.turnCompletions.find((completion) => completion.threadId === threadId);
    if (received) return Promise.resolve(received);
    return new Promise((resolve, reject) => {
      this.turnCompletionWaiters.set(threadId, { resolve, reject });
      setTimeout(() => {
        if (this.turnCompletionWaiters.delete(threadId)) reject(new Error('local_readiness_turn_completion_timeout'));
      }, 10_000);
    });
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    while (this.buffer.includes('\n')) {
      const end = this.buffer.indexOf('\n');
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      let message: { id?: string; method?: string; params?: unknown; result?: unknown; error?: { code?: unknown } };
      try { message = JSON.parse(line) as { id?: string; method?: string; params?: unknown; result?: unknown; error?: { code?: unknown } }; } catch { continue; }
      if (!message.id) { this.observeTurnCompletion(message); continue; }
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`local_readiness_rpc_error_${typeof message.error.code === 'number' ? message.error.code : 'unknown'}`));
      else pending.resolve(message.result);
    }
  }

  private observeTurnCompletion(message: Readonly<{ method?: string; params?: unknown }>): void {
    if (message.method !== 'turn/completed') return;
    const params = object(message.params);
    const thread = object(params?.turn);
    const threadId = params?.threadId;
    if (!thread || typeof threadId !== 'string' || typeof thread.status !== 'string') return;
    const status = thread.status;
    const items = Array.isArray(thread.items) ? thread.items : [];
    const itemTypes = items.flatMap((item) => typeof object(item)?.type === 'string' ? [object(item)!.type as string] : []);
    const errorCode = object(thread.error)?.code;
    const completion: TurnCompletion = Object.freeze({
      threadId,
      status,
      agentMessagePresent: itemTypes.includes('agentMessage'),
      itemTypes: Object.freeze(itemTypes),
      ...(typeof errorCode === 'string' || typeof errorCode === 'number' ? { errorCode: String(errorCode) } : {}),
    });
    this.turnCompletions.push(completion);
    const waiter = this.turnCompletionWaiters.get(threadId);
    if (!waiter) return;
    this.turnCompletionWaiters.delete(threadId);
    waiter.resolve(completion);
  }
}

type TurnCompletion = Readonly<{
  threadId: string;
  status: string;
  agentMessagePresent: boolean;
  itemTypes: readonly string[];
  errorCode?: string;
}>;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function closeServer(server: Server): Promise<void> { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
async function stop(child: ReturnType<typeof spawn>): Promise<void> { child.kill('SIGTERM'); await onceExit(child); }
async function onceExit(child: ReturnType<typeof spawn>): Promise<void> { if (child.exitCode === null && child.signalCode === null) await once(child, 'exit'); }
