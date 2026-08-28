import { Injectable, Inject } from '@nestjs/common';
import {
  AgentKeySchema,
  type ConversationPreferences,
  type ConversationSummary,
  type CreateConversationCommand,
  type SetConversationPreferenceCommand,
} from '@kiditem/shared/agent-runtime';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';
import {
  type ConversationCoordinates,
  type ConversationLiveTurn,
  type ConversationOwner,
  type ConversationPort,
  type ConversationStopCoordinates,
  CONVERSATION_TURN_ID_FACTORY,
  type ConversationTurnIdFactory,
  type ConversationTurnCoordinates,
} from '../port/in/capability/conversation.port';
import {
  GATEWAY_CONVERSATION_PORT,
  type GatewayConversationPort,
  type GatewayLiveTurn,
} from '../port/out/gateway-conversation.port';
import {
  CONVERSATION_EVENT_HISTORY_PORT,
  type ConversationEventHistoryPort,
} from '../port/out/history/conversation-event-history.port';

interface StoredTurn extends ConversationTurnCoordinates {
  interruptRequested: boolean;
}

type CreateConversationInput = ConversationOwner & CreateConversationCommand;

type StartConversationInput = ConversationCoordinates & {
  turnId?: string;
  message: string;
  model: string;
  reasoningEffort: string;
};

/**
 * An organization-scoped facade over the installed Gateway. Nest's transient
 * organization+conversation turn map is the execution authority; completed
 * AG-UI event history is a distinct adapter-local SQLite concern.
 */
@Injectable()
export class ConversationService implements ConversationPort {
  private readonly turns = new Map<string, StoredTurn>();

  constructor(
    @Inject(GATEWAY_CONVERSATION_PORT)
    private readonly gateway: GatewayConversationPort,
    @Inject(CONVERSATION_EVENT_HISTORY_PORT)
    private readonly eventHistory: ConversationEventHistoryPort,
    @Inject(CONVERSATION_TURN_ID_FACTORY)
    private readonly nextTurnId: ConversationTurnIdFactory,
  ) {}

  async list(input: ConversationOwner): Promise<ConversationSummary[]> {
    assertOwner(input);
    const summaries = await this.gateway.list(input);
    for (const summary of summaries) {
      assertAgent(summary.agentKey);
    }
    return summaries;
  }

  async create(input: CreateConversationInput): Promise<ConversationSummary> {
    assertOwner(input);
    assertCreateInput(input);
    const agentKey = parseAgent(input.agentKey);
    const summary = await this.gateway.create({
      ...copyOwner(input),
      conversationId: input.conversationId,
      runtime: input.runtime,
      agentKey,
      title: input.title,
    });
    if (summary.id !== input.conversationId) throw new AgentOsRuntimeError('conversation_not_found');
    assertAgent(summary.agentKey);
    return summary;
  }

  async preferences(input: ConversationOwner): Promise<ConversationPreferences> {
    assertOwner(input);
    return this.gateway.preferences(copyOwner(input));
  }

  async setPreference(input: ConversationOwner & SetConversationPreferenceCommand): Promise<ConversationPreferences> {
    assertOwner(input);
    assertPreferenceSettings(input);
    this.requireReadiness(input.runtime, input.model, input.reasoningEffort);
    return this.gateway.setPreference({
      ...copyOwner(input),
      context: input.context,
      runtime: input.runtime,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    });
  }

  async assertAccessible(input: ConversationCoordinates): Promise<void> {
    await this.requireConversation(input);
  }

  async isRunning(input: ConversationCoordinates): Promise<boolean> {
    assertConversation(input);
    return this.turns.has(activeTurnKey(input));
  }

  async stop(input: ConversationStopCoordinates): Promise<boolean> {
    assertConversation(input);
    await this.requireConversation(input);
    const turn = this.turns.get(activeTurnKey(input));
    if (input.expectedTurnId !== undefined && turn?.turnId !== input.expectedTurnId) return false;
    if (!turn || turn.interruptRequested) return false;
    turn.interruptRequested = true;
    try {
      await this.gateway.interrupt(turnCoordinates(turn));
    } catch (error) {
      if (this.turns.get(activeTurnKey(turn)) === turn) turn.interruptRequested = false;
      throw error;
    }
    return true;
  }

  async rename(input: ConversationCoordinates & { title: string }): Promise<ConversationSummary> {
    assertConversation(input);
    const summary = await this.gateway.rename(input);
    assertAgent(summary.agentKey);
    return summary;
  }

  async delete(input: ConversationCoordinates): Promise<void> {
    assertConversation(input);
    if (this.turns.has(activeTurnKey(input))) throw new AgentOsRuntimeError('conversation_turn_live');
    let alreadyAbsent: AgentOsRuntimeError | null = null;
    try {
      await this.gateway.delete(input);
    } catch (error) {
      if (!(error instanceof AgentOsRuntimeError) || error.code !== 'conversation_not_found') throw error;
      alreadyAbsent = error;
    }
    this.eventHistory.delete(input, { conversationId: input.conversationId });
    this.turns.delete(activeTurnKey(input));
    if (alreadyAbsent) throw alreadyAbsent;
  }

