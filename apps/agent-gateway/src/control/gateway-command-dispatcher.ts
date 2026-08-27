import {
  GatewayCommandSchema,
  ProviderEventSchema,
  type ConversationPreferences,
  type GatewayCommand,
  type ProviderEvent,
  type SetConversationPreferenceCommand,
} from '@kiditem/shared/agent-runtime';
import { createHash } from 'node:crypto';
import {
  ActiveTurnAlreadyLiveError,
  ActiveTurnCapacityError,
  ActiveTurnRegistry,
} from './internal/active-turn.registry';
import { GatewayEventOutbox } from './gateway-event-outbox';

type ConversationGatewayPort = Readonly<{
  list: (organizationId: string, runtime?: 'codex_cli' | 'claude_cli') => Promise<unknown[]>;
  create: (input: { organizationId: string; conversationId: string; runtime: 'codex_cli' | 'claude_cli'; agentKey: string | null; title: string }) => Promise<unknown>;
  assertAccessible: (input: { organizationId: string; conversationId: string }) => Promise<void>;
  rename: (input: { organizationId: string; conversationId: string; title: string }) => Promise<unknown>;
  delete: (input: { organizationId: string; conversationId: string }) => Promise<void>;
  startTurn: (input: {
    organizationId: string;
    conversationId: string;
    turnId: string;
    message: string;
    model: string;
    reasoningEffort: string;
    onEvent: (event: ProviderEvent) => void;
  }) => Promise<void>;
  /** Lifecycle restart cleanup deliberately has no request organization. */
  interrupt: (input: { organizationId?: string; conversationId: string; turnId: string }) => Promise<void>;
}>;

type ConversationPreferencePort = Readonly<{
  read: () => Promise<ConversationPreferences>;
  set: (input: SetConversationPreferenceCommand) => Promise<ConversationPreferences>;
}>;

const MAX_COMMAND_TOMBSTONES = 1_024;
const API_RUNTIME_TERMINAL_DEADLINE_MS = 10_000;

interface ApiRuntimeTerminalWait {
  readonly pending: Set<string>;
  readonly resolve: () => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class GatewayApiRuntimeTerminalTimeoutError extends Error {
  constructor() {
    super('gateway_api_runtime_terminal_timeout');
    this.name = 'GatewayApiRuntimeTerminalTimeoutError';
  }
}

/** Applies each process-local Gateway command at most once. No durable queue exists. */
export class GatewayCommandDispatcher {
  private readonly applied = new Map<string, string>();
  private readonly active: ActiveTurnRegistry;
  private readonly apiRuntimeTerminalDeadlineMs: number;
  private apiRuntimeTerminalWait: ApiRuntimeTerminalWait | null = null;

  constructor(private readonly options: Readonly<{
    gateway: ConversationGatewayPort;
    outbox: GatewayEventOutbox;
    preferences: ConversationPreferencePort;
    activeTurns?: ActiveTurnRegistry;
    terminalDeadlineMs?: number;
  }>) {
    this.active = options.activeTurns ?? new ActiveTurnRegistry();
    this.apiRuntimeTerminalDeadlineMs = options.terminalDeadlineMs ?? API_RUNTIME_TERMINAL_DEADLINE_MS;
    if (!Number.isSafeInteger(this.apiRuntimeTerminalDeadlineMs) || this.apiRuntimeTerminalDeadlineMs < 1) {
      throw new Error('gateway_api_runtime_terminal_deadline_invalid');
    }
  }

  async dispatch(input: GatewayCommand): Promise<void> {
    const command = GatewayCommandSchema.parse(input);
    const digest = commandDigest(command);
    const previous = this.applied.get(command.commandId);
    if (previous === digest) return;
    if (previous !== undefined) {
      this.reject(command.commandId, 'invalid_state');
      return;
    }
    try {
      await this.apply(command);
      this.remember(command.commandId, digest);
      this.options.outbox.enqueue({ kind: 'command.ack', commandId: command.commandId });
    } catch (error) {
      this.remember(command.commandId, digest);
      const code = rejectionCode(error);
      this.reject(command.commandId, code);
    }
  }

