import { randomUUID } from 'node:crypto';
import {
  MCP_CONVERSATION_ID_HEADER,
  ModelSchema,
  ProviderEventSchema,
  ReasoningEffortSchema,
} from '@kiditem/shared/agent-runtime';
import type {
  CreateProviderConversation,
  InterruptProviderTurn,
  ProviderConversation,
  ProviderConversationSummary,
  ProviderEventSink,
  StartProviderTurn,
} from '../provider-conversation.port';
import { codexDeveloperInstructions } from '../../profile/agent-profile.catalog';
import { codexCapabilityApprovalRequiredEvent } from '../capability-approval-required';

type RpcResponse = Readonly<{
  id?: string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}>;

type ActiveTurn = Readonly<{
  providerConversationRef: string;
  gatewayTurnId: string;
  providerTurnId: string;
  sink: ProviderEventSink;
}>;

type PendingRequest = Readonly<{
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onResult?: (value: unknown) => void;
}>;

// The current Codex MCP stdio transport contract bounds serialized JSON-RPC
// lines at 8 MiB. A valid app-server item/completed notification wraps that
// result in its own JSON-RPC/item envelope, so retain a small allowance.
const MAX_UPSTREAM_MCP_JSON_RPC_LINE_BYTES = 8 * 1024 * 1024;
const MAX_APP_SERVER_FRAME_ENVELOPE_BYTES = 64 * 1024;
const MAX_RPC_FRAME_BYTES = MAX_UPSTREAM_MCP_JSON_RPC_LINE_BYTES + MAX_APP_SERVER_FRAME_ENVELOPE_BYTES;
const MAX_CONVERSATION_PAGE_SIZE = 1_000;

export type CodexAppServerFramingFaultCode = 'codex_app_server_output_invalid' | 'codex_app_server_output_too_large';

/** Bounded parser fault metadata intentionally omits the provider frame. */
export class CodexAppServerFramingError extends Error {
  constructor(
    readonly code: CodexAppServerFramingFaultCode,
    readonly byteCount: number,
  ) {
    super(code);
    this.name = 'CodexAppServerFramingError';
  }
}

/** Exact app-server model/list facts; no model or effort defaults are inferred. */
export interface CodexModelCapability {
  model: string;
  reasoningEfforts: string[];
}

/**
 * One live Codex app-server protocol session. It holds process-local RPC and
 * active-turn state only; top-level thread history stays in Codex.
 */
export class CodexAppServerSession {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly activeByGatewayTurn = new Map<string, ActiveTurn>();
  private readonly activeByProviderTurn = new Map<string, ActiveTurn>();
  private readonly mcpConfiguredThreads = new Set<string>();
  private initialized: Promise<void> | null = null;
  private closed = false;
  private buffer = '';

  constructor(private readonly options: Readonly<{
    write: (line: string) => void | Promise<void>;
    workspace: string;
    mcpUrl: string;
    mcpTransportToken: string;
    maxBytes?: number;
  }>) {}

  async createConversation(input: CreateProviderConversation): Promise<ProviderConversation> {
    await this.ensureInitialized();
    const result = await this.request('thread/start', {
      cwd: this.options.workspace,
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
      ephemeral: false,
      developerInstructions: codexDeveloperInstructions(input.instructionProfile),
      config: this.mcpConfig(input.conversationId),
    });
    const thread = requireThread(result);
    assertFullAccess(result);
    const title = input.title ?? thread.name ?? 'New conversation';
    // Codex does not make a newly started empty thread readable until it has a
    // name. The Web intentionally permits title-less conversation creation, so
    // persist the provider-supplied/default title before exposing the thread.
    await this.request('thread/name/set', { threadId: thread.id, name: title });
    this.mcpConfiguredThreads.add(thread.id);
    return toProviderConversation({ ...thread, name: title });
  }

  async listConversations(): Promise<ProviderConversationSummary[]> {
    return (await this.listConversationsPage()).conversations;
  }

  async listConversationsPage(cursor?: string): Promise<Readonly<{
    conversations: ProviderConversationSummary[];
    nextCursor: string | null;
  }>> {
    await this.ensureInitialized();
    if (cursor !== undefined && (cursor.length < 1 || cursor.length > 2_000)) throw new Error('codex_app_server_list_invalid');
    const result = await this.request('thread/list', {
      limit: MAX_CONVERSATION_PAGE_SIZE,
      cwd: this.options.workspace,
      archived: false,
      ...(cursor === undefined ? {} : { cursor }),
    });
    const response = object(result);
    const data = response?.data;
    if (!Array.isArray(data)) throw new Error('codex_app_server_list_invalid');
    const nextCursor = response?.nextCursor;
    if (nextCursor !== null && (typeof nextCursor !== 'string' || nextCursor.length < 1 || nextCursor.length > 2_000)) {
      throw new Error('codex_app_server_list_invalid');
    }
    return {
      conversations: data
      .map(object)
      .filter((thread): thread is Record<string, unknown> => thread !== null && thread.parentThreadId === null)
      .map(toProviderConversation),
      nextCursor,
    };
  }

