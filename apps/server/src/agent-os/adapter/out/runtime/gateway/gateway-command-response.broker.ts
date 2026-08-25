import {
  GatewayCommandSchema,
  ProviderEventSchema,
  type GatewayCommand,
  type ProviderEvent,
  type GatewayEvent,
} from '@kiditem/shared/agent-runtime';
import { randomUUID } from 'node:crypto';

const MAX_PENDING_COMMANDS = 64;
const MAX_LIVE_TURN_STREAMS = 4;
const MAX_TURN_SUBSCRIBERS = 8;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface GatewayBrokerOwner {
  organizationId: string;
  initiatingUserId: string;
}

export interface GatewayBrokerTurnFence extends GatewayBrokerOwner {
  conversationId: string;
  turnId: string;
}

export interface GatewayBrokerRequest<T> {
  commandId: string;
  result: Promise<T>;
}

interface PendingCommand {
  readonly commandId: string;
  readonly kind: GatewayCommand['kind'];
  readonly owner: GatewayBrokerOwner;
  readonly conversationId?: string;
  readonly turnId?: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface TurnStream {
  readonly owner: GatewayBrokerOwner;
  readonly startCommandId: string;
  readonly subscribers: Map<number, (event: ProviderEvent) => void>;
}

/**
 * A bounded, process-memory handoff from Gateway control events to the future
 * conversation facade. It stores no transcripts: provider events are forwarded
 * only to live, owner-fenced subscribers and then discarded.
 */
export class GatewayCommandResponseBroker {
  private readonly pending = new Map<string, PendingCommand>();
  private readonly streams = new Map<string, TurnStream>();
  private subscriberId = 0;

  constructor(private readonly options: Readonly<{ timeoutMs?: number }> = {}) {}

  /** Stable command IDs originate in this in-memory control boundary. */
  nextCommandId(): string { return randomUUID(); }

  begin<T>(input: Readonly<{ command: GatewayCommand; organizationId: string; initiatingUserId: string }>): GatewayBrokerRequest<T> {
    const command = GatewayCommandSchema.parse(input.command);
    if (command.kind === 'turn.start') throw new Error('gateway_broker_turn_start_requires_fence');
    return this.register<T>({
      commandId: command.commandId,
      kind: command.kind,
      owner: owner(input),
      ...coordinates(command),
    });
  }

  /** Register before the queue emits a turn.start; the binding itself never enters this broker. */
  beginTurnStart(input: Readonly<GatewayBrokerTurnFence & { commandId: string }>): GatewayBrokerRequest<void> {
    if (!validIdentifier(input.commandId) || !validIdentifier(input.conversationId) || !validIdentifier(input.turnId)) {
      throw new Error('gateway_broker_request_invalid');
    }
    const key = turnKey(input.conversationId, input.turnId);
    if (this.streams.has(key) || this.streams.size >= MAX_LIVE_TURN_STREAMS) throw new Error('gateway_broker_turn_unavailable');
    const request = this.register<void>({
      commandId: input.commandId,
      kind: 'turn.start',
      owner: owner(input),
      conversationId: input.conversationId,
      turnId: input.turnId,
    });
    this.streams.set(key, { owner: owner(input), startCommandId: input.commandId, subscribers: new Map() });
    return request;
  }

  /** The transport ack only retires delivery; request/result correlation remains live. */
  acknowledge(commandId: string): void {
    const pending = this.pending.get(commandId);
    if (!pending) return;
    if (pending.kind === 'turn.input' || pending.kind === 'turn.interrupt') this.resolve(commandId, pending.kind, undefined);
  }

  reject(commandId: string, code: string): void {
    this.fail(commandId, `gateway_command_rejected_${code}`);
  }

  resolveConversationListed(event: Extract<GatewayEvent, { kind: 'conversation.listed' }>): void {
    this.resolve(event.commandId, 'conversation.list', event.conversations);
  }

  resolveConversationCreated(event: Extract<GatewayEvent, { kind: 'conversation.created' }>): void {
    this.resolve(event.commandId, 'conversation.create', event.conversation);
  }

  resolveConversationHistory(event: Extract<GatewayEvent, { kind: 'conversation.history' }>): void {
    this.resolve(event.commandId, 'conversation.history', event.messages, event.conversationId);
  }

  resolveConversationRenamed(event: Extract<GatewayEvent, { kind: 'conversation.renamed' }>): void {
    this.resolve(event.commandId, 'conversation.rename', event.conversation, event.conversation.id);
  }

  resolveConversationDeleted(event: Extract<GatewayEvent, { kind: 'conversation.deleted' }>): void {
    this.resolve(event.commandId, 'conversation.delete', undefined, event.conversationId);
  }

