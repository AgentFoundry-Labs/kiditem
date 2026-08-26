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
} from '../turn/active-turn.registry';
import { GatewayEventOutbox } from './gateway-event-outbox';

type ConversationGatewayPort = Readonly<{
  list: (runtime?: 'codex_cli' | 'claude_cli') => Promise<unknown[]>;
  create: (input: { conversationId: string; runtime: 'codex_cli' | 'claude_cli'; agentKey: string | null; title: string }) => Promise<unknown>;
  history: (conversationId: string) => Promise<unknown[]>;
  rename: (conversationId: string, title: string) => Promise<unknown>;
  delete: (conversationId: string) => Promise<void>;
  startTurn: (input: {
    conversationId: string;
    turnId: string;
    message: string;
    model: string;
    reasoningEffort: string;
    executionBinding: string;
    onEvent: (event: ProviderEvent) => void;
  }) => Promise<void>;
  sendInput: (input: { conversationId: string; turnId: string; message: string }) => Promise<void>;
  interrupt: (input: { conversationId: string; turnId: string }) => Promise<void>;
}>;

type ConversationPreferencePort = Readonly<{
  read: () => Promise<ConversationPreferences>;
  set: (input: SetConversationPreferenceCommand) => Promise<ConversationPreferences>;
}>;

const MAX_COMMAND_TOMBSTONES = 1_024;

/** Applies each process-local Gateway command at most once. No durable queue exists. */
export class GatewayCommandDispatcher {
  private readonly applied = new Map<string, string>();
  private readonly active: ActiveTurnRegistry;
  private readonly activeBindings = new Map<string, string>();

  constructor(private readonly options: Readonly<{
    gateway: ConversationGatewayPort;
    outbox: GatewayEventOutbox;
    preferences: ConversationPreferencePort;
    activeTurns?: ActiveTurnRegistry;
  }>) {
    this.active = options.activeTurns ?? new ActiveTurnRegistry();
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
      this.reject(command.commandId, rejectionCode(error));
    }
  }

  /** Poll session loss/close releases all active local slots. Provider sinks may
   * subsequently repeat terminal events; registry release remains idempotent. */
  clear(): void {
    this.active.clear();
    this.applied.clear();
    for (const binding of this.activeBindings.values()) this.options.outbox.forgetSecret(binding);
    this.activeBindings.clear();
  }

  private async apply(command: GatewayCommand): Promise<void> {
    switch (command.kind) {
      case 'conversation.list': {
        const conversations = await this.options.gateway.list(command.runtime);
        this.options.outbox.enqueue({ kind: 'conversation.listed', commandId: command.commandId, conversations });
        return;
      }
      case 'conversation.create': {
        const conversation = await this.options.gateway.create({
          conversationId: command.conversationId,
          runtime: command.runtime,
          agentKey: command.agentKey,
          title: command.title,
        });
        this.options.outbox.enqueue({ kind: 'conversation.created', commandId: command.commandId, conversation });
        return;
      }
      case 'conversation.history': {
        const messages = await this.options.gateway.history(command.conversationId);
        this.options.outbox.enqueue({ kind: 'conversation.history', commandId: command.commandId, conversationId: command.conversationId, messages });
        return;
      }
      case 'conversation.rename': {
        const conversation = await this.options.gateway.rename(command.conversationId, command.title);
        this.options.outbox.enqueue({ kind: 'conversation.renamed', commandId: command.commandId, conversation });
        return;
      }
      case 'conversation.delete': {
        if (this.active.hasConversation(command.conversationId)) throw new ActiveTurnAlreadyLiveError();
        await this.options.gateway.delete(command.conversationId);
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
      case 'turn.input': {
        this.active.require(command);
        await this.options.gateway.sendInput(command);
        return;
      }
      case 'turn.interrupt': {
        this.active.require(command);
        await this.options.gateway.interrupt(command);
        this.terminal(command.conversationId, command.turnId, 'interrupted');
        return;
      }
    }
  }

  private async startTurn(command: Extract<GatewayCommand, { kind: 'turn.start' }>): Promise<void> {
    this.active.admit(command);
    const key = activeTurnKey(command.conversationId, command.turnId);
    this.activeBindings.set(key, command.executionBinding);
    this.options.outbox.registerSecret(command.executionBinding);
    try {
      await this.options.gateway.startTurn({
        conversationId: command.conversationId,
        turnId: command.turnId,
        message: command.message,
        model: command.model,
        reasoningEffort: command.reasoningEffort,
        executionBinding: command.executionBinding,
        onEvent: (event) => this.providerEvent(command.conversationId, command.turnId, event),
      });
    } catch (error) {
      this.active.release(command);
      this.activeBindings.delete(key);
      this.options.outbox.forgetSecret(command.executionBinding);
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
    if (!this.active.release({ conversationId, turnId })) return;
    this.options.outbox.enqueue({ kind: 'turn.terminal', conversationId, turnId, status });
    const key = activeTurnKey(conversationId, turnId);
    const binding = this.activeBindings.get(key);
    this.activeBindings.delete(key);
    if (binding) this.options.outbox.forgetSecret(binding);
  }

  private remember(commandId: string, serialized: string): void {
    this.applied.set(commandId, serialized);
    while (this.applied.size > MAX_COMMAND_TOMBSTONES) this.applied.delete(this.applied.keys().next().value as string);
  }

  private reject(commandId: string, code: 'capacity' | 'invalid_state' | 'unsupported' | 'provider_error'): void {
    this.options.outbox.enqueue({ kind: 'command.rejected', commandId, code });
  }
}

function commandDigest(command: GatewayCommand): string {
  return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}

function activeTurnKey(conversationId: string, turnId: string): string {
  return `${conversationId}\u0000${turnId}`;
}

function rejectionCode(error: unknown): 'capacity' | 'invalid_state' | 'unsupported' | 'provider_error' {
  if (error instanceof ActiveTurnCapacityError) return 'capacity';
  if (error instanceof ActiveTurnAlreadyLiveError) return 'invalid_state';
  if (error instanceof Error && error.message === 'gateway_conversation_create_conflict') return 'invalid_state';
  if (error instanceof Error && (error.message.includes('_unsupported') || error.message.includes('_invalid'))) return 'unsupported';
  return 'provider_error';
}