  /** Poll session loss/close releases all active local slots. Provider sinks may
   * subsequently repeat terminal events; registry release remains idempotent. */
  clear(): void {
    this.cancelApiRuntimeTerminalWait();
    this.active.clear();
    this.applied.clear();
  }

  /**
   * An API restart loses its active-turn authority. Stop every currently live
   * provider turn, retaining Gateway-local fences until each provider emits
   * its exact terminal. This never deletes or recreates a provider conversation.
   */
  async resetAfterApiRuntimeRegistration(): Promise<void> {
    const liveTurns = this.active.snapshot();
    if (!liveTurns.length) return;
    const terminals = this.waitForApiRuntimeTerminals(liveTurns);
    try {
      await Promise.all([
        Promise.all(liveTurns.map((turn) => this.options.gateway.interrupt(turn))),
        terminals,
      ]);
    } catch (error) {
      this.cancelApiRuntimeTerminalWait();
      throw error;
    }
  }

  private async apply(command: GatewayCommand): Promise<void> {
    switch (command.kind) {
      case 'conversation.list': {
        const conversations = await this.options.gateway.list(command.organizationId, command.runtime);
        this.options.outbox.enqueue({ kind: 'conversation.listed', commandId: command.commandId, conversations });
        return;
      }
      case 'conversation.create': {
        const conversation = await this.options.gateway.create({
          organizationId: command.organizationId,
          conversationId: command.conversationId,
          runtime: command.runtime,
          agentKey: command.agentKey,
          title: command.title,
        });
        this.options.outbox.enqueue({ kind: 'conversation.created', commandId: command.commandId, conversation });
        return;
      }
      case 'conversation.rename': {
        const conversation = await this.options.gateway.rename({ organizationId: command.organizationId, conversationId: command.conversationId, title: command.title });
        this.options.outbox.enqueue({ kind: 'conversation.renamed', commandId: command.commandId, conversation });
        return;
      }
      case 'conversation.delete': {
        await this.options.gateway.assertAccessible({ organizationId: command.organizationId, conversationId: command.conversationId });
        if (this.active.hasConversation(command.conversationId)) throw new ActiveTurnAlreadyLiveError();
        await this.options.gateway.delete({ organizationId: command.organizationId, conversationId: command.conversationId });
        this.options.outbox.enqueue({ kind: 'conversation.deleted', commandId: command.commandId, conversationId: command.conversationId });
        return;
      }
      case 'conversation.preferences.get': {
        const preferences = await this.options.preferences.read();
        this.options.outbox.enqueue({ kind: 'conversation.preferences.loaded', commandId: command.commandId, preferences });
        return;
      }
      case 'conversation.preferences.set': {
        const preferences = await this.options.preferences.set({
          context: command.context,
          runtime: command.runtime,
          model: command.model,
          reasoningEffort: command.reasoningEffort,
        });
        this.options.outbox.enqueue({ kind: 'conversation.preferences.updated', commandId: command.commandId, preferences });
        return;
      }
      case 'turn.start': return this.startTurn(command);
      case 'turn.interrupt': {
        await this.options.gateway.assertAccessible({ organizationId: command.organizationId, conversationId: command.conversationId });
        this.active.require(command);
        await this.options.gateway.interrupt({
          organizationId: command.organizationId,
          conversationId: command.conversationId,
          turnId: command.turnId,
        });
        return;
      }
    }
  }

  private async startTurn(command: Extract<GatewayCommand, { kind: 'turn.start' }>): Promise<void> {
    await this.options.gateway.assertAccessible({ organizationId: command.organizationId, conversationId: command.conversationId });
    this.active.admit(command);
    try {
      await this.options.gateway.startTurn({
        organizationId: command.organizationId,
        conversationId: command.conversationId,
        turnId: command.turnId,
        message: command.message,
        model: command.model,
        reasoningEffort: command.reasoningEffort,
        onEvent: (event) => this.providerEvent(command.conversationId, command.turnId, event),
      });
    } catch (error) {
      this.active.release(command);
      throw error;
    }
  }