  publishTurnEvent(conversationId: string, turnId: string, input: ProviderEvent): void {
    const event = ProviderEventSchema.parse(input);
    const stream = this.streams.get(turnKey(conversationId, turnId));
    if (!stream) return;
    if (event.kind === 'status' && event.status !== 'started') {
      this.terminal(conversationId, turnId, event.status);
      return;
    }
    this.publish(stream, event);
    if (event.kind === 'status') this.resolve(stream.startCommandId, 'turn.start', undefined, conversationId);
  }

  terminal(conversationId: string, turnId: string, status: 'completed' | 'failed' | 'interrupted' | 'disconnected'): void {
    const key = turnKey(conversationId, turnId);
    const stream = this.streams.get(key);
    if (!stream) return;
    this.streams.delete(key);
    this.publish(stream, ProviderEventSchema.parse({ kind: 'status', status }));
    if (this.pending.has(stream.startCommandId)) this.fail(stream.startCommandId, 'gateway_turn_terminal_before_start');
  }

  subscribeTurn(input: GatewayBrokerTurnFence, sink: (event: ProviderEvent) => void): () => void {
    const stream = this.streams.get(turnKey(input.conversationId, input.turnId));
    if (!stream || !sameOwner(stream.owner, owner(input)) || stream.subscribers.size >= MAX_TURN_SUBSCRIBERS) {
      throw new Error('gateway_broker_fence_invalid');
    }
    const id = ++this.subscriberId;
    stream.subscribers.set(id, sink);
    return () => { stream.subscribers.delete(id); };
  }

  /** Gateway disconnect/replacement/restart rejects every pending request and closes live streams. */
  disconnect(): void {
    for (const stream of this.streams.values()) this.publish(stream, ProviderEventSchema.parse({ kind: 'status', status: 'disconnected' }));
    this.streams.clear();
    for (const commandId of [...this.pending.keys()]) this.fail(commandId, 'gateway_command_disconnected');
  }

  private register<T>(input: Readonly<{
    commandId: string;
    kind: GatewayCommand['kind'];
    owner: GatewayBrokerOwner;
    conversationId?: string;
    turnId?: string;
  }>): GatewayBrokerRequest<T> {
    if (!validIdentifier(input.commandId) || !validOwner(input.owner) || this.pending.has(input.commandId) || this.pending.size >= MAX_PENDING_COMMANDS) {
      throw new Error('gateway_broker_request_invalid');
    }
    let resolvePromise!: (value: T) => void;
    let rejectPromise!: (error: Error) => void;
    const result = new Promise<T>((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
    const timer = setTimeout(() => this.fail(input.commandId, 'gateway_command_timeout'), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.pending.set(input.commandId, {
      ...input,
      resolve: resolvePromise as (value: unknown) => void,
      reject: rejectPromise,
      timer,
    });
    return { commandId: input.commandId, result };
  }

  private resolve(commandId: string, expectedKind: GatewayCommand['kind'], value: unknown, conversationId?: string): void {
    const pending = this.pending.get(commandId);
    if (!pending || pending.kind !== expectedKind) return;
    if (pending.conversationId && pending.conversationId !== conversationId) {
      this.fail(commandId, 'gateway_broker_fence_invalid');
      return;
    }
    this.pending.delete(commandId);
    clearTimeout(pending.timer);
    pending.resolve(value);
  }

  private fail(commandId: string, code: string): void {
    const pending = this.pending.get(commandId);
    if (!pending) return;
    this.pending.delete(commandId);
    clearTimeout(pending.timer);
    if (pending.kind === 'turn.start' && pending.conversationId && pending.turnId) {
      const key = turnKey(pending.conversationId, pending.turnId);
      const stream = this.streams.get(key);
      if (stream) {
        this.streams.delete(key);
        this.publish(stream, ProviderEventSchema.parse({ kind: 'status', status: 'failed' }));
      }
    }
    pending.reject(new Error(code));
  }

  private publish(stream: TurnStream, event: ProviderEvent): void {
    for (const sink of stream.subscribers.values()) {
      try { sink(event); } catch { /* A consumer cannot retain or break the shared stream. */ }
    }
  }
}

function coordinates(command: GatewayCommand): Readonly<{ conversationId?: string; turnId?: string }> {
  return 'conversationId' in command
    ? { conversationId: command.conversationId, ...('turnId' in command ? { turnId: command.turnId } : {}) }
    : {};
}

function owner(input: GatewayBrokerOwner): GatewayBrokerOwner {
  return { organizationId: input.organizationId, initiatingUserId: input.initiatingUserId };
}

function sameOwner(left: GatewayBrokerOwner, right: GatewayBrokerOwner): boolean {
  return left.organizationId === right.organizationId && left.initiatingUserId === right.initiatingUserId;
}

function validOwner(input: GatewayBrokerOwner): boolean {
  return validIdentifier(input.organizationId) && validIdentifier(input.initiatingUserId);
}

function validIdentifier(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
}

function turnKey(conversationId: string, turnId: string): string {
  return `${conversationId}\u0000${turnId}`;
}