  async modelCatalog(): Promise<CodexModelCapability[]> {
    await this.ensureInitialized();
    const result = await this.request('model/list', { limit: 100, includeHidden: false });
    const data = object(result)?.data;
    if (!Array.isArray(data) || data.length < 1 || data.length > 100) throw new Error('codex_app_server_model_catalog_invalid');
    const models = new Set<string>();
    return data.map((raw) => {
      const entry = object(raw);
      const model = ModelSchema.safeParse(entry?.model);
      const supported = entry?.supportedReasoningEfforts;
      if (!model.success || !Array.isArray(supported) || supported.length < 1 || supported.length > 20 || models.has(model.data)) {
        throw new Error('codex_app_server_model_catalog_invalid');
      }
      models.add(model.data);
      const efforts = supported.map((item) => {
        const effort = ReasoningEffortSchema.safeParse(object(item)?.reasoningEffort);
        if (!effort.success) throw new Error('codex_app_server_model_catalog_invalid');
        return effort.data;
      });
      if (new Set(efforts).size !== efforts.length) throw new Error('codex_app_server_model_catalog_invalid');
      return { model: model.data, reasoningEfforts: efforts };
    });
  }

  /**
   * Provider-local continuity/readability probe. It deliberately returns no
   * provider transcript; canonical UI history belongs to the SQLite AG-UI
   * runner.
   */
  async assertThreadReadable(providerConversationRef: string): Promise<void> {
    await this.ensureInitialized();
    const result = await this.request('thread/read', { threadId: providerConversationRef, includeTurns: false });
    requireThread(result);
  }

  async rename(providerConversationRef: string, title: string): Promise<void> {
    await this.ensureInitialized();
    await this.request('thread/name/set', { threadId: providerConversationRef, name: title });
  }

  /** Codex archive is the provider-supported delete/archive operation. */
  async archive(providerConversationRef: string): Promise<void> {
    await this.ensureInitialized();
    await this.request('thread/archive', { threadId: providerConversationRef });
    this.mcpConfiguredThreads.delete(providerConversationRef);
  }

