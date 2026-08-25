import { randomUUID } from 'node:crypto';
import { AgentResultEnvelopeSchema, type AgentResultEnvelope } from '@kiditem/shared/agent-interaction';
import { agentResultOutputSchema, normalizeProviderWireAgentResult } from './agent-result-output-schema';

type RpcResponse = { id?: string; method?: string; params?: unknown; result?: unknown; error?: { message?: string } };
type CodexTurnStatus = 'completed' | 'failed' | 'cancelled' | 'interrupted';

export type CodexAppServerEvent =
  | Readonly<{ kind: 'agent_message_delta'; turnId: string; delta: string }>
  | Readonly<{ kind: 'turn_completed'; turnId: string; status: CodexTurnStatus; result?: AgentResultEnvelope }>;

type DecodedEvent = CodexAppServerEvent & Readonly<{ threadId: string }>;
const MAX_PENDING_TURN_EVENTS = 64;
const READINESS_MCP_SERVER = 'kiditem_attempt';
const READINESS_MCP_TOOL = 'readiness_probe';
const TOOL_HIDDEN_READINESS_PROVIDER_CONFIG = Object.freeze({
  mcp_servers: Object.freeze({
    [READINESS_MCP_SERVER]: Object.freeze({ disabled_tools: Object.freeze([READINESS_MCP_TOOL]) }),
  }),
});

/** Memory-only JSON-RPC steering for one ephemeral Codex app-server Attempt. */
export class CodexAppServerSession {
  private readonly pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  private buffer = '';
  private threadId: string | null = null;
  private turnId: string | null = null;
  private waitingForTurnStart = false;
  private resolveEarlyTurnCompletion: (() => void) | null = null;
  private earlyTurnCompletionDelivered = false;
  private readonly pendingTurnEvents: DecodedEvent[] = [];
  private readinessProbe: Readonly<{ threadId: string; nonce: string }> | null = null;
  private closed = false;

  constructor(
    private readonly write: (line: string) => void | Promise<void>,
    private readonly maxBytes = 64 * 1024,
    private readonly notification?: (event: CodexAppServerEvent) => void,
  ) {}