  async start(input: StartConversationInput): Promise<ConversationLiveTurn> {
    const conversation = await this.requireConversation(input);
    assertTurnSettings(input);
    this.requireReadiness(conversation.runtime, input.model, input.reasoningEffort);
    if (this.turns.has(activeTurnKey(input))) throw new AgentOsRuntimeError('conversation_turn_live');
    const turnId = input.turnId ?? this.nextTurnId();
    const gatewayTurn = this.gateway.start({
      ...copyOwner(input),
      conversationId: input.conversationId,
      turnId,
      message: input.message,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    });
    const coordinates: StoredTurn = {
      ...copyOwner(input),
      conversationId: input.conversationId,
      turnId,
      interruptRequested: false,
    };
    this.turns.set(activeTurnKey(coordinates), coordinates);
    let unsubscribeLifecycle: (() => void) | null = null;
    let terminalBeforeSubscriptionReturned = false;
    const lifecycleSubscription = gatewayTurn.subscribe((event) => {
      if (event.kind === 'status' && event.status !== 'started') {
        this.clearTurn(coordinates);
        if (unsubscribeLifecycle) {
          const cleanup = unsubscribeLifecycle;
          unsubscribeLifecycle = null;
          cleanup();
        } else {
          terminalBeforeSubscriptionReturned = true;
        }
      }
    });
    unsubscribeLifecycle = lifecycleSubscription;
    if (terminalBeforeSubscriptionReturned) {
      unsubscribeLifecycle = null;
      lifecycleSubscription();
    }
    return this.bindLiveTurn(gatewayTurn, coordinates);
  }

  readiness() {
    return this.gateway.readiness();
  }

  private bindLiveTurn(turn: GatewayLiveTurn, coordinates: ConversationTurnCoordinates): ConversationLiveTurn {
    void turn.ready.catch(() => {
      this.clearTurn(coordinates);
    });
    return {
      turnId: turn.turnId,
      ready: turn.ready,
      subscribe: (sink) => turn.subscribe((event) => {
        if (event.kind === 'status' && event.status !== 'started') {
          this.clearTurn(coordinates);
        }
        sink(event);
      }),
    };
  }

  private async requireConversation(input: ConversationCoordinates): Promise<ConversationSummary> {
    assertConversation(input);
    const conversations = await this.gateway.list(copyOwner(input));
    const conversation = conversations.find((summary) => summary.id === input.conversationId);
    if (!conversation) {
      throw new AgentOsRuntimeError('conversation_not_found');
    }
    assertAgent(conversation.agentKey);
    return conversation;
  }

  private clearTurn(coordinates: ConversationTurnCoordinates): void {
    const key = activeTurnKey(coordinates);
    if (sameTurn(this.turns.get(key), coordinates)) this.turns.delete(key);
  }

  private requireReadiness(runtime: ConversationSummary['runtime'], model: string, reasoningEffort: string): void {
    const runtimeReadiness = this.gateway.readiness()?.find((entry) => entry.runtime === runtime);
    if (!runtimeReadiness?.ready) throw new AgentOsRuntimeError('conversation_gateway_unavailable');
    const modelReadiness = runtimeReadiness.readiness.modelReasoningEfforts.find((entry) => entry.model === model);
    if (!modelReadiness) throw new AgentOsRuntimeError('conversation_model_unsupported');
    if (!modelReadiness.reasoningEfforts.includes(reasoningEffort)) {
      throw new AgentOsRuntimeError('conversation_reasoning_effort_unsupported');
    }
  }
}

function assertOwner(input: ConversationOwner): void {
  if (!validIdentifier(input.organizationId) || !validIdentifier(input.userId)) {
    throw new AgentOsRuntimeError('conversation_owner_invalid');
  }
}

function assertConversation(input: ConversationCoordinates): void {
  assertOwner(input);
  if (!validIdentifier(input.conversationId)) throw new AgentOsRuntimeError('conversation_not_found');
}

function assertTurn(input: ConversationTurnCoordinates): void {
  assertConversation(input);
  if (!validIdentifier(input.turnId)) throw new AgentOsRuntimeError('conversation_not_found');
}

function assertAgent(agentKey: string | null): void {
  parseAgent(agentKey);
}

function parseAgent(agentKey: string | null) {
  if (agentKey === null) return null;
  const parsed = AgentKeySchema.safeParse(agentKey);
  if (!parsed.success) throw new AgentOsRuntimeError('conversation_agent_invalid');
  return parsed.data;
}

function assertTurnSettings(input: StartConversationInput): void {
  if (!validIdentifier(input.message)) throw new AgentOsRuntimeError('conversation_message_required');
  if (!validIdentifier(input.model)) throw new AgentOsRuntimeError('conversation_model_required');
  if (!validIdentifier(input.reasoningEffort)) throw new AgentOsRuntimeError('conversation_reasoning_effort_required');
}

function assertCreateInput(input: CreateConversationInput): void {
  if (!validIdentifier(input.conversationId)) throw new AgentOsRuntimeError('conversation_id_required');
  if (!validIdentifier(input.title)) throw new AgentOsRuntimeError('conversation_title_required');
}

function assertPreferenceSettings(input: SetConversationPreferenceCommand): void {
  if (!validIdentifier(input.model)) throw new AgentOsRuntimeError('conversation_model_required');
  if (!validIdentifier(input.reasoningEffort)) throw new AgentOsRuntimeError('conversation_reasoning_effort_required');
}

function validIdentifier(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function copyOwner(input: ConversationOwner): ConversationOwner {
  return { organizationId: input.organizationId, userId: input.userId };
}

function turnCoordinates(input: ConversationTurnCoordinates): ConversationTurnCoordinates {
  return {
    organizationId: input.organizationId,
    userId: input.userId,
    conversationId: input.conversationId,
    turnId: input.turnId,
  };
}

function sameOwner(left: ConversationOwner, right: ConversationOwner): boolean {
  return left.organizationId === right.organizationId && left.userId === right.userId;
}

function sameTurn(left: ConversationTurnCoordinates | undefined, right: ConversationTurnCoordinates): boolean {
  return Boolean(left && sameOwner(left, right) && left.conversationId === right.conversationId && left.turnId === right.turnId);
}

function activeTurnKey(input: ConversationCoordinates): string {
  return `${input.organizationId}\u0000${input.conversationId}`;
}