  async startTurn(input: StartProviderTurn, sink: ProviderEventSink): Promise<void> {
    await this.ensureInitialized();
    if (this.activeByGatewayTurn.has(gatewayTurnKey(input.providerConversationRef, input.turnId))) {
      throw new Error('codex_turn_already_live');
    }
    if (!this.mcpConfiguredThreads.has(input.providerConversationRef)) {
      const resumed = await this.request('thread/resume', {
        threadId: input.providerConversationRef,
        cwd: this.options.workspace,
        approvalPolicy: 'never',
        sandbox: 'danger-full-access',
        model: input.model,
        developerInstructions: codexDeveloperInstructions(input.instructionProfile),
        config: this.mcpConfig(input.conversationId),
      });
      assertFullAccess(resumed);
      this.mcpConfiguredThreads.add(input.providerConversationRef);
    }
    await this.request('turn/start', {
      threadId: input.providerConversationRef,
      input: [textInput(input.message)],
      cwd: this.options.workspace,
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'dangerFullAccess' },
      model: input.model,
      effort: input.reasoningEffort,
    }, (started) => {
      const providerTurnId = requiredString(object(started)?.turn && object(object(started)?.turn)?.id, 'turn_id');
      const active: ActiveTurn = Object.freeze({
        providerConversationRef: input.providerConversationRef,
        gatewayTurnId: input.turnId,
        providerTurnId,
        sink,
      });
      this.activeByGatewayTurn.set(gatewayTurnKey(input.providerConversationRef, input.turnId), active);
      this.activeByProviderTurn.set(providerTurnKey(input.providerConversationRef, providerTurnId), active);
      sink(ProviderEventSchema.parse({ kind: 'status', status: 'started' }));
    });
  }

  async interrupt(input: InterruptProviderTurn): Promise<void> {
    const active = this.active(input.providerConversationRef, input.turnId);
    await this.request('turn/interrupt', {
      threadId: active.providerConversationRef,
      turnId: active.providerTurnId,
    });
  }

  /** Process exit/restart clears only transient RPC and active-turn state. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.buffer = '';
    this.mcpConfiguredThreads.clear();
    for (const active of this.activeByGatewayTurn.values()) this.finish(active, 'disconnected');
    for (const pending of this.pending.values()) pending.reject(new Error('codex_app_server_closed'));
    this.pending.clear();
  }

  isClosed(): boolean {
    return this.closed;
  }

  receive(chunk: string): void {
    if (this.closed) return;
    this.buffer += chunk;
    const maxBytes = this.options.maxBytes ?? MAX_RPC_FRAME_BYTES;
    while (this.buffer.includes('\n')) {
      const index = this.buffer.indexOf('\n');
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      const lineBytes = Buffer.byteLength(line, 'utf8');
      if (lineBytes > maxBytes) {
        this.buffer = '';
        throw new CodexAppServerFramingError('codex_app_server_output_too_large', boundedFrameByteCount(lineBytes, maxBytes));
      }
      if (!line.trim()) continue;
      let message: RpcResponse;
      try { message = JSON.parse(line) as RpcResponse; }
      catch {
        this.buffer = '';
        throw new CodexAppServerFramingError('codex_app_server_output_invalid', boundedFrameByteCount(lineBytes, maxBytes));
      }
      if (message.id) this.resolveResponse(message);
      else if (message.method) this.handleNotification(message.method, message.params);
    }
    const bufferBytes = Buffer.byteLength(this.buffer, 'utf8');
    if (bufferBytes > maxBytes) {
      this.buffer = '';
      throw new CodexAppServerFramingError('codex_app_server_output_too_large', boundedFrameByteCount(bufferBytes, maxBytes));
    }
  }

  private ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      this.initialized = (async () => {
        await this.request('initialize', { clientInfo: { name: 'kiditem-agent-gateway', version: '1' }, capabilities: null });
        await this.notify('initialized', {});
      })();
    }
    return this.initialized;
  }

  private request(
    method: string,
    params: Record<string, unknown>,
    onResult?: (value: unknown) => void,
  ): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('codex_app_server_closed'));
    const id = randomUUID();
    const request = new Promise<unknown>((resolve, reject) => this.pending.set(id, { resolve, reject, onResult }));
    let write: void | Promise<void>;
    try {
      write = this.options.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    } catch {
      this.rejectWrite(id);
      return request;
    }
    void Promise.resolve(write).catch(() => {
      this.rejectWrite(id);
    });
    return request;
  }

  private rejectWrite(id: string): void {
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      pending.reject(new Error('codex_app_server_write_failed'));
  }

  private async notify(method: string, params: Record<string, unknown>): Promise<void> {
    if (this.closed) throw new Error('codex_app_server_closed');
    try {
      await this.options.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    } catch {
      throw new Error('codex_app_server_write_failed');
    }
  }

  private resolveResponse(response: RpcResponse): void {
    const pending = this.pending.get(response.id!);
    if (!pending) return;
    this.pending.delete(response.id!);
    if (response.error !== undefined) pending.reject(new Error('codex_app_server_remote_error'));
    else {
      try {
        // This runs while receive() still owns the parsed frame batch, before a
        // following turn/completed notification can be dispatched.
        pending.onResult?.(response.result);
        pending.resolve(response.result);
      } catch (error) {
        pending.reject(error instanceof Error ? error : new Error('codex_app_server_response_invalid'));
      }
    }
  }

  private handleNotification(method: string, params: unknown): void {
    const value = object(params);
    if (!value) return;
    if (method === 'item/agentMessage/delta') {
      const threadId = string(value.threadId);
      const turnId = string(value.turnId);
      const delta = string(value.delta);
      if (!threadId || !turnId || !delta) return;
      const active = this.activeByProviderTurn.get(providerTurnKey(threadId, turnId));
      if (active) active.sink(ProviderEventSchema.parse({ kind: 'assistant.delta', delta: bound(delta, 16_000) }));
      return;
    }
    if (method === 'item/started' || method === 'item/completed') {
      const threadId = string(value.threadId);
      const turnId = string(value.turnId);
      const active = threadId && turnId ? this.activeByProviderTurn.get(providerTurnKey(threadId, turnId)) : undefined;
      const item = object(value.item);
      const event = active ? mcpToolStatusEvent(item) : null;
      if (active && event) active.sink(event);
      const approval = active && method === 'item/completed' && item
        ? codexCapabilityApprovalRequiredEvent(item)
        : null;
      if (active && approval) active.sink(approval);
      return;
    }
    if (method !== 'turn/completed') return;
    const threadId = string(value.threadId);
    const turn = object(value.turn);
    const providerTurnId = string(turn?.id);
    const status = string(turn?.status);
    if (!threadId || !providerTurnId || !status) return;
    const active = this.activeByProviderTurn.get(providerTurnKey(threadId, providerTurnId));
    if (!active) return;
    this.finish(active, terminalStatus(status));
  }

  private active(providerConversationRef: string, gatewayTurnId: string): ActiveTurn {
    const active = this.activeByGatewayTurn.get(gatewayTurnKey(providerConversationRef, gatewayTurnId));
    if (!active) throw new Error('codex_turn_not_live');
    return active;
  }

  /** Remove before notifying so repeated provider terminal/close signals are idempotent. */
  private finish(active: ActiveTurn, status: 'completed' | 'failed' | 'interrupted' | 'disconnected'): void {
    this.activeByProviderTurn.delete(providerTurnKey(active.providerConversationRef, active.providerTurnId));
    this.activeByGatewayTurn.delete(gatewayTurnKey(active.providerConversationRef, active.gatewayTurnId));
    try {
      active.sink(ProviderEventSchema.parse({ kind: 'status', status }));
    } catch {
      // Local state must be released even if a control callback fails.
    }
  }

  private mcpConfig(conversationId: string): Record<string, unknown> {
    return {
      features: {
        mcp_2026_07_28: true,
      },
      mcp_servers: {
        kiditem: {
          url: this.options.mcpUrl,
          http_headers: {
            Authorization: `Bearer ${this.options.mcpTransportToken}`,
            [MCP_CONVERSATION_ID_HEADER]: conversationId,
          },
        },
      },
    };
  }
}