  async start(input: { model: string; cwd: string; prompt: string; readinessProbeNonce?: string }): Promise<void> {
    await this.request('initialize', { clientInfo: { name: 'kiditem', version: '1' }, capabilities: null });
    await this.send(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })}\n`);
    if (input.readinessProbeNonce) {
      this.threadId = await this.startThread(input, TOOL_HIDDEN_READINESS_PROVIDER_CONFIG);
      this.readinessProbe = Object.freeze({ threadId: await this.startThread(input), nonce: input.readinessProbeNonce });
    } else {
      this.threadId = await this.startThread(input);
    }
    this.waitingForTurnStart = true;
    const earlyCompletion = new Promise<void>((resolve) => { this.resolveEarlyTurnCompletion = resolve; });
    const turnRequest = this.request('turn/start', {
      threadId: this.threadId,
      input: [textInput(input.prompt)],
      outputSchema: agentResultOutputSchema(),
    });
    try {
      const started = await Promise.race([
        turnRequest.then((turn) => ({ kind: 'started' as const, turn })),
        earlyCompletion.then(() => ({ kind: 'completed' as const })),
      ]);
      if (started.kind === 'completed') {
        // The app-server can emit a definitive failed/cancelled/interrupted
        // turn and exit before replying to turn/start. Its structured terminal
        // notification is sufficient to finish the Attempt; suppress only the
        // dangling RPC rejection, never the notification.
        void turnRequest.catch(() => undefined);
        return;
      }
      const turn = started.turn;
      this.turnId = requiredNestedId(turn, 'turn');
      this.flushPendingTurnEvents();
    } catch (error) {
      this.pendingTurnEvents.length = 0;
      throw error;
    } finally {
      this.waitingForTurnStart = false;
      this.resolveEarlyTurnCompletion = null;
    }
  }

  async steer(message: string): Promise<void> {
    if (!this.threadId || !this.turnId) throw new Error('codex_turn_not_live');
    await this.request('turn/steer', { threadId: this.threadId, expectedTurnId: this.turnId, input: [textInput(message)] });
  }

  async interrupt(): Promise<void> {
    if (this.threadId && this.turnId) await this.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId });
  }

  /**
   * The readiness provider turn is intentionally tool-hidden. Runner invokes
   * this fixed control-plane proof only after its strict result is complete.
   */
  async completeReadinessProbe(): Promise<void> {
    const probe = this.readinessProbe;
    if (!probe) throw new Error('codex_readiness_probe_not_pending');
    await this.probeReadiness(probe.threadId, probe.nonce);
    this.readinessProbe = null;
  }

  /** Called by the supervised process boundary so no RPC can hang after app-server exits. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.buffer = '';
    this.threadId = null;
    this.turnId = null;
    this.readinessProbe = null;
    this.waitingForTurnStart = false;
    this.resolveEarlyTurnCompletion = null;
    this.pendingTurnEvents.length = 0;
    for (const pending of this.pending.values()) pending.reject(new Error('codex_app_server_closed'));
    this.pending.clear();
  }

  receive(chunk: string): void {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer, 'utf8') > this.maxBytes) throw new Error('codex_app_server_output_too_large');
    while (this.buffer.includes('\n')) {
      const index = this.buffer.indexOf('\n'); const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
      if (!line.trim()) continue;
      let response: RpcResponse;
      try { response = JSON.parse(line) as RpcResponse; } catch { throw new Error('codex_app_server_output_invalid'); }
      if (!response.id) {
        if (!response.method) continue;
        const event = decodeNotification(response.method, response.params);
        if (!event || event.threadId !== this.threadId) continue;
        if (!this.turnId) {
          if (!this.waitingForTurnStart) continue;
          if (event.kind === 'turn_completed') this.publishEarlyTurnCompletion(event);
          else this.rememberPendingTurnEvent(event);
          continue;
        }
        if (event.turnId !== this.turnId) continue;
        this.publish(event);
        continue;
      }
      const pending = this.pending.get(response.id); if (!pending) continue;
      this.pending.delete(response.id);
      if (response.error) pending.reject(new Error('codex_app_server_remote_error')); else pending.resolve(response.result);
    }
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('codex_app_server_closed'));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      void this.send(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`).catch(() => {
        if (this.pending.delete(id)) reject(new Error('codex_app_server_write_failed'));
      });
    });
  }

  private async send(line: string): Promise<void> {
    if (this.closed) throw new Error('codex_app_server_closed');
    await this.write(line);
  }

  /**
   * The canary's MCP authority is fixed in Runner code. Nest provides only a
   * validated ephemeral nonce, so it cannot choose a server, tool, or argument
   * shape for an app-server control-plane invocation.
   */
  private async startThread(
    input: Readonly<{ model: string; cwd: string }>,
    config?: Readonly<Record<string, unknown>>,
  ): Promise<string> {
    const thread = await this.request('thread/start', {
      ephemeral: true,
      model: input.model,
      cwd: input.cwd,
      approvalPolicy: 'never',
      ...(config ? { config } : {}),
    });
    const threadId = requiredNestedId(thread, 'thread');
    if (requiredNestedId(thread, 'activePermissionProfile') !== ':danger-full-access') throw new Error('codex_app_server_permission_profile_mismatch');
    return threadId;
  }

  private async probeReadiness(threadId: string, nonce: string): Promise<void> {
    const result = await this.request('mcpServer/tool/call', {
      threadId,
      server: READINESS_MCP_SERVER,
      tool: READINESS_MCP_TOOL,
      arguments: { nonce },
    });
    if (!isStrictReadinessProbeResult(result, nonce)) throw new Error('codex_readiness_probe_invalid');
  }

  private rememberPendingTurnEvent(event: DecodedEvent): void {
    if (this.pendingTurnEvents.length >= MAX_PENDING_TURN_EVENTS) throw new Error('codex_app_server_pending_events_exceeded');
    this.pendingTurnEvents.push(event);
  }

  private flushPendingTurnEvents(): void {
    const pending = this.pendingTurnEvents.splice(0);
    for (const event of pending) {
      if (!this.turnId || event.threadId !== this.threadId || event.turnId !== this.turnId) continue;
      this.publish(event);
    }
  }

  private publishEarlyTurnCompletion(event: DecodedEvent & Extract<CodexAppServerEvent, { kind: 'turn_completed' }>): void {
    if (this.earlyTurnCompletionDelivered) return;
    this.earlyTurnCompletionDelivered = true;
    this.pendingTurnEvents.length = 0;
    this.publish(event);
    this.resolveEarlyTurnCompletion?.();
  }

  private publish(event: DecodedEvent): void {
    if (event.kind === 'turn_completed') this.turnId = null;
    const { threadId: _threadId, ...publicEvent } = event;
    this.notification?.(publicEvent);
  }
}