  private providerEvent(conversationId: string, turnId: string, input: ProviderEvent): void {
    try {
      this.active.require({ conversationId, turnId });
    } catch {
      // A provider can race an interrupt/exit with a final delta. Once the
      // exact pair is terminal, no late stream data may cross the boundary.
      return;
    }
    const event = ProviderEventSchema.parse(input);
    this.options.outbox.enqueue({ kind: 'turn.event', conversationId, turnId, event });
    if (event.kind === 'status' && event.status !== 'started') this.terminal(conversationId, turnId, event.status);
  }

  private terminal(conversationId: string, turnId: string, status: 'completed' | 'failed' | 'interrupted' | 'disconnected'): void {
    // Nest may release its active-turn authority only after this exact
    // terminal is safely retained. Backpressure is a control-session failure,
    // not permission to drop the terminal and release this local fence.
    this.options.outbox.enqueue({ kind: 'turn.terminal', conversationId, turnId, status });
    if (!this.active.release({ conversationId, turnId })) return;
    this.completeApiRuntimeTerminal(conversationId, turnId);
  }

  private waitForApiRuntimeTerminals(liveTurns: readonly { conversationId: string; turnId: string }[]): Promise<void> {
    if (this.apiRuntimeTerminalWait) return Promise.reject(new Error('gateway_api_runtime_reset_pending'));
    const pending = new Set(liveTurns.map(turnKey));
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const wait = this.apiRuntimeTerminalWait;
        if (!wait || wait.pending !== pending) return;
        this.apiRuntimeTerminalWait = null;
        reject(new GatewayApiRuntimeTerminalTimeoutError());
      }, this.apiRuntimeTerminalDeadlineMs);
      this.apiRuntimeTerminalWait = { pending, resolve, timer };
    });
  }

  private completeApiRuntimeTerminal(conversationId: string, turnId: string): void {
    const wait = this.apiRuntimeTerminalWait;
    if (!wait) return;
    wait.pending.delete(turnKey({ conversationId, turnId }));
    if (wait.pending.size) return;
    this.apiRuntimeTerminalWait = null;
    clearTimeout(wait.timer);
    wait.resolve();
  }

  /** Control-session shutdown has already proved the provider process is gone. */
  private cancelApiRuntimeTerminalWait(): void {
    const wait = this.apiRuntimeTerminalWait;
    if (!wait) return;
    this.apiRuntimeTerminalWait = null;
    clearTimeout(wait.timer);
    wait.resolve();
  }

  private remember(commandId: string, serialized: string): void {
    this.applied.set(commandId, serialized);
    while (this.applied.size > MAX_COMMAND_TOMBSTONES) this.applied.delete(this.applied.keys().next().value as string);
  }

  private reject(commandId: string, code: 'capacity' | 'invalid_state' | 'not_found' | 'unsupported' | 'provider_error'): void {
    this.options.outbox.enqueue({ kind: 'command.rejected', commandId, code });
  }
}

function commandDigest(command: GatewayCommand): string {
  return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}

function rejectionCode(error: unknown): 'capacity' | 'invalid_state' | 'not_found' | 'unsupported' | 'provider_error' {
  if (error instanceof ActiveTurnCapacityError) return 'capacity';
  if (error instanceof ActiveTurnAlreadyLiveError) return 'invalid_state';
  if (error instanceof Error && error.message === 'gateway_conversation_create_conflict') return 'invalid_state';
  if (error instanceof Error && error.message === 'gateway_conversation_not_found') return 'not_found';
  if (error instanceof Error && (error.message.includes('_unsupported') || error.message.includes('_invalid'))) return 'unsupported';
  return 'provider_error';
}

function turnKey(input: { conversationId: string; turnId: string }): string {
  return `${input.conversationId}\u0000${input.turnId}`;
}