function toProviderConversation(value: Record<string, unknown>): ProviderConversationSummary {
  const providerConversationRef = requiredString(value.id, 'thread_id');
  const createdAt = isoSeconds(value.createdAt);
  const updatedAt = isoSeconds(value.updatedAt);
  return {
    providerConversationRef,
    title: bound(string(value.name) ?? 'New conversation', 200) || 'New conversation',
    createdAt,
    updatedAt,
  };
}

function requireThread(value: unknown): Record<string, unknown> {
  const thread = object(object(value)?.thread);
  if (!thread || !string(thread.id)) throw new Error('codex_app_server_thread_missing');
  return thread;
}

function assertFullAccess(value: unknown): void {
  const response = object(value);
  const sandbox = object(response?.sandbox);
  if (sandbox?.type !== 'dangerFullAccess' || response?.approvalPolicy !== 'never') {
    throw new Error('codex_app_server_permission_profile_mismatch');
  }
}

function textInput(text: string): Readonly<{ type: 'text'; text: string; text_elements: readonly [] }> {
  return { type: 'text', text, text_elements: [] };
}

function terminalStatus(status: string): 'completed' | 'failed' | 'interrupted' {
  if (status === 'completed') return 'completed';
  if (status === 'cancelled' || status === 'interrupted') return 'interrupted';
  return 'failed';
}

function boundedFrameByteCount(byteCount: number, maxBytes: number): number {
  return Math.min(byteCount, maxBytes + 1);
}

/** App-server item notifications may contain raw MCP arguments/results: expose neither. */
function mcpToolStatusEvent(item: Record<string, unknown> | null) {
  if (!item || item.type !== 'mcpToolCall') return null;
  const name = mcpToolName(item.server, item.tool);
  const status = mcpToolStatus(item.status);
  if (!name || !status) return null;
  return ProviderEventSchema.parse({ kind: 'tool.status', name, status });
}

function mcpToolName(server: unknown, tool: unknown): string | null {
  const serverName = safeToolSegment(server);
  const toolName = safeToolSegment(tool);
  if (!serverName || !toolName) return null;
  return `${serverName}.${toolName}`.slice(0, 200);
}

function safeToolSegment(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9_.:-]{1,100}$/.test(normalized) ? normalized : null;
}

function mcpToolStatus(value: unknown): 'started' | 'completed' | 'failed' | null {
  if (value === 'inProgress') return 'started';
  if (value === 'completed') return 'completed';
  if (value === 'failed') return 'failed';
  return null;
}

function gatewayTurnKey(providerConversationRef: string, gatewayTurnId: string): string {
  return `${providerConversationRef}\u0000${gatewayTurnId}`;
}

function providerTurnKey(providerConversationRef: string, providerTurnId: string): string {
  return `${providerConversationRef}\u0000${providerTurnId}`;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function requiredString(value: unknown, code: string): string {
  const result = string(value);
  if (!result) throw new Error(`codex_app_server_${code}_missing`);
  return result;
}

function isoSeconds(value: unknown): string {
  const seconds = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Date(seconds * 1_000).toISOString();
}

function bound(value: string, limit: number): string {
  return value.length <= limit ? value : value.slice(0, limit);
}