function textInput(text: string): Readonly<{ type: 'text'; text: string; text_elements: readonly [] }> {
  return { type: 'text', text, text_elements: [] };
}

function decodeNotification(method: string, params: unknown): DecodedEvent | null {
  // App-server emits process-level notices while it initializes.  They carry
  // no turn identity and are neither agent output nor completion signals.
  if (method !== 'item/agentMessage/delta' && method !== 'turn/completed') return null;
  const value = object(params);
  if (!value) throw new Error('codex_app_server_notification_invalid');
  const threadId = requiredString(value.threadId, 'thread');
  if (method === 'item/agentMessage/delta') {
    const turnId = requiredString(value.turnId, 'turn');
    const delta = requiredString(value.delta, 'delta');
    return { kind: 'agent_message_delta', threadId, turnId, delta };
  }
  if (method !== 'turn/completed') return null;
  const turn = object(value.turn);
  if (!turn) throw new Error('codex_app_server_turn_missing');
  const turnId = requiredString(turn.id, 'turn');
  const status = turn.status;
  if (status !== 'completed' && status !== 'failed' && status !== 'cancelled' && status !== 'interrupted') throw new Error('codex_app_server_turn_status_invalid');
  if (status !== 'completed') return { kind: 'turn_completed', threadId, turnId, status };
  const result = parseCompletedResult(turn.items);
  return { kind: 'turn_completed', threadId, turnId, status, result };
}

function parseCompletedResult(items: unknown): AgentResultEnvelope {
  if (!Array.isArray(items)) throw new Error('codex_app_server_turn_items_missing');
  const text = [...items].reverse().map(object).find((item) => item?.type === 'agentMessage' && typeof item.text === 'string')?.text;
  if (typeof text !== 'string') throw new Error('codex_app_server_result_missing');
  let candidate: unknown;
  try { candidate = JSON.parse(text); } catch { throw new Error('codex_app_server_result_invalid'); }
  const parsed = AgentResultEnvelopeSchema.safeParse(normalizeProviderWireAgentResult(candidate));
  if (!parsed.success) throw new Error('codex_app_server_result_invalid');
  return parsed.data;
}

function isStrictReadinessProbeResult(value: unknown, nonce: string): boolean {
  const result = object(value);
  if (!result || result.isError === true || !Array.isArray(result.content) || result.content.length !== 1) return false;
  const structured = object(result.structuredContent);
  return !!structured && Object.keys(structured).length === 1 && structured.nonce === nonce;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function requiredString(value: unknown, key: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`codex_app_server_${key}_missing`);
  return value;
}

function requiredNestedId(value: unknown, key: 'thread' | 'turn' | 'activePermissionProfile'): string {
  const id = object(value)?.[key];
  return requiredString(object(id)?.id, `${key}_id`);
}
