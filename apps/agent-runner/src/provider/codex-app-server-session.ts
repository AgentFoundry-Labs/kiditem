import { randomUUID } from 'node:crypto';
import { AgentResultEnvelopeSchema, type AgentResultEnvelope } from '@kiditem/shared/agent-interaction';
import { agentResultOutputSchema } from './agent-result-output-schema';

type RpcResponse = { id?: string; method?: string; params?: unknown; result?: unknown; error?: { message?: string } };
type CodexTurnStatus = 'completed' | 'failed' | 'cancelled' | 'interrupted';

export type CodexAppServerEvent =
  | Readonly<{ kind: 'agent_message_delta'; turnId: string; delta: string }>
  | Readonly<{ kind: 'turn_completed'; turnId: string; status: CodexTurnStatus; result?: AgentResultEnvelope }>;

type DecodedEvent = CodexAppServerEvent & Readonly<{ threadId: string }>;
const MAX_PENDING_TURN_EVENTS = 64;

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
  private closed = false;

  constructor(
    private readonly write: (line: string) => void | Promise<void>,
    private readonly maxBytes = 64 * 1024,
    private readonly notification?: (event: CodexAppServerEvent) => void,
  ) {}

  async start(input: { model: string; cwd: string; prompt: string }): Promise<void> {
    await this.request('initialize', { clientInfo: { name: 'kiditem', version: '1' }, capabilities: null });
    await this.send(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })}\n`);
    const thread = await this.request('thread/start', {
      ephemeral: true,
      model: input.model,
      cwd: input.cwd,
      approvalPolicy: 'never',
    });
    this.threadId = requiredNestedId(thread, 'thread');
    if (requiredNestedId(thread, 'activePermissionProfile') !== ':workspace') throw new Error('codex_app_server_permission_profile_mismatch');
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

  /** Called by the supervised process boundary so no RPC can hang after app-server exits. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.buffer = '';
    this.threadId = null;
    this.turnId = null;
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
  const parsed = AgentResultEnvelopeSchema.safeParse(candidate);
  if (!parsed.success) throw new Error('codex_app_server_result_invalid');
  return parsed.data;
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
