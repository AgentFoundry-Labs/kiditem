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
import { CodexAppServerSession } from './codex-app-server-session';

const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const ATTEMPT_TOKEN = 'A'.repeat(43);
const NONCE = '51e975ef-c0a7-4ab1-8007-47c0fd563505';

/**
 * These use the bundled 0.149.1 app-server, never a real model endpoint.
 * The fake Responses server extracts bounded tool metadata and discards every
 * prompt, token, authorization header, and provider payload immediately.
 */
describe('Codex app-server readiness boundary', () => {
  it('uses mcpServer/tool/call to complete the modern readiness probe before starting the model turn', async () => {
    const provider = await localResponsesProvider();
    const mcp = await modernReadinessMcp();
    const generated = await workspace(mcp.url);
    let child: ReturnType<typeof spawn> | undefined;
    try {
      await appendFile(generated.paths.codexConfigPath, localProviderConfig(provider.url));
      child = strictAppServer(generated.paths);
      const session = appServerSession(child);
      const start = session.start({
        model: 'local-fake-model',
        cwd: generated.paths.workspace,
        prompt: 'local deterministic readiness turn',
        readinessProbeNonce: NONCE,
      });
      void start.catch(() => undefined);

      const probeReached = await Promise.race([
        mcp.probe.then(() => true),
        wait(5_000).then(() => false),
      ]);

      expect(probeReached).toBe(true);
      expect(mcp.methods).toEqual(expect.arrayContaining(['tools/list', 'tools/call']));
      expect(mcp.methods.indexOf('tools/list')).toBeLessThan(mcp.methods.indexOf('tools/call'));
      expect(mcp.probes).toEqual([NONCE]);
      await start;
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

function appServerSession(child: ReturnType<typeof spawn>): CodexAppServerSession {
  const session = new CodexAppServerSession((line) => new Promise<void>((resolve, reject) => {
    child.stdin!.write(line, (error) => error ? reject(error) : resolve());
  }));
  child.stdout!.setEncoding('utf8');
  child.stdout!.on('data', (chunk: string) => session.receive(chunk));
  child.once('exit', () => session.close());
  return session;
}

async function modernReadinessMcp(): Promise<{
  url: string;
  probe: Promise<void>;
  methods: string[];
  probes: string[];
  close(): Promise<void>;
}> {
  const probe = deferred<void>();
  const methods: string[] = [];
  const probes: string[] = [];
  const server = createServer(async (request, response) => {
    let handler: ReturnType<typeof createRequestScopedReadinessMcpHandler> | undefined;
    try {
      const body = await readJson(request);
      if (typeof body.method === 'string') methods.push(body.method);
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
      result.headers.forEach((value, name) => response.setHeader(name, value));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      response.statusCode = 500;
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
    probes,
    close: () => closeServer(server),
  };
}

type Metadata = Readonly<{
  request: Readonly<{ method: string; path: string }>;
  stream: boolean;
  toolChoice: Record<string, string> | null;
  tools: readonly Record<string, unknown>[];
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
  response.end(events.map((event) => `event: ${String((event as { type?: unknown }).type)}\ndata: ${JSON.stringify(event)}\n`).join('\n'));
}

function completedResponseEvents(): object[] {
  return [
    responseEvent('response.created', 'in_progress', [], 1),
    responseEvent('response.in_progress', 'in_progress', [], 2),
    responseEvent('response.completed', 'completed', [], 3),
  ];
}

function responseEvent(type: 'response.created' | 'response.in_progress' | 'response.completed', status: string, output: unknown[], sequence_number: number): object {
  return {
    type,
    response: { id: 'resp_local', object: 'response', created_at: 0, model: 'local-fake-model', status, output, parallel_tool_calls: true, tool_choice: 'auto', tools: [] },
    sequence_number,
  };
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

  constructor(private readonly child: ReturnType<typeof spawn>) {
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => this.receive(chunk));
    child.once('exit', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('local_readiness_app_server_exited'));
      this.pending.clear();
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = `local-${++this.nextId}`;
    this.child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`local_readiness_rpc_timeout_${method}`)); }, 10_000);
    });
  }

  notify(method: string, params: unknown): void { this.child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`); }

  private receive(chunk: string): void {
    this.buffer += chunk;
    while (this.buffer.includes('\n')) {
      const end = this.buffer.indexOf('\n');
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      let message: { id?: string; result?: unknown; error?: { code?: unknown } };
      try { message = JSON.parse(line) as { id?: string; result?: unknown; error?: { code?: unknown } }; } catch { continue; }
      if (!message.id) continue;
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`local_readiness_rpc_error_${typeof message.error.code === 'number' ? message.error.code : 'unknown'}`));
      else pending.resolve(message.result);
    }
  }
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function wait(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function closeServer(server: Server): Promise<void> { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
async function stop(child: ReturnType<typeof spawn>): Promise<void> { child.kill('SIGTERM'); await onceExit(child); }
async function onceExit(child: ReturnType<typeof spawn>): Promise<void> { if (child.exitCode === null && child.signalCode === null) await once(child, 'exit'); }
